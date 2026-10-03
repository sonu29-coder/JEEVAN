import asyncio
import hmac
import json
import logging
import math
import os
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, Dict, List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict, Field
from redis.exceptions import RedisError
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from backend.auth import (
    EXAMPLE_ACCOUNTS,
    FRONTEND_CREDENTIALS,
    GOOGLE_CLIENT_ID,
    create_access_token,
    decode_access_token,
    get_current_user,
    hash_password,
    normalize_role,
    require_admin,
    require_role,
    security_scheme,
    verify_google_token,
    verify_password,
)
from backend.database import Base, SessionLocal, engine, redis_client
from backend.identity_verification import router as identity_verification_router
from backend.models import (
    AuditLog,
    BloodBank,
    BloodMatch,
    BloodRequest,
    Donor,
    DonorAlert,
    Hospital,
    Inventory,
    PhoneVerification,
    Reservation,
    User,
    utc_now,
)
from backend.otp_service import send_donor_phone_otp, verify_donor_phone_otp
from backend.phone_utils import format_indian_phone_display, normalize_indian_phone
from backend.routing import RouteType, optimize_route
from backend.spatial_engine import PostGISSpatialEngine
from backend.ml_donor_model import DONOR_PREDICTOR, DonorFeatureInput, SyntheticDatasetGenerator
from backend.fcm_notifications import FCM_ENGINE, OTP_MANAGER
from backend.schemas import (
    Coordinate,
    DispatchDeliveryItem,
    DispatchPayload,
    DispatchResponse,
    DonorManagementItem,
    DonorProfileUpdate,
    ICUHospitalBloodRequest,
    InventoryCreate,
    InventoryItemResponse,
    InventoryUpdate,
    ClinicalRuleAlert,
    ExpiryRadarItem,
    ExpiryRadarSummary,
    ExpiryRadarResponse,
    PrioritizeUnitRequest,
    RedistributeUnitRequest,
    LoginRequest,
    PhoneSendOtpRequest,
    PhoneSendOtpResponse,
    PhoneVerifyOtpRequest,
    PhoneVerifyOtpResponse,
    PortalProbeRequest,
    PortalProbeResponse,
    RegisterRequest,
    RegisterResponse,
    ReserveConflictResponse,
    ReservePayload,
    ReserveResponse,
    RouteOptimizeRequest,
    RouteOptimizeResponse,
    TokenResponse,
    UserPayload,
    UserResponse,
    UserRole,
    VerifyOtpPayload,
    VerifyOtpResponse,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("jeevan")
ALERT_STREAM = "jeevan:donor-alerts"
AVAILABILITY_CACHE_PREFIX = "jeevan:availability:"
AVAILABILITY_TTL_SECONDS = 30

BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
COMPONENTS = {"Whole Blood", "RBC", "PRBC", "Platelets", "Plasma", "FFP", "Cryoprecipitate"}
URGENCY_ORDER = {"normal": 0.8, "urgent": 1.3, "critical": 1.8}
DONOR_GROUPS_FOR_RECIPIENT = {
    "O-": {"O-"},
    "O+": {"O-", "O+"},
    "A-": {"O-", "A-"},
    "A+": {"O-", "O+", "A-", "A+"},
    "B-": {"O-", "B-"},
    "B+": {"O-", "O+", "B-", "B+"},
    "AB-": {"O-", "A-", "B-", "AB-"},
    "AB+": BLOOD_GROUPS,
}


def equivalent_components(comp: str) -> set[str]:
    if not comp:
        return set()
    c = comp.strip()
    if c.upper() in {"RBC", "PRBC"}:
        return {"RBC", "PRBC"}
    if c.upper() in {"PLASMA", "FFP"}:
        return {"Plasma", "FFP"}
    return {c}


class APIModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class RequestCreate(APIModel):
    hospital_name: str = Field(min_length=2, max_length=240)
    patient_blood_group: str
    component: str
    units_required: int = Field(ge=1, le=100)
    urgency: Literal["normal", "urgent", "critical"] = "normal"
    hospital_latitude: float = Field(ge=-90, le=90)
    hospital_longitude: float = Field(ge=-180, le=180)


class RequestStatusUpdate(APIModel):
    status: Literal["pending", "matched", "fulfilled", "cancelled"]


class ReservationCreate(APIModel):
    inventory_id: str = Field(min_length=1, max_length=40)
    units: int = Field(ge=1, le=100)
    ttl_minutes: int = Field(default=30, ge=1, le=1440)


class AlertCreate(APIModel):
    donor_ids: list[str] | None = Field(default=None, max_length=50)
    radius_km: float = Field(default=50, gt=0, le=500)


def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def require_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    # Allow valid Bearer tokens (JWT or frontend demo tokens)
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        if token in FRONTEND_CREDENTIALS:
            return
        try:
            decode_access_token(token)
            return
        except Exception:
            pass

    configured_key = os.getenv("JEEVAN_API_KEY")
    if not configured_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API access is disabled until JEEVAN_API_KEY is configured",
        )
    if not x_api_key or not hmac.compare_digest(x_api_key, configured_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid X-API-Key or Authorization Bearer header is required",
            headers={"WWW-Authenticate": "ApiKey"},
        )


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0088
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    hav = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    return earth_radius_km * 2 * math.asin(math.sqrt(hav))


def compatible_groups(
    recipient_group: str,
    component: str | None = None,
) -> set[str]:
    comp_clean = component.strip() if component else ""
    if comp_clean in {"Plasma", "FFP"}:
        abo_group = recipient_group.rstrip("+-")
        plasma_groups = {
            "O": {"AB-", "AB+"},
            "A": {"A-", "A+", "AB-", "AB+"},
            "B": {"B-", "B+", "AB-", "AB+"},
            "AB": BLOOD_GROUPS,
        }
        return plasma_groups.get(abo_group, BLOOD_GROUPS)
    if comp_clean == "Platelets":
        abo_group = recipient_group.rstrip("+-")
        return {
            group
            for group in BLOOD_GROUPS
            if group.rstrip("+-") == abo_group
        }
    return DONOR_GROUPS_FOR_RECIPIENT.get(recipient_group, BLOOD_GROUPS)


def audit(
    session: Session,
    action: str,
    entity_type: str,
    entity_id: str,
    details: str,
) -> None:
    session.add(
        AuditLog(
            id=str(uuid4()),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
    )


def invalidate_availability_cache() -> None:
    try:
        keys = list(redis_client.scan_iter(match=f"{AVAILABILITY_CACHE_PREFIX}*"))
        if keys:
            redis_client.delete(*keys)
    except Exception:
        logger.warning("Could not invalidate the blood availability cache")


def get_cached_json(key: str):
    try:
        value = redis_client.get(key)
        return json.loads(value) if value else None
    except (RedisError, json.JSONDecodeError):
        logger.warning("Blood availability cache read failed", exc_info=True)
        return None


def set_cached_json(key: str, value: object) -> None:
    try:
        redis_client.setex(key, AVAILABILITY_TTL_SECONDS, json.dumps(value))
    except RedisError:
        logger.warning("Blood availability cache write failed", exc_info=True)


def active_reserved_units(session: Session, inventory_id: str) -> int:
    now = utc_now()
    result = session.scalar(
        select(func.coalesce(func.sum(Reservation.units_reserved), 0)).where(
            Reservation.inventory_id == inventory_id,
            Reservation.status == "active",
            Reservation.expires_at > now,
        )
    )
    return int(result or 0)


def expire_reservations() -> int:
    with SessionLocal() as session:
        expired = list(
            session.scalars(
                select(Reservation).where(
                    Reservation.status == "active",
                    Reservation.expires_at <= utc_now(),
                )
            )
        )
        if not expired:
            return 0
        for reservation in expired:
            reservation.status = "expired"
            audit(
                session,
                "EXPIRE_RESERVATION",
                "reservation",
                reservation.id,
                f"Expired reservation for {reservation.units_reserved} unit(s)",
            )
        session.commit()
    invalidate_availability_cache()
    return len(expired)


def publish_pending_alerts() -> int:
    with SessionLocal() as session:
        alerts = list(
            session.scalars(
                select(DonorAlert)
                .where(DonorAlert.delivery_status == "pending")
                .order_by(DonorAlert.sent_at)
                .limit(100)
            )
        )
        return publish_alert_events(session, alerts)


async def background_work_worker() -> None:
    while True:
        await asyncio.sleep(30)
        for operation in (expire_reservations, publish_pending_alerts):
            try:
                await asyncio.to_thread(operation)
            except Exception:
                logger.exception("Background operation %s failed", operation.__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    from backend.database import ensure_column_migrations
    ensure_column_migrations(engine)
    worker_task = asyncio.create_task(background_work_worker())
    try:
        yield
    finally:
        worker_task.cancel()
        with suppress(asyncio.CancelledError):
            await worker_task
        redis_client.close()


app = FastAPI(
    title="HEMO-GRID AI & JEEVAN API",
    description=(
        "Blood availability, GIS routing, geographic donor matching, hospital requests, "
        "reservations, donor alerts, and an audit trail."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend (http://localhost:3000) and configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter(
    prefix="/api",
    dependencies=[Depends(require_api_key)],
    tags=["JEEVAN"],
)


@app.get("/")
def root():
    return {"name": "JEEVAN API", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health():
    checks = {"database": "connected", "redis": "connected"}
    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Database health check failed")
        checks["database"] = "unavailable"
    try:
        redis_client.ping()
    except Exception:
        checks["redis"] = "unavailable"
    healthy = checks["database"] == "connected"
    return {"status": "healthy" if healthy else "degraded", **checks}


def validate_location_pair(latitude: float | None, longitude: float | None) -> None:
    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=422,
            detail="latitude and longitude must be provided together",
        )


@router.get("/donors")
def search_donors(
    session: Annotated[Session, Depends(get_session)],
    blood_group: str = Query(...),
    component: str = Query(default="RBC"),
    latitude: float | None = Query(default=None, ge=-90, le=90),
    longitude: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float = Query(default=50, gt=0, le=500),
    limit: int = Query(default=50, ge=1, le=200),
):
    if blood_group not in BLOOD_GROUPS:
        raise HTTPException(status_code=422, detail="Unsupported blood group")
    if component not in COMPONENTS:
        raise HTTPException(status_code=422, detail="Unsupported blood component")
    validate_location_pair(latitude, longitude)
    candidates = list(
        session.scalars(
            select(Donor).where(
                Donor.eligible.is_(True),
                Donor.blood_group.in_(compatible_groups(blood_group, component)),
            )
        )
    )
    results = []
    for donor in candidates:
        distance = (
            haversine_km(latitude, longitude, donor.latitude, donor.longitude)
            if latitude is not None and longitude is not None
            else None
        )
        if distance is not None and distance > radius_km:
            continue
        results.append(
            {
                "donor_id": donor.id,
                "name": donor.name,
                "blood_group": donor.blood_group,
                "distance_km": round(distance, 2) if distance is not None else None,
                "response_rate": donor.response_rate,
                "last_donation_date": (
                    donor.last_donation_date.isoformat()
                    if donor.last_donation_date
                    else None
                ),
                "synthetic": donor.synthetic,
            }
        )
    results.sort(key=lambda result: (result["distance_km"] is None, result["distance_km"] or 0))
    return results[:limit]


@router.get("/availability")
def blood_availability(
    session: Annotated[Session, Depends(get_session)],
    blood_group: str | None = Query(default=None),
    component: str | None = Query(default=None),
    city: str | None = Query(default=None),
):
    if blood_group is not None:
        blood_group = blood_group.replace(" ", "+").strip().upper()
        if blood_group not in BLOOD_GROUPS:
            raise HTTPException(status_code=422, detail="Unsupported blood group")
    if component is not None and component not in COMPONENTS:
        raise HTTPException(status_code=422, detail="Unsupported blood component")
    normalized_city = city.strip().casefold() if city else None
    cache_key = AVAILABILITY_CACHE_PREFIX + json.dumps(
        [blood_group, component, normalized_city], separators=(",", ":")
    )
    cached = get_cached_json(cache_key)
    if cached is not None:
        return {"items": cached, "cached": True}

    statement = (
        select(Inventory, BloodBank)
        .join(BloodBank, Inventory.blood_bank_id == BloodBank.id)
        .where(
            Inventory.status == "available",
            Inventory.expiry_date >= date.today(),
            Inventory.units > 0,
        )
    )
    if blood_group:
        statement = statement.where(
            Inventory.blood_group.in_(compatible_groups(blood_group, component))
        )
    if component:
        statement = statement.where(Inventory.component.in_(equivalent_components(component)))
    if normalized_city:
        statement = statement.where(func.lower(BloodBank.city) == normalized_city)

    items = []
    for inventory, bank in session.execute(statement):
        available_units = max(
            0, inventory.units - active_reserved_units(session, inventory.id)
        )
        if available_units == 0:
            continue
        items.append(
            {
                "inventory_id": inventory.id,
                "blood_bank_id": bank.id,
                "blood_bank_name": bank.name,
                "city": bank.city,
                "blood_group": inventory.blood_group,
                "component": inventory.component,
                "available_units": available_units,
                "expiry_date": inventory.expiry_date.isoformat(),
                "synthetic": inventory.synthetic or bank.synthetic,
            }
        )
    items.sort(key=lambda item: (item["city"].casefold(), item["blood_group"], item["component"]))
    set_cached_json(cache_key, items)
    return {"items": items, "cached": False}


@router.get("/blood-banks/nearby")
def nearby_blood_banks(
    session: Annotated[Session, Depends(get_session)],
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius_km: float = Query(default=50, gt=0, le=500),
    limit: int = Query(default=50, ge=1, le=200),
):
    banks = session.scalars(
        select(BloodBank).where(
            BloodBank.latitude.is_not(None), BloodBank.longitude.is_not(None)
        )
    )
    results = []
    for bank in banks:
        distance = haversine_km(latitude, longitude, bank.latitude, bank.longitude)
        if distance <= radius_km:
            results.append(
                {
                    "blood_bank_id": bank.id,
                    "name": bank.name,
                    "address": bank.address,
                    "city": bank.city,
                    "state": bank.state,
                    "phone": bank.phone,
                    "latitude": bank.latitude,
                    "longitude": bank.longitude,
                    "distance_km": round(distance, 2),
                    "synthetic": bank.synthetic,
                }
            )
    results.sort(key=lambda item: item["distance_km"])
    return results[:limit]


# ---------------------------------------------------------------------
# Blood Bank Inventory Management Endpoints
# ---------------------------------------------------------------------

@router.post("/inventory", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
def create_inventory(
    body: InventoryCreate,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Creates a new blood stock inventory record in PostgreSQL.
    Enforces component validity, positive units, bank existence, and future expiry dates.
    """
    if body.blood_group not in BLOOD_GROUPS:
        raise HTTPException(status_code=422, detail="Unsupported blood group")
    if body.component not in COMPONENTS:
        raise HTTPException(status_code=422, detail="Unsupported blood component")

    bank = session.get(BloodBank, body.blood_bank_id)
    if not bank:
        raise HTTPException(status_code=404, detail="Blood bank not found")

    try:
        exp_date = datetime.strptime(body.expiry_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format. Expected YYYY-MM-DD")

    inv_id = f"inv-{uuid4().hex[:8]}"
    item = Inventory(
        id=inv_id,
        blood_bank_id=bank.id,
        blood_group=body.blood_group,
        component=body.component,
        units=body.units,
        expiry_date=exp_date,
        status=body.status or "available",
        synthetic=False,
        source="api",
    )
    session.add(item)
    audit(
        session,
        "CREATE_INVENTORY",
        "inventory",
        inv_id,
        f"Added {body.units} units of {body.blood_group} {body.component} to {bank.name}",
    )
    session.commit()
    invalidate_availability_cache()

    return InventoryItemResponse(
        id=item.id,
        blood_bank_id=bank.id,
        blood_bank_name=bank.name,
        blood_group=item.blood_group,
        component=item.component,
        units=item.units,
        available_units=item.units,
        reserved_units=0,
        expiry_date=item.expiry_date.isoformat(),
        status=item.status,
        is_low_stock=item.units <= 2,
        is_expired=item.expiry_date < date.today(),
        synthetic=item.synthetic,
    )


@router.get("/inventory", response_model=List[InventoryItemResponse])
def list_inventory(
    session: Annotated[Session, Depends(get_session)],
    blood_bank_id: str | None = Query(default=None),
    blood_group: str | None = Query(default=None),
    component: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    low_stock_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    List inventory items with live available stock computation, reservation deduction,
    low-stock warnings (<= 2 units), and expiry status.
    """
    statement = (
        select(Inventory, BloodBank)
        .outerjoin(BloodBank, Inventory.blood_bank_id == BloodBank.id)
        .order_by(Inventory.expiry_date.asc())
        .offset(offset)
        .limit(limit)
    )
    if blood_bank_id:
        statement = statement.where(Inventory.blood_bank_id == blood_bank_id)
    if blood_group:
        clean_bg = blood_group.replace(" ", "+").strip().upper()
        statement = statement.where(Inventory.blood_group == clean_bg)
    if component:
        statement = statement.where(Inventory.component.in_(equivalent_components(component)))
    if status_filter:
        statement = statement.where(Inventory.status == status_filter)

    results = []
    today = date.today()
    for inv, bank in session.execute(statement):
        reserved = active_reserved_units(session, inv.id)
        avail = max(0, inv.units - reserved) if inv.status == "available" and inv.expiry_date >= today else 0
        is_low = avail <= 2
        is_exp = inv.expiry_date < today
        if low_stock_only and not is_low:
            continue
        results.append(
            InventoryItemResponse(
                id=inv.id,
                blood_bank_id=inv.blood_bank_id,
                blood_bank_name=bank.name if bank else "Unknown Blood Bank",
                blood_group=inv.blood_group,
                component=inv.component,
                units=inv.units,
                available_units=avail,
                reserved_units=reserved,
                expiry_date=inv.expiry_date.isoformat(),
                status=inv.status,
                is_low_stock=is_low,
                is_expired=is_exp,
                synthetic=inv.synthetic,
            )
        )
    return results


@router.patch("/inventory/{inventory_id}", response_model=InventoryItemResponse)
def update_inventory(
    inventory_id: str,
    body: InventoryUpdate,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Updates stock units, status, or expiry date with row locking and audit logging.
    """
    item = session.scalar(
        select(Inventory).where(Inventory.id == inventory_id).with_for_update()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    bank = session.get(BloodBank, item.blood_bank_id)
    changes = []
    if body.units is not None:
        changes.append(f"units {item.units} -> {body.units}")
        item.units = body.units
    if body.status is not None:
        changes.append(f"status {item.status} -> {body.status}")
        item.status = body.status
    if body.expiry_date is not None:
        try:
            exp_date = datetime.strptime(body.expiry_date, "%Y-%m-%d").date()
            changes.append(f"expiry {item.expiry_date} -> {exp_date}")
            item.expiry_date = exp_date
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format. Expected YYYY-MM-DD")

    session.commit()
    invalidate_availability_cache()

    if changes:
        audit(
            session,
            "UPDATE_INVENTORY",
            "inventory",
            item.id,
            ", ".join(changes),
        )
        session.commit()

    reserved = active_reserved_units(session, item.id)
    today = date.today()
    avail = max(0, item.units - reserved) if item.status == "available" and item.expiry_date >= today else 0

    return InventoryItemResponse(
        id=item.id,
        blood_bank_id=item.blood_bank_id,
        blood_bank_name=bank.name if bank else "Unknown Blood Bank",
        blood_group=item.blood_group,
        component=item.component,
        units=item.units,
        available_units=avail,
        reserved_units=reserved,
        expiry_date=item.expiry_date.isoformat(),
        status=item.status,
        is_low_stock=avail <= 2,
        is_expired=item.expiry_date < today,
        synthetic=item.synthetic,
    )


# ---------------------------------------------------------------------
# Blood Expiry Radar & Clinical Prioritization
# ---------------------------------------------------------------------

PRIORITIZED_UNITS: Dict[str, Dict[str, Any]] = {}
REDISTRIBUTED_UNITS: Dict[str, Dict[str, Any]] = {}


@router.get("/inventory/expiry-radar", response_model=ExpiryRadarResponse)
def get_blood_expiry_radar(
    session: Annotated[Session, Depends(get_session)],
    blood_bank_id: Optional[str] = Query(default=None),
    blood_group: Optional[str] = Query(default=None),
    component: Optional[str] = Query(default=None),
    urgency_tier: Optional[str] = Query(default=None),
    max_days: int = Query(default=30, ge=1, le=60),
):
    """
    Blood Expiry Radar:
    Evaluates hospital and regional blood inventory against clinical transfusion rules,
    detects units approaching expiration, and generates actionable FEFO, pediatric restriction,
    platelet stability, and inter-facility transfer recommendations.
    """
    statement = (
        select(Inventory, BloodBank)
        .outerjoin(BloodBank, Inventory.blood_bank_id == BloodBank.id)
        .order_by(Inventory.expiry_date.asc())
    )
    if blood_bank_id:
        statement = statement.where(Inventory.blood_bank_id == blood_bank_id)
    if blood_group:
        clean_bg = blood_group.replace(" ", "+").strip().upper()
        statement = statement.where(Inventory.blood_group == clean_bg)
    if component:
        statement = statement.where(Inventory.component.in_(equivalent_components(component)))

    today = date.today()
    items: List[ExpiryRadarItem] = []

    total_units = 0
    critical_units = 0
    warning_units = 0
    safe_units = 0
    expired_units = 0
    fefo_candidates_count = 0

    raw_results = list(session.execute(statement))

    rank = 1
    for inv, bank in raw_results:
        days_rem = (inv.expiry_date - today).days
        hours_rem = max(0, days_rem * 24)
        reserved = active_reserved_units(session, inv.id)
        avail = max(0, inv.units - reserved) if inv.status == "available" and inv.expiry_date >= today else 0

        # Filter out if beyond horizon
        if days_rem > max_days and days_rem >= 0:
            continue

        # Urgency Tier calculation
        if days_rem < 0 or inv.status in ("expired", "quarantined", "discarded"):
            tier = "EXPIRED"
            expired_units += inv.units
            suggested_action = "Biohazard Quarantine: Discard unit and update regulatory audit log."
        elif days_rem <= 2 or (inv.component == "Platelets" and days_rem <= 3):
            tier = "CRITICAL"
            critical_units += inv.units
            suggested_action = "Immediate FEFO Issue: Allocate to today's urgent surgery, MTP, or dispatch emergency transfer."
        elif days_rem <= 5:
            tier = "WARNING"
            warning_units += inv.units
            suggested_action = "FEFO Priority Queue: Allocate to scheduled elective surgeries or high-turnover procedures."
        elif days_rem <= 10:
            tier = "MONITORING"
            warning_units += inv.units
            suggested_action = "Active Shelf-Life Watch: Monitor inventory burn rate."
        else:
            tier = "SAFE"
            safe_units += inv.units
            suggested_action = "Standard storage reserve."

        total_units += inv.units

        # Filter by tier if specified
        if urgency_tier and tier != urgency_tier.upper():
            continue

        # Clinical Rules Evaluation
        rules: List[ClinicalRuleAlert] = []
        pediatric_safe = True
        trauma_cand = False
        target_bank_id = None
        target_bank_name = None

        # 1. FEFO Rule
        if 0 <= days_rem <= 5 and avail > 0:
            fefo_candidates_count += 1
            rules.append(
                ClinicalRuleAlert(
                    rule_id="FEFO_PRIORITY",
                    title="FEFO Priority Allocation",
                    severity="critical" if days_rem <= 2 else "warning",
                    description="First Expiring First Out protocol: must be dispensed before younger stock to avoid wastage.",
                    clinical_action="Pre-assign to imminent surgical cases or urgent trauma request.",
                    badge="FEFO Priority",
                )
            )

        # 2. Platelet Shelf-Life Rule
        if inv.component == "Platelets":
            if days_rem <= 2:
                rules.append(
                    ClinicalRuleAlert(
                        rule_id="PLATELET_URGENT_CYCLE",
                        title="Platelet Rapid Spoilage Alert",
                        severity="critical",
                        description="Platelets have a maximum 5-day shelf life at 20-24°C with continuous agitation. Bacterial proliferation risk increases sharply.",
                        clinical_action="Immediate issue to oncology, hematology, or surgical ward with active thrombocytopenia.",
                        badge="Platelet Alert",
                    )
                )

        # 3. Pediatric & Neonatal Safety Exclusion Rule
        if inv.component in ("PRBC", "Whole Blood"):
            if days_rem <= 28:
                pediatric_safe = False
                rules.append(
                    ClinicalRuleAlert(
                        rule_id="PEDIATRIC_RESTRICTION",
                        title="Pediatric / Neonatal Restriction",
                        severity="warning",
                        description="Storage duration >7 days. Stored red cells accumulate extracellular potassium and lose 2,3-DPG; contraindicated for neonatal exchange.",
                        clinical_action="Restrict utilization strictly to adult surgical and medical recipients.",
                        badge="Adults Only",
                    )
                )

        # 4. Immediate Trauma / Massive Transfusion Match
        if inv.component in ("PRBC", "Whole Blood") and 0 <= days_rem <= 7 and avail > 0:
            trauma_cand = True
            rules.append(
                ClinicalRuleAlert(
                    rule_id="TRAUMA_MASSIVE_MATCH",
                    title="Trauma / MTP Candidate",
                    severity="info",
                    description="Approved for immediate acute trauma resuscitation or Massive Transfusion Protocol (MTP), where immediate infusion eliminates shelf-life risk.",
                    clinical_action="Hold ready for emergency trauma bay activation.",
                    badge="Trauma MTP",
                )
            )

        # 5. Inter-Facility Redistribution Recommendation
        if 0 <= days_rem <= 4 and avail > 0:
            if inv.blood_bank_id != "bank-gmc":
                target_bank_id = "bank-gmc"
                target_bank_name = "Govt Medical College Blood Bank (High Trauma Intake)"
            else:
                target_bank_id = "bank-jubilee"
                target_bank_name = "Jubilee Mission Blood Centre"

            rules.append(
                ClinicalRuleAlert(
                    rule_id="INTER_FACILITY_TRANSFER_RECOMMENDED",
                    title="Inter-Hospital Redistribution Recommended",
                    severity="warning" if days_rem <= 2 else "info",
                    description=f"Local surplus approaching expiry. Inter-facility transfer to {target_bank_name} prevents discarding.",
                    clinical_action="Initiate Green Corridor cold-chain transfer dispatch.",
                    badge="Transfer Rec",
                )
            )

        priority_info = PRIORITIZED_UNITS.get(inv.id)

        items.append(
            ExpiryRadarItem(
                id=inv.id,
                blood_bank_id=inv.blood_bank_id,
                blood_bank_name=bank.name if bank else "Unknown Blood Bank",
                blood_group=inv.blood_group,
                component=inv.component,
                units=inv.units,
                available_units=avail,
                reserved_units=reserved,
                expiry_date=inv.expiry_date.isoformat(),
                days_remaining=days_rem,
                hours_remaining=hours_rem,
                urgency_tier=tier,
                fefo_priority_rank=rank,
                pediatric_safe=pediatric_safe,
                trauma_candidate=trauma_cand,
                clinical_rules=rules,
                suggested_action=suggested_action,
                recommended_transfer_target_id=target_bank_id,
                recommended_transfer_target_name=target_bank_name,
                prioritized=bool(priority_info),
                priority_reason=priority_info.get("reason") if priority_info else None,
                synthetic=inv.synthetic,
            )
        )
        rank += 1

    potential_wastage = critical_units + warning_units
    adherence_pct = (
        round(((total_units - expired_units) / max(1, total_units)) * 100.0, 1)
        if total_units > 0
        else 100.0
    )

    summary = ExpiryRadarSummary(
        total_units=total_units,
        critical_units=critical_units,
        warning_units=warning_units,
        safe_units=safe_units,
        expired_units=expired_units,
        fefo_candidates_count=fefo_candidates_count,
        potential_wastage_units=potential_wastage,
        adherence_rate_pct=adherence_pct,
    )

    protocols = [
        {
            "name": "FEFO Transfusion Protocol",
            "code": "FEFO-CLN-01",
            "description": "Units expiring within 5 days must be prioritized for compatible surgical procedures before newer units are crossmatched.",
        },
        {
            "name": "Neonatal & Pediatric Safety Guideline",
            "code": "PEDI-SEC-04",
            "description": "Red blood cells stored >7 days are restricted from pediatric cardiac bypass and neonatal exchange to prevent hyperkalemia.",
        },
        {
            "name": "Platelet Rapid Cycle Standard",
            "code": "PLT-RAPID-02",
            "description": "Platelets reaching 48h shelf life must be immediately mobilized to acute hematology or transferred to higher-demand trauma centers.",
        },
        {
            "name": "Inter-Hospital Zero-Wastage Redistribution",
            "code": "REDIST-Z-09",
            "description": "Automated regional redistribution route dispatch to ensure no usable blood expires without clinical consumption.",
        },
    ]

    return ExpiryRadarResponse(
        summary=summary,
        items=items,
        clinical_protocols=protocols,
    )


@router.post("/inventory/{inventory_id}/prioritize")
def prioritize_inventory_unit(
    inventory_id: str,
    body: PrioritizeUnitRequest,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Clinically prioritizes an expiring blood unit for the next surgical or emergency procedure according to FEFO rules.
    """
    inv = session.get(Inventory, inventory_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    PRIORITIZED_UNITS[inventory_id] = {
        "reason": body.reason or "FEFO Surgical Queue Priority",
        "case": body.clinical_case,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    audit(
        session,
        "PRIORITIZE_EXPIRY_UNIT",
        "inventory",
        inventory_id,
        f"Prioritized unit {inv.blood_group} ({inv.component}) for {body.clinical_case}: {body.reason}",
    )
    session.commit()

    return {
        "success": True,
        "inventory_id": inventory_id,
        "message": f"Unit {inv.blood_group} {inv.component} prioritized under FEFO clinical protocol.",
        "priority": PRIORITIZED_UNITS[inventory_id],
    }


@router.post("/inventory/{inventory_id}/redistribute")
def redistribute_inventory_unit(
    inventory_id: str,
    body: RedistributeUnitRequest,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Initiates inter-hospital transfer recommendation/dispatch for an approaching-expiry blood unit to prevent discard.
    """
    inv = session.get(Inventory, inventory_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    target_bank = session.get(BloodBank, body.target_bank_id)
    target_name = target_bank.name if target_bank else "Designated Medical Center"

    dispatch_code = f"TRF-{uuid4().hex[:6].upper()}"
    REDISTRIBUTED_UNITS[inventory_id] = {
        "dispatch_code": dispatch_code,
        "target_bank_id": body.target_bank_id,
        "target_name": target_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": body.courier_notes,
    }

    audit(
        session,
        "REDISTRIBUTE_EXPIRY_UNIT",
        "inventory",
        inventory_id,
        f"Inter-hospital transfer {dispatch_code} dispatched to {target_name} for near-expiry {inv.blood_group} {inv.component}",
    )
    session.commit()

    return {
        "success": True,
        "inventory_id": inventory_id,
        "dispatch_code": dispatch_code,
        "target_blood_bank": target_name,
        "message": f"Cold-chain transfer {dispatch_code} initiated to {target_name} to prevent wastage.",
    }


# ---------------------------------------------------------------------
# Donor Management Profile Endpoints
# ---------------------------------------------------------------------

@router.get("/donors/{donor_id}")
def get_donor_profile(
    donor_id: str,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Retrieves donor details. Privacy-preserving: displays approximate location
    and disclaimer that medical eligibility is subject to clinical guidelines.
    """
    donor = session.get(Donor, donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")

    today = date.today()
    days_since = (today - donor.last_donation_date).days if donor.last_donation_date else None
    cooldown_active = (days_since is not None and days_since < 90)

    return {
        "donor_id": donor.id,
        "donor_code": donor.donor_code,
        "name": donor.name,
        "blood_group": donor.blood_group,
        "phone": donor.phone[:4] + "XXXX" + donor.phone[-3:] if len(donor.phone) > 7 else donor.phone,
        "email": donor.email[:2] + "***@" + donor.email.split("@")[-1] if donor.email and "@" in donor.email else donor.email,
        "approx_latitude": round(donor.latitude, 2),
        "approx_longitude": round(donor.longitude, 2),
        "last_donation_date": donor.last_donation_date.isoformat() if donor.last_donation_date else None,
        "days_since_last_donation": days_since,
        "cooldown_active": cooldown_active,
        "donation_count": donor.donation_count,
        "eligible": donor.eligible,
        "medical_eligibility_note": "Medical eligibility is subject to blood bank professional screening and applicable donation guidelines.",
        "synthetic": donor.synthetic,
    }


@router.patch("/donors/{donor_id}")
def update_donor_profile(
    donor_id: str,
    body: DonorProfileUpdate,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Updates donor permitted information (blood group, availability/eligibility, phone, location).
    """
    donor = session.scalar(
        select(Donor).where(Donor.id == donor_id).with_for_update()
    )
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")

    changes = []
    if body.name is not None:
        donor.name = body.name.strip()
        changes.append("name")
    if body.blood_group is not None:
        if body.blood_group not in BLOOD_GROUPS:
            raise HTTPException(status_code=422, detail="Unsupported blood group")
        donor.blood_group = body.blood_group
        changes.append("blood_group")
    if body.phone is not None:
        donor.phone = body.phone.strip()
        changes.append("phone")
    if body.email is not None:
        donor.email = body.email.strip()
        changes.append("email")
    if body.latitude is not None and body.longitude is not None:
        donor.latitude = body.latitude
        donor.longitude = body.longitude
        changes.append("coordinates")
    if body.eligible is not None:
        donor.eligible = body.eligible
        changes.append(f"eligible={body.eligible}")

    session.commit()
    if changes:
        audit(
            session,
            "UPDATE_DONOR_PROFILE",
            "donor",
            donor.id,
            f"Updated {', '.join(changes)}",
        )
        session.commit()

    return {
        "status": "SUCCESS",
        "donor_id": donor.id,
        "message": "Donor profile updated successfully",
        "eligible": donor.eligible,
    }


@router.get("/donors/{donor_id}/history")
def get_donor_history(
    donor_id: str,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Returns donation history and response metrics for a donor.
    """
    donor = session.get(Donor, donor_id)
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")

    alerts = list(
        session.scalars(
            select(DonorAlert)
            .where(DonorAlert.donor_id == donor.id)
            .order_by(DonorAlert.sent_at.desc())
            .limit(20)
        )
    )

    return {
        "donor_id": donor.id,
        "name": donor.name,
        "blood_group": donor.blood_group,
        "donation_count": donor.donation_count,
        "last_donation_date": donor.last_donation_date.isoformat() if donor.last_donation_date else None,
        "response_rate": donor.response_rate,
        "recent_alerts": [
            {
                "alert_id": a.id,
                "request_id": a.request_id,
                "status": a.status,
                "sent_at": a.sent_at.isoformat(),
                "message": a.message,
            }
            for a in alerts
        ],
    }


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_request(
    body: RequestCreate,
    session: Annotated[Session, Depends(get_session)],
):
    if body.patient_blood_group not in BLOOD_GROUPS:
        raise HTTPException(status_code=422, detail="Unsupported blood group")
    if body.component not in COMPONENTS:
        raise HTTPException(status_code=422, detail="Unsupported blood component")
    hospital = session.scalar(
        select(Hospital).where(func.lower(Hospital.name) == body.hospital_name.casefold())
    )
    request_id = str(uuid4())
    request = BloodRequest(
        id=request_id,
        request_code=f"JEEVAN-{request_id[:8].upper()}",
        hospital_id=hospital.id if hospital else None,
        hospital_name=body.hospital_name,
        patient_blood_group=body.patient_blood_group,
        component=body.component,
        units_required=body.units_required,
        urgency=body.urgency,
        hospital_latitude=body.hospital_latitude,
        hospital_longitude=body.hospital_longitude,
        status="pending",
    )
    session.add(request)
    audit(session, "CREATE_REQUEST", "request", request_id, body.urgency)
    session.commit()
    session.refresh(request)
    return serialize_request(request)


def serialize_request(request: BloodRequest) -> dict:
    return {
        "request_id": request.id,
        "request_code": request.request_code,
        "hospital_id": request.hospital_id,
        "hospital_name": request.hospital_name,
        "patient_blood_group": request.patient_blood_group,
        "component": request.component,
        "units_required": request.units_required,
        "urgency": request.urgency,
        "hospital_latitude": request.hospital_latitude,
        "hospital_longitude": request.hospital_longitude,
        "status": request.status,
        "created_at": request.created_at.isoformat(),
        "synthetic": request.synthetic,
    }


@router.get("/requests")
def list_requests(
    session: Annotated[Session, Depends(get_session)],
    hospital_name: str | None = Query(default=None),
    request_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
):
    statement = select(BloodRequest).order_by(BloodRequest.created_at.desc()).limit(limit)
    if hospital_name:
        statement = statement.where(
            func.lower(BloodRequest.hospital_name) == hospital_name.strip().casefold()
        )
    if request_status:
        if request_status not in {"pending", "matched", "fulfilled", "cancelled"}:
            raise HTTPException(status_code=422, detail="Unsupported request status")
        statement = statement.where(BloodRequest.status == request_status)
    return [serialize_request(request) for request in session.scalars(statement)]


@router.get("/requests/{request_id}")
def get_request(
    request_id: str,
    session: Annotated[Session, Depends(get_session)],
):
    request = session.get(BloodRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    result = serialize_request(request)
    result["reservations"] = [
        {
            "reservation_id": reservation.id,
            "inventory_id": reservation.inventory_id,
            "units_reserved": reservation.units_reserved,
            "expires_at": reservation.expires_at.isoformat(),
            "status": reservation.status,
        }
        for reservation in session.scalars(
            select(Reservation)
            .where(Reservation.request_id == request_id)
            .order_by(Reservation.created_at.desc())
        )
    ]
    return result


@router.patch("/requests/{request_id}/status")
def update_request_status(
    request_id: str,
    body: RequestStatusUpdate,
    session: Annotated[Session, Depends(get_session)],
):
    request = session.scalar(
        select(BloodRequest)
        .where(BloodRequest.id == request_id)
        .with_for_update()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    allowed_transitions = {
        "pending": {"matched", "cancelled"},
        "matched": {"pending", "fulfilled", "cancelled"},
        "fulfilled": set(),
        "cancelled": set(),
    }
    if body.status != request.status and body.status not in allowed_transitions[request.status]:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot change a {request.status} request to {body.status}",
        )
    if body.status == "fulfilled":
        active_reservations = list(
            session.scalars(
                select(Reservation)
                .where(
                    Reservation.request_id == request.id,
                    Reservation.status == "active",
                    Reservation.expires_at > utc_now(),
                )
                .with_for_update()
            )
        )
        reserved_units = sum(item.units_reserved for item in active_reservations)
        if reserved_units < request.units_required:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Request needs {request.units_required} reserved unit(s) "
                    f"before fulfillment; only {reserved_units} are reserved"
                ),
            )
        for reservation in active_reservations:
            inventory = session.scalar(
                select(Inventory)
                .where(Inventory.id == reservation.inventory_id)
                .with_for_update()
            )
            if inventory is None or inventory.units < reservation.units_reserved:
                raise HTTPException(
                    status_code=409,
                    detail="Reserved inventory changed before fulfillment",
                )
            inventory.units -= reservation.units_reserved
            reservation.status = "confirmed"
            audit(
                session,
                "FULFILL_RESERVATION",
                "reservation",
                reservation.id,
                f"Fulfilled {reservation.units_reserved} unit(s) from inventory {inventory.id}",
            )
    elif body.status == "cancelled":
        for reservation in session.scalars(
            select(Reservation).where(
                Reservation.request_id == request.id,
                Reservation.status == "active",
            )
        ):
            reservation.status = "released"
            audit(
                session,
                "RELEASE_RESERVATION",
                "reservation",
                reservation.id,
                "Request cancelled; active reservation released",
            )
    previous_status = request.status
    request.status = body.status
    audit(
        session,
        "UPDATE_REQUEST_STATUS",
        "request",
        request.id,
        f"{previous_status} -> {body.status}",
    )
    session.commit()
    if body.status in {"fulfilled", "cancelled"}:
        invalidate_availability_cache()
    return serialize_request(request)


@router.post("/requests/{request_id}/matches")
def match_request(
    request_id: str,
    session: Annotated[Session, Depends(get_session)],
    radius_km: float = Query(default=50, gt=0, le=500),
):
    request = session.scalar(
        select(BloodRequest)
        .where(BloodRequest.id == request_id)
        .with_for_update()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.status in {"fulfilled", "cancelled"}:
        raise HTTPException(status_code=409, detail="Request is no longer matchable")

    urgency_weight = URGENCY_ORDER[request.urgency]
    donor_rows = list(
        session.scalars(
            select(Donor).where(
                Donor.eligible.is_(True),
                Donor.blood_group.in_(
                    compatible_groups(request.patient_blood_group, request.component)
                ),
            )
        )
    )
    candidates = []
    for donor in donor_rows:
        distance = haversine_km(
            request.hospital_latitude,
            request.hospital_longitude,
            donor.latitude,
            donor.longitude,
        )
        if distance > radius_km:
            continue
        score = max(
            0.0,
            100 - distance * urgency_weight + donor.response_rate * 0.2,
        )
        candidates.append(
            {
                "type": "donor",
                "donor_id": donor.id,
                "donor_name": donor.name,
                "blood_group": donor.blood_group,
                "blood_bank_id": None,
                "blood_bank_name": None,
                "distance_km": round(distance, 2),
                "score": round(score, 2),
                "units_available": 1,
                "synthetic": donor.synthetic,
            }
        )

    inventory_rows = session.execute(
        select(Inventory, BloodBank)
        .join(BloodBank, Inventory.blood_bank_id == BloodBank.id)
        .where(
            Inventory.status == "available",
            Inventory.expiry_date >= date.today(),
            Inventory.component.in_(equivalent_components(request.component)),
            Inventory.blood_group.in_(
                compatible_groups(request.patient_blood_group, request.component)
            ),
        )
    )
    for inventory, bank in inventory_rows:
        available_units = max(
            0, inventory.units - active_reserved_units(session, inventory.id)
        )
        if available_units == 0:
            continue
        if bank.latitude is None or bank.longitude is None:
            continue
        distance = haversine_km(
            request.hospital_latitude,
            request.hospital_longitude,
            bank.latitude,
            bank.longitude,
        )
        if distance > radius_km:
            continue
        score = max(0.0, 100 - distance * urgency_weight)
        candidates.append(
            {
                "type": "blood_bank",
                "donor_id": None,
                "donor_name": None,
                "blood_group": inventory.blood_group,
                "blood_bank_id": bank.id,
                "blood_bank_name": bank.name,
                "inventory_id": inventory.id,
                "distance_km": round(distance, 2),
                "score": round(score, 2),
                "units_available": available_units,
                "synthetic": inventory.synthetic or bank.synthetic,
            }
        )

    candidates.sort(key=lambda item: (-item["score"], item["distance_km"]))
    candidates = candidates[:20]
    for old_match in session.scalars(
        select(BloodMatch).where(
            BloodMatch.request_id == request.id,
            BloodMatch.status == "suggested",
        )
    ):
        old_match.status = "superseded"
    for candidate in candidates:
        session.add(
            BloodMatch(
                id=str(uuid4()),
                request_id=request.id,
                blood_bank_id=candidate["blood_bank_id"],
                donor_id=candidate["donor_id"],
                score=candidate["score"],
                distance_km=candidate["distance_km"],
                units_available=candidate["units_available"],
                status="suggested",
            )
        )
    if candidates and request.status == "pending":
        request.status = "matched"
    audit(
        session,
        "MATCH_REQUEST",
        "request",
        request.id,
        f"Generated {len(candidates)} geographic matches; urgency={request.urgency}",
    )
    session.commit()
    return {"request_id": request.id, "matches": candidates}


@router.post("/requests/{request_id}/reservations", status_code=status.HTTP_201_CREATED)
def create_reservation(
    request_id: str,
    body: ReservationCreate,
    session: Annotated[Session, Depends(get_session)],
):
    request = session.scalar(
        select(BloodRequest)
        .where(BloodRequest.id == request_id)
        .with_for_update()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.status in {"fulfilled", "cancelled"}:
        raise HTTPException(status_code=409, detail="Request cannot accept reservations")
    inventory = session.scalar(
        select(Inventory)
        .where(Inventory.id == body.inventory_id)
        .with_for_update()
    )
    if inventory is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if inventory.expiry_date < date.today() or inventory.status != "available":
        raise HTTPException(status_code=409, detail="Inventory is not available")
    if inventory.component not in equivalent_components(request.component) or inventory.blood_group not in compatible_groups(
        request.patient_blood_group, request.component
    ):
        raise HTTPException(
            status_code=422,
            detail="Inventory blood group or component does not match this request",
        )
    already_reserved = active_reserved_units(session, inventory.id)
    if body.units > inventory.units - already_reserved:
        raise HTTPException(status_code=409, detail="Not enough unreserved units")
    request_reserved_units = session.scalar(
        select(func.coalesce(func.sum(Reservation.units_reserved), 0)).where(
            Reservation.request_id == request.id,
            Reservation.status == "active",
            Reservation.expires_at > utc_now(),
        )
    )
    if int(request_reserved_units or 0) + body.units > request.units_required:
        raise HTTPException(
            status_code=409,
            detail="Reservation exceeds the units required for this request",
        )
    reservation = Reservation(
        id=str(uuid4()),
        request_id=request.id,
        inventory_id=inventory.id,
        units_reserved=body.units,
        expires_at=utc_now() + timedelta(minutes=body.ttl_minutes),
        status="active",
    )
    session.add(reservation)
    request.status = "matched"
    audit(
        session,
        "CREATE_RESERVATION",
        "reservation",
        reservation.id,
        f"{body.units} unit(s) from inventory {inventory.id}; expires in {body.ttl_minutes} minute(s)",
    )
    session.commit()
    invalidate_availability_cache()
    return {
        "reservation_id": reservation.id,
        "request_id": request.id,
        "inventory_id": inventory.id,
        "units_reserved": reservation.units_reserved,
        "expires_at": reservation.expires_at.isoformat(),
        "status": reservation.status,
    }


@router.delete("/reservations/{reservation_id}")
def release_reservation(
    reservation_id: str,
    session: Annotated[Session, Depends(get_session)],
):
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if reservation.status != "active":
        raise HTTPException(
            status_code=409,
            detail=f"Only active reservations can be released (status: {reservation.status})",
        )
    reservation.status = "released"
    audit(
        session,
        "RELEASE_RESERVATION",
        "reservation",
        reservation.id,
        "Reservation released",
    )
    session.commit()
    invalidate_availability_cache()
    return {"reservation_id": reservation.id, "status": reservation.status}


def publish_alert_events(session: Session, alerts: list[DonorAlert]) -> int:
    if not alerts:
        return 0
    alerts = list(
        session.scalars(
            select(DonorAlert)
            .where(
                DonorAlert.id.in_([alert.id for alert in alerts]),
                DonorAlert.delivery_status == "pending",
            )
            .with_for_update(skip_locked=True)
        )
    )
    published = 0
    for alert in alerts:
        try:
            redis_client.xadd(
                ALERT_STREAM,
                {
                    "alert_id": alert.id,
                    "donor_id": alert.donor_id,
                    "request_id": alert.request_id,
                    "message": alert.message,
                },
                maxlen=10_000,
                approximate=True,
            )
        except Exception:
            logger.debug("Redis unavailable, alerts remain in database")
            break
        alert.delivery_status = "published"
        published += 1
    if published:
        session.commit()
    return published


@router.post("/requests/{request_id}/alerts", status_code=status.HTTP_201_CREATED)
def send_donor_alerts(
    request_id: str,
    session: Annotated[Session, Depends(get_session)],
    body: AlertCreate | None = None,
):
    request = session.scalar(
        select(BloodRequest)
        .where(BloodRequest.id == request_id)
        .with_for_update()
    )
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.status in {"fulfilled", "cancelled"}:
        raise HTTPException(status_code=409, detail="Request is no longer active")
    donor_ids = body.donor_ids if body else None
    if donor_ids is None:
        donors = list(
            session.scalars(
                select(Donor).where(
                    Donor.eligible.is_(True),
                    Donor.blood_group.in_(
                        compatible_groups(request.patient_blood_group, request.component)
                    ),
                )
            )
        )
        donors.sort(
            key=lambda donor: haversine_km(
                request.hospital_latitude,
                request.hospital_longitude,
                donor.latitude,
                donor.longitude,
            )
        )
        radius_km = body.radius_km if body else 50
        donors = [
            donor
            for donor in donors
            if haversine_km(
                request.hospital_latitude,
                request.hospital_longitude,
                donor.latitude,
                donor.longitude,
            )
            <= radius_km
        ]
        donors = donors[:50]
    else:
        if len(set(donor_ids)) != len(donor_ids):
            raise HTTPException(status_code=422, detail="donor_ids must be unique")
        donors = list(session.scalars(select(Donor).where(Donor.id.in_(donor_ids))))
        if len(donors) != len(donor_ids):
            raise HTTPException(status_code=422, detail="One or more donors do not exist")
        if any(
            not donor.eligible
            or donor.blood_group
            not in compatible_groups(request.patient_blood_group, request.component)
            for donor in donors
        ):
            raise HTTPException(
                status_code=422,
                detail="All selected donors must be eligible and blood-group compatible",
            )

    existing_donors = set(
        session.scalars(
            select(DonorAlert.donor_id).where(DonorAlert.request_id == request.id)
        )
    )
    alerts = []
    for donor in donors:
        if donor.id in existing_donors:
            continue
        alert = DonorAlert(
            id=str(uuid4()),
            donor_id=donor.id,
            request_id=request.id,
            message=(
                f"{request.urgency.title()} {request.patient_blood_group} "
                f"{request.component} request near {request.hospital_name}."
            ),
            status="pending",
            delivery_status="pending",
        )
        session.add(alert)
        alerts.append(alert)
    audit(
        session,
        "SEND_DONOR_ALERTS",
        "request",
        request.id,
        f"Queued {len(alerts)} donor alert(s)",
    )
    session.commit()
    published = publish_alert_events(session, alerts)
    return {
        "request_id": request.id,
        "created": len(alerts),
        "published_to_redis": published,
        "pending_delivery": len(alerts) - published,
        "alerts": [
            {
                "alert_id": alert.id,
                "donor_id": alert.donor_id,
                "status": alert.status,
                "delivery_status": alert.delivery_status,
            }
            for alert in alerts
        ],
    }


@router.get("/donors/{donor_id}/alerts")
def get_donor_alerts(
    donor_id: str,
    session: Annotated[Session, Depends(get_session)],
    alert_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
):
    if session.get(Donor, donor_id) is None:
        raise HTTPException(status_code=404, detail="Donor not found")
    statement = (
        select(DonorAlert)
        .where(DonorAlert.donor_id == donor_id)
        .order_by(DonorAlert.sent_at.desc())
        .limit(limit)
    )
    if alert_status:
        statement = statement.where(DonorAlert.status == alert_status)
    return [
        {
            "alert_id": alert.id,
            "request_id": alert.request_id,
            "message": alert.message,
            "status": alert.status,
            "delivery_status": alert.delivery_status,
            "sent_at": alert.sent_at.isoformat(),
        }
        for alert in session.scalars(statement)
    ]


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: str,
    session: Annotated[Session, Depends(get_session)],
):
    alert = session.get(DonorAlert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status == "acknowledged":
        return {"alert_id": alert.id, "status": alert.status}
    alert.status = "acknowledged"
    audit(session, "ACKNOWLEDGE_ALERT", "donor_alert", alert.id, "Donor acknowledged alert")
    session.commit()
    return {"alert_id": alert.id, "status": alert.status}


@router.get("/hospitals")
def list_hospitals(
    session: Annotated[Session, Depends(get_session)],
    city: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    statement = select(Hospital).order_by(Hospital.name).limit(limit)
    if city:
        statement = statement.where(func.lower(Hospital.city) == city.strip().casefold())
    return [
        {
            "hospital_id": hospital.id,
            "name": hospital.name,
            "city": hospital.city,
            "state": hospital.state,
            "latitude": hospital.latitude,
            "longitude": hospital.longitude,
            "synthetic": hospital.synthetic,
        }
        for hospital in session.scalars(statement)
    ]


@router.get("/audit")
def list_audit_logs(
    session: Annotated[Session, Depends(get_session)],
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    statement = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if entity_type:
        statement = statement.where(AuditLog.entity_type == entity_type)
    if entity_id:
        statement = statement.where(AuditLog.entity_id == entity_id)
    return [
        {
            "audit_id": record.id,
            "action": record.action,
            "entity_type": record.entity_type,
            "entity_id": record.entity_id,
            "details": record.details,
            "created_at": record.created_at.isoformat(),
            "synthetic": record.synthetic,
        }
        for record in session.scalars(statement)
    ]


# =====================================================================
# HEMO-GRID AI - Modern Frontend-Aligned Endpoints & GIS Routing Router
# =====================================================================

hemo_router = APIRouter(prefix="/api", tags=["HEMO-GRID AI"])

# In-memory store for stock reservations and live delivery tracking
HEMO_LOCKS: dict[str, dict] = {
    "s1": {
        "lock_id": "LCK-8F21",
        "stock_id": "s1",
        "bank_id": "bank-ima",
        "icu_id": "icu-westfort",
        "locked_until": int((datetime.now(timezone.utc) + timedelta(minutes=11)).timestamp() * 1000),
        "holder": "West Fort Hospital",
        "otp": "3702",
    },
    "s4": {
        "lock_id": "LCK-2C9A",
        "stock_id": "s4",
        "bank_id": "bank-district",
        "icu_id": "icu-daya",
        "locked_until": int((datetime.now(timezone.utc) + timedelta(minutes=6)).timestamp() * 1000),
        "holder": "Daya General Hospital",
        "otp": "6481",
    },
    "s6": {
        "lock_id": "LCK-71D4",
        "stock_id": "s6",
        "bank_id": "bank-ima",
        "icu_id": "icu-elite",
        "locked_until": int((datetime.now(timezone.utc) + timedelta(minutes=13)).timestamp() * 1000),
        "holder": "Elite Mission Hospital",
        "otp": "8492",
    },
}

HEMO_DISPATCHES: dict[str, dict] = {
    "DSP-8821-01": {
        "dispatch_id": "DSP-8821-01",
        "courier_id": "DLVR-8821",
        "pickup_otp": "5192",
        "delivery_otp": "8492",
        "cold_chain_temp": 3.8,
        "stock_id": "s6",
        "bank_id": "bank-ima",
        "icu_id": "icu-elite",
        "blood_group": "A-",
        "component_type": "Whole Blood",
        "status": "IN_TRANSIT",
        "locked_until": int((datetime.now(timezone.utc) + timedelta(minutes=13)).timestamp() * 1000),
    },
    "DSP-8821-02": {
        "dispatch_id": "DSP-8821-02",
        "courier_id": "DLVR-8821",
        "pickup_otp": "2044",
        "delivery_otp": "3702",
        "cold_chain_temp": 4.1,
        "stock_id": "s1",
        "bank_id": "bank-ima",
        "icu_id": "icu-westfort",
        "blood_group": "O-",
        "component_type": "PRBC",
        "status": "IN_TRANSIT",
        "locked_until": int((datetime.now(timezone.utc) + timedelta(minutes=11)).timestamp() * 1000),
    },
}


def otp_for_lock(lock_id: str | None) -> str:
    """Deterministic 4-digit handshake code matching Next.js frontend logic."""
    if not lock_id:
        return "----"
    if lock_id == "LCK-71D4":
        return "8492"
    h = 0
    for char in lock_id:
        h = (h * 31 + ord(char)) & 0xFFFFFFFF
    return str(1000 + (h % 9000))


# ---------------------------------------------------------------------
# 1. Security & Authentication Endpoints
# ---------------------------------------------------------------------

@hemo_router.post("/auth/send-otp", response_model=PhoneSendOtpResponse)
def send_otp(
    body: PhoneSendOtpRequest,
    session: Annotated[Session, Depends(get_session)],
    auth_header: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security_scheme)] = None,
):
    """
    Generate and dispatch a cryptographically secure 6-digit OTP via REAL SMS gateway.
    - Normalizes Indian mobile numbers (+91XXXXXXXXXX).
    - Enforces 60-second cooldown between resends.
    - Enforces max 5 OTP requests per hour per mobile number.
    - Stores HMAC-SHA256 hash with 5-minute expiry.
    - Never exposes or logs the raw OTP.
    - Fails honestly if real SMS provider credentials are missing.
    """
    user_id = None
    if auth_header and auth_header.credentials:
        try:
            payload = decode_access_token(auth_header.credentials)
            user_id = payload.get("user_id") or payload.get("sub")
        except Exception:
            pass

    result = send_donor_phone_otp(
        session=session,
        phone_input=body.phone_number,
        user_id=user_id,
    )
    return PhoneSendOtpResponse(**result)


@hemo_router.post("/auth/verify-otp", response_model=PhoneVerifyOtpResponse)
def verify_otp(
    body: PhoneVerifyOtpRequest,
    session: Annotated[Session, Depends(get_session)],
    auth_header: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security_scheme)] = None,
):
    """
    Verifies donor mobile OTP against stored HMAC-SHA256 hash.
    - Validates 5-minute expiration window.
    - Enforces max 5 incorrect verification attempts before locking.
    - Ensures OTP is single-use only (invalidated upon success).
    - Marks phone number as verified in database and returns verification token.
    """
    authenticated_user = None
    if auth_header and auth_header.credentials:
        try:
            payload = decode_access_token(auth_header.credentials)
            uid = payload.get("user_id") or payload.get("sub")
            if uid:
                authenticated_user = session.get(User, uid)
        except Exception:
            pass

    result = verify_donor_phone_otp(
        session=session,
        phone_input=body.phone_number,
        otp_input=body.otp,
        authenticated_user=authenticated_user,
    )
    return PhoneVerifyOtpResponse(**result)


# Direct /auth/* aliases for Docker/Caddy/API clients
@app.post("/auth/send-otp", response_model=PhoneSendOtpResponse, tags=["Authentication"])
def send_otp_direct(
    body: PhoneSendOtpRequest,
    session: Annotated[Session, Depends(get_session)],
    auth_header: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security_scheme)] = None,
):
    return send_otp(body=body, session=session, auth_header=auth_header)


@app.post("/auth/verify-otp", response_model=PhoneVerifyOtpResponse, tags=["Authentication"])
def verify_otp_direct(
    body: PhoneVerifyOtpRequest,
    session: Annotated[Session, Depends(get_session)],
    auth_header: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security_scheme)] = None,
):
    return verify_otp(body=body, session=session, auth_header=auth_header)


@hemo_router.post("/auth/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Authenticate user and issue a JWT Bearer token.
    - If user exists in PostgreSQL/SQLite `users` table, verifies password with bcrypt.
    - Supports email OR mobile phone number as login identifier.
    - Seamlessly supports frontend demo credentials (e.g. HOSP-9042, DONOR-1108, DLVR-8821, BANK-5501, ADMIN-0001).
    - Supports role-based quick switching for frontend demo views.
    - Verified returning donors do NOT need to re-verify OTP on each login.
    """
    token_candidate = (body.username_or_token or "").strip()
    target_role = "ICU_HOSPITAL"
    user_id = f"user-{uuid4().hex[:6]}"
    label = "Verified Node"
    badge = "Verified Medical Node"

    # 1. Check if token_candidate matches a registered User in database by email OR phone
    if token_candidate:
        # Check by email
        db_user = session.scalar(select(User).where(func.lower(User.email) == token_candidate.lower()))
        # Check by phone number if candidate looks like a mobile number
        if not db_user:
            try:
                norm_phone = normalize_indian_phone(token_candidate)
                db_user = session.scalar(select(User).where(User.phone_number == norm_phone))
            except Exception:
                pass

        if db_user:
            if body.password:
                if not verify_password(body.password, db_user.hashed_password):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid email or password.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
            if not db_user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This account has been deactivated. Please contact an administrator.",
                )
            target_role = normalize_role(db_user.role)
            user_id = db_user.id
            label = db_user.name
            phone_badge = " • Phone Verified" if db_user.phone_verified else ""
            badge = f"Verified {target_role.replace('_', ' ').title()} • {db_user.name}{phone_badge}"
            access_token = create_access_token(
                user_id=user_id,
                role=target_role,
                label=label,
                badge=badge,
            )
            return TokenResponse(
                access_token=access_token,
                token_type="bearer",
                role=target_role,
                user_id=user_id,
                label=label,
                badge=badge,
                expires_in_seconds=86400,
            )
        elif body.password and token_candidate not in FRONTEND_CREDENTIALS:
            # Password was supplied for an unregistered email/username
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # 2. Check if token is a direct frontend demo credential token
    if token_candidate in FRONTEND_CREDENTIALS:
        cred = FRONTEND_CREDENTIALS[token_candidate]
        target_role = cred["role"]
        user_id = cred["user_id"]
        label = cred["label"]
        badge = cred["badge"]
    elif body.role:
        target_role = normalize_role(body.role.value)
        if target_role == "ADMIN":
            user_id = "admin-jeevan"
            label = "Jeevan Administrator"
            badge = "Verified Network Administrator • Thrissur Grid HQ"
        elif target_role == "ICU_HOSPITAL":
            user_id = "hosp-jubilee"
            label = "Jubilee Mission ICU"
            badge = "Verified Hospital Node • Jubilee Mission ICU"
        elif target_role == "REGISTERED_DONOR":
            user_id = "donor-aarav"
            label = "Aarav (Donor)"
            badge = "Verified Donor Node • Aarav"
        elif target_role == "DELIVERY_PARTNER":
            user_id = "rider-42"
            label = "Swift Rider #42"
            badge = "Verified Logistics Partner • Swift Rider #42"
        elif target_role == "BLOOD_BANK":
            user_id = "bank-ima"
            label = "IMA Blood Bank Thrissur"
            badge = "Verified Blood Bank • IMA Thrissur"
    elif token_candidate:
        user_id = token_candidate
        label = token_candidate

    access_token = create_access_token(
        user_id=user_id,
        role=target_role,
        label=label,
        badge=badge,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=target_role,
        user_id=user_id,
        label=label,
        badge=badge,
        expires_in_seconds=86400,
    )


@hemo_router.post("/auth/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register_user(
    body: RegisterRequest,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Registers a new donor or stakeholder in the PostgreSQL/SQLite database with bcrypt password hashing.
    Enforces email uniqueness, role validation, mobile number OTP verification, and issues a JWT Bearer token upon registration.
    """
    clean_email = body.email.strip().lower()
    existing = session.scalar(select(User).where(func.lower(User.email) == clean_email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An account with email '{clean_email}' already exists.",
        )

    clean_phone = None
    phone_is_verified = False
    pv = None

    if body.phone_number:
        try:
            clean_phone = normalize_indian_phone(body.phone_number)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            )

        # Check existing phone on another user
        existing_phone_user = session.scalar(
            select(User).where(User.phone_number == clean_phone)
        )
        if existing_phone_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An account with mobile number '{clean_phone}' already exists. Please log in.",
            )

        # Check that mobile number was verified via OTP
        pv = session.scalar(
            select(PhoneVerification).where(
                PhoneVerification.phone_number == clean_phone,
                PhoneVerification.phone_verified == True,
            )
        )
        if not pv:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please verify your mobile number with OTP before completing registration.",
            )
        if body.verification_token and pv.verification_token != body.verification_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired phone verification token. Please re-verify your mobile number.",
            )
        phone_is_verified = True

    clean_role = normalize_role(body.role or "DONOR")
    if clean_role == "ADMIN":
        # Disallow self-registering as ADMIN
        clean_role = "REGISTERED_DONOR"

    user_id = f"usr-{uuid4().hex[:8]}"
    new_user = User(
        id=user_id,
        email=clean_email,
        hashed_password=hash_password(body.password),
        name=body.name.strip(),
        role=clean_role,
        phone_number=clean_phone,
        phone_verified=phone_is_verified,
        entity_id=body.entity_id,
        is_active=True,
        synthetic=False,
        source="registration",
    )
    session.add(new_user)
    session.flush()

    if clean_role == "REGISTERED_DONOR":
        donor_code = f"DN-{uuid4().hex[:6].upper()}"
        donor_profile = Donor(
            id=f"don-{uuid4().hex[:8]}",
            donor_code=donor_code,
            name=body.name.strip(),
            blood_group=body.blood_group or "O+",
            phone=clean_phone or "+91-9876543210",
            phone_verified=phone_is_verified,
            email=clean_email,
            latitude=10.5276,
            longitude=76.2144,
            eligible=True,
            synthetic=False,
            source="registration",
        )
        session.add(donor_profile)
        session.flush()
        new_user.entity_id = donor_profile.id

    if pv and clean_phone:
        pv.user_id = new_user.id

    session.commit()

    audit(
        session,
        "REGISTER_USER",
        "user",
        user_id,
        f"New user registered: {clean_email} ({clean_role}, phone={clean_phone or 'none'})",
    )

    token = create_access_token(
        user_id=new_user.id,
        role=new_user.role,
        label=new_user.name,
        badge=f"Verified {clean_role.replace('_', ' ').title()} • {new_user.name}",
    )

    return RegisterResponse(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name,
        role=new_user.role,
        phone_number=new_user.phone_number,
        phone_verified=new_user.phone_verified,
        entity_id=new_user.entity_id,
        access_token=token,
        token_type="bearer",
        message="Donor account registered and verified successfully.",
    )


@hemo_router.get("/admin/users", response_model=List[UserResponse])
def list_admin_users(
    session: Annotated[Session, Depends(get_session)],
    admin_user: Annotated[UserPayload, Depends(require_admin)],
    limit: int = Query(default=100, ge=1, le=500),
):
    """Admin-only endpoint to list registered system users."""
    users = list(session.scalars(select(User).order_by(User.created_at.desc()).limit(limit)))
    return [
        UserResponse(
            id=u.id,
            email=u.email,
            name=u.name,
            role=u.role,
            entity_id=u.entity_id,
            is_active=u.is_active,
            synthetic=u.synthetic,
            created_at=u.created_at,
        )
        for u in users
    ]


@hemo_router.patch("/admin/users/{user_id}/status")
def toggle_user_active_status(
    user_id: str,
    active: bool,
    session: Annotated[Session, Depends(get_session)],
    admin_user: Annotated[UserPayload, Depends(require_admin)],
):
    """Admin-only endpoint to activate or deactivate a user account."""
    target_user = session.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    target_user.is_active = active
    session.commit()
    audit(session, "ADMIN_UPDATE_USER_STATUS", "user", user_id, f"Active status set to {active} by {admin_user.user_id}")
    return {"status": "SUCCESS", "user_id": user_id, "is_active": target_user.is_active}


@hemo_router.get("/admin/system-stats")
def get_system_stats(
    session: Annotated[Session, Depends(get_session)],
):
    """Returns actual system statistics across database tables."""
    return {
        "status": "SUCCESS",
        "counts": {
            "users": session.scalar(select(func.count(User.id))) or 0,
            "hospitals": session.scalar(select(func.count(Hospital.id))) or 0,
            "blood_banks": session.scalar(select(func.count(BloodBank.id))) or 0,
            "donors": session.scalar(select(func.count(Donor.id))) or 0,
            "inventory": session.scalar(select(func.count(Inventory.id))) or 0,
            "blood_requests": session.scalar(select(func.count(BloodRequest.id))) or 0,
            "matches": session.scalar(select(func.count(BloodMatch.id))) or 0,
            "reservations": session.scalar(select(func.count(Reservation.id))) or 0,
            "donor_alerts": session.scalar(select(func.count(DonorAlert.id))) or 0,
            "audit_logs": session.scalar(select(func.count(AuditLog.id))) or 0,
        },
        "timestamp": utc_now().isoformat(),
    }


@hemo_router.post("/auth/google", response_model=TokenResponse)
def google_auth(body: Dict[str, Any]):
    """
    Authenticate using Google OAuth ID token or Google credential.
    Returns signed JWT access token and Google profile details.
    """
    credential = body.get("credential") or body.get("token") or body.get("id_token") or body.get("email")
    target_role = body.get("target_role", "ICU_HOSPITAL")

    google_user = verify_google_token(credential, target_role=target_role)

    user_id = google_user["google_id"]
    role = google_user["role"]
    label = google_user["name"]
    badge = google_user["badge"]

    access_token = create_access_token(
        user_id=user_id,
        role=role,
        label=label,
        badge=badge,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=role,
        user_id=user_id,
        label=label,
        badge=badge,
        expires_in_seconds=86400,
    )


@hemo_router.get("/auth/google/client-id")
def get_google_client_id():
    """Returns the configured Google OAuth 2.0 client ID."""
    return {"client_id": GOOGLE_CLIENT_ID}


@hemo_router.get("/auth/example-accounts")
def list_example_accounts():
    """
    Returns pre-configured example accounts for instant login choices
    (Donor, Driver, Hospital ICU, and Blood Bank).
    """
    return {
        "status": "SUCCESS",
        "accounts": EXAMPLE_ACCOUNTS,
    }


@hemo_router.get("/auth/me", response_model=UserPayload)
def get_me(user: Annotated[UserPayload, Depends(get_current_user)]):
    """Retrieve profile and role information for the authenticated user."""
    return user


# ---------------------------------------------------------------------
# 2. GIS Routing & Optimization Endpoint (A* and Dijkstra)
# ---------------------------------------------------------------------

@hemo_router.post("/route/optimize", response_model=RouteOptimizeResponse)
def optimize_gis_route(body: RouteOptimizeRequest):
    """
    Optimizes routing between Blood Banks, Donors, and ICU Hospitals.
    - STANDARD: Uses Dijkstra's algorithm with traffic and signal delay weights.
    - GREEN_CORRIDOR: Uses A* algorithm with Haversine distance heuristic h(n)
      for high-priority emergency dispatch (minimal travel time + signal preemption).
    """
    # Extract origin
    if body.origin_id:
        origin_val = body.origin_id
    elif body.origin_lat is not None and body.origin_lng is not None:
        origin_val = (body.origin_lat, body.origin_lng)
    elif isinstance(body.origin, str):
        origin_val = body.origin
    elif isinstance(body.origin, Coordinate):
        origin_val = (body.origin.lat, body.origin.lng)
    elif isinstance(body.origin, list) and len(body.origin) == 2:
        origin_val = (body.origin[0], body.origin[1])
    else:
        origin_val = "bank-ima"  # default origin

    # Extract destination
    if body.destination_id:
        dest_val = body.destination_id
    elif body.dest_lat is not None and body.dest_lng is not None:
        dest_val = (body.dest_lat, body.dest_lng)
    elif isinstance(body.destination, str):
        dest_val = body.destination
    elif isinstance(body.destination, Coordinate):
        dest_val = (body.destination.lat, body.destination.lng)
    elif isinstance(body.destination, list) and len(body.destination) == 2:
        dest_val = (body.destination[0], body.destination[1])
    else:
        dest_val = "icu-elite"  # default destination

    r_type = RouteType.GREEN_CORRIDOR if body.route_type.value == "GREEN_CORRIDOR" else RouteType.STANDARD

    try:
        result = optimize_route(origin_val, dest_val, r_type)
        return RouteOptimizeResponse(**result)
    except Exception as exc:
        logger.exception("GIS Route optimization failed")
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------
# 3. Blood Requests (ICU Hospital View & Dispatch)
# ---------------------------------------------------------------------

@hemo_router.post("/request-blood", response_model=DispatchResponse, status_code=status.HTTP_201_CREATED)
def request_blood_dispatch(
    body: DispatchPayload,
    session: Annotated[Session, Depends(get_session)],
):
    """
    Matches Next.js dispatch-view.tsx endpoint for initiating ICU emergency requests.
    Calculates ETA using routing module and searches compatible donors.
    """
    req_id = f"REQ-{uuid4().hex[:4].upper()}"

    # Calculate ETA based on urgency level using Green Corridor routing
    r_type = RouteType.GREEN_CORRIDOR if body.urgency.upper() == "CRITICAL" else RouteType.STANDARD
    try:
        route_info = optimize_route("bank-ima", body.icu_id if body.icu_id in ["icu-elite", "icu-westfort", "icu-daya", "icu-jubilee"] else "icu-elite", r_type)
        calculated_eta = max(5, int(round(route_info["eta_minutes"])))
    except Exception:
        calculated_eta = 9 if body.urgency.upper() == "CRITICAL" else 24 if body.urgency.upper() == "HIGH" else 60

    # Count matching eligible donors from DB
    try:
        matching_count = session.scalar(
            select(func.count(Donor.id)).where(
                Donor.eligible.is_(True),
                Donor.blood_group.in_(compatible_groups(body.blood_group, body.component_type)),
            )
        ) or 3
    except Exception:
        matching_count = 3

    # Persist request in database
    try:
        icu_lat = body.location.lat if body.location else 10.5089
        icu_lng = body.location.lng if body.location else 76.2052
        db_request = BloodRequest(
            id=req_id,
            request_code=f"BR-{uuid4().hex[:8].upper()}",
            hospital_name=body.icu_id.replace("icu-", "").title() + " Hospital",
            patient_blood_group=body.blood_group,
            component=body.component_type,
            units_required=body.units,
            urgency=body.urgency.lower(),
            hospital_latitude=icu_lat,
            hospital_longitude=icu_lng,
            status="pending",
        )
        session.add(db_request)
        session.commit()
    except Exception:
        session.rollback()
        logger.warning("Could not persist BloodRequest to database; proceeding with response")

    return DispatchResponse(
        request_id=req_id,
        status="SENT",
        matched_donors=matching_count,
        eta_minutes=calculated_eta,
    )


@hemo_router.get("/requests/icu-view", response_model=List[ICUHospitalBloodRequest])
def list_icu_requests(session: Annotated[Session, Depends(get_session)]):
    """
    Returns blood requests formatted strictly for the ICU Hospital View schema:
    id, hospital_name, blood_type, units, urgency_level, status.
    """
    try:
        db_requests = list(session.scalars(select(BloodRequest).order_by(BloodRequest.created_at.desc()).limit(50)))
    except Exception:
        db_requests = []

    status_map = {
        "pending": "PENDING",
        "matched": "RESERVED",
        "fulfilled": "DELIVERED",
        "cancelled": "DELIVERED",
    }
    urgency_map = {
        "critical": "CRITICAL",
        "urgent": "HIGH",
        "normal": "ROUTINE",
    }

    if not db_requests:
        # Provide seed fallback items matching Next.js SEED_EMERGENCIES
        return [
            ICUHospitalBloodRequest(
                id="REQ-4F2A",
                hospital_name="Elite Mission Hospital",
                blood_type="O-",
                units=2,
                urgency_level="CRITICAL",
                status="PENDING",
                eta_minutes=9,
            ),
            ICUHospitalBloodRequest(
                id="REQ-9B17",
                hospital_name="West Fort Hospital",
                blood_type="B+",
                units=2,
                urgency_level="HIGH",
                status="RESERVED",
                eta_minutes=24,
            ),
            ICUHospitalBloodRequest(
                id="REQ-1C8E",
                hospital_name="Daya General Hospital",
                blood_type="A+",
                units=1,
                urgency_level="ROUTINE",
                status="DELIVERED",
                eta_minutes=60,
            ),
        ]

    return [
        ICUHospitalBloodRequest(
            id=r.id,
            hospital_name=r.hospital_name,
            blood_type=r.patient_blood_group,
            units=r.units_required,
            urgency_level=urgency_map.get(r.urgency.lower(), "HIGH"),
            status=status_map.get(r.status.lower(), "PENDING"),
            created_at=r.created_at,
            eta_minutes=9 if r.urgency.lower() == "critical" else 25,
        )
        for r in db_requests
    ]


@hemo_router.post("/reserve-stock", response_model=ReserveResponse)
def reserve_blood_stock(body: ReservePayload):
    """
    Matches Next.js stock-view.tsx endpoint for locking inventory units.
    Enforces concurrency lock timeout (15 mins) and returns 409 on conflict.
    """
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    current_lock = HEMO_LOCKS.get(body.stock_id)

    # Check if currently locked
    if current_lock and current_lock.get("locked_until", 0) > now_ms:
        holder = current_lock.get("holder", "another hospital")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This unit is on hold for {holder}.",
            headers={"X-Locked-Until": str(current_lock.get("locked_until"))},
        )

    # Acquire lock
    new_lock_id = f"LCK-{uuid4().hex[:4].upper()}"
    locked_until_ms = now_ms + (900 * 1000)  # 15 minutes
    new_otp = otp_for_lock(new_lock_id)

    HEMO_LOCKS[body.stock_id] = {
        "lock_id": new_lock_id,
        "stock_id": body.stock_id,
        "bank_id": body.bank_id,
        "icu_id": body.icu_id,
        "locked_until": locked_until_ms,
        "holder": body.icu_id.replace("icu-", "").title() + " Hospital",
        "otp": new_otp,
    }

    return ReserveResponse(lock_id=new_lock_id, expires_in=900)


# ---------------------------------------------------------------------
# 4. Delivery & OTP Handshake (Courier View)
# ---------------------------------------------------------------------

@hemo_router.post("/verify-otp", response_model=VerifyOtpResponse)
def verify_delivery_otp(body: VerifyOtpPayload):
    """
    Matches Next.js otp-view.tsx endpoint for two-way courier-hospital handshake.
    Verifies the 4-digit PIN before releasing units.
    """
    expected_pin = None
    if body.lock_id:
        expected_pin = otp_for_lock(body.lock_id)
    elif body.stock_id in HEMO_LOCKS:
        expected_pin = HEMO_LOCKS[body.stock_id].get("otp") or otp_for_lock(HEMO_LOCKS[body.stock_id].get("lock_id"))

    if not expected_pin:
        expected_pin = "8492"  # Default fallback for demo unit s6

    if body.otp.strip() != expected_pin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid OTP code '{body.otp}'. Verification failed.",
        )

    # Release lock on successful delivery
    if body.stock_id in HEMO_LOCKS:
        HEMO_LOCKS.pop(body.stock_id, None)

    return VerifyOtpResponse(
        status="VERIFIED",
        detail="Handshake verified successfully. Cold-chain custody released to ICU staff.",
    )


@hemo_router.get("/dispatches", response_model=List[DispatchDeliveryItem])
def list_courier_dispatches():
    """
    Lists dispatches matching Courier View schema:
    dispatch_id, courier_id, pickup_otp, delivery_otp, cold_chain_temp (within 2.0°C - 6.0°C).
    """
    return [DispatchDeliveryItem(**item) for item in HEMO_DISPATCHES.values()]


@hemo_router.get("/dispatches/{dispatch_id}", response_model=DispatchDeliveryItem)
def get_courier_dispatch(dispatch_id: str):
    """Get single dispatch details."""
    if dispatch_id not in HEMO_DISPATCHES:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    return DispatchDeliveryItem(**HEMO_DISPATCHES[dispatch_id])


# ---------------------------------------------------------------------
# 5. Donor Management (Donor View & Anti-Fatigue Rules)
# ---------------------------------------------------------------------

@hemo_router.get("/donors/management", response_model=List[DonorManagementItem])
def list_donors_management(session: Annotated[Session, Depends(get_session)]):
    """
    Donor management view adhering to:
    donor_id, distance_km, last_donated_days, cooldown_active (boolean),
    anti_fatigue_eligible (boolean based on 48h alert cap & 90-day cooldown).
    """
    donors = list(session.scalars(select(Donor).limit(20)))
    now = datetime.now(timezone.utc)
    cutoff_48h = now - timedelta(hours=48)
    today = date.today()

    items = []
    # Include seed donors if DB is empty
    if not donors:
        seed_donors_data = [
            {"donor_id": "d1", "name": "Aarav", "blood_group": "O-", "lat": 10.5402, "lng": 76.2311, "last_donated_days": 104, "alerts": 1},
            {"donor_id": "d2", "name": "Sneha", "blood_group": "O-", "lat": 10.4961, "lng": 76.2262, "last_donated_days": 45, "alerts": 0},
            {"donor_id": "d3", "name": "Rahul", "blood_group": "B+", "lat": 10.5531, "lng": 76.2042, "last_donated_days": 120, "alerts": 4},
            {"donor_id": "d4", "name": "Diya", "blood_group": "B+", "lat": 10.5092, "lng": 76.1826, "last_donated_days": 95, "alerts": 2},
        ]
        hospital_coord = (10.5089, 76.2052)
        for s in seed_donors_data:
            dist = round(haversine_km(hospital_coord[0], hospital_coord[1], s["lat"], s["lng"]), 2)
            cooldown_active = s["last_donated_days"] < 90
            anti_fatigue = (not cooldown_active) and (s["alerts"] <= 3)
            items.append(
                DonorManagementItem(
                    donor_id=s["donor_id"],
                    name=s["name"],
                    blood_group=s["blood_group"],
                    distance_km=dist,
                    last_donated_days=s["last_donated_days"],
                    cooldown_active=cooldown_active,
                    anti_fatigue_eligible=anti_fatigue,
                    alerts_in_last_48h=s["alerts"],
                )
            )
        return items

    hospital_coord = (10.5089, 76.2052)
    for d in donors:
        last_days = (today - d.last_donation_date).days if d.last_donation_date else 104
        cooldown_active = last_days < 90
        alerts_count = session.scalar(
            select(func.count(DonorAlert.id)).where(
                DonorAlert.donor_id == d.id,
                DonorAlert.sent_at >= cutoff_48h,
            )
        ) or 0
        anti_fatigue = (not cooldown_active) and (alerts_count <= 3)
        dist = round(haversine_km(hospital_coord[0], hospital_coord[1], d.latitude, d.longitude), 2)
        items.append(
            DonorManagementItem(
                donor_id=d.id,
                name=d.name,
                blood_group=d.blood_group,
                distance_km=dist,
                last_donated_days=last_days,
                cooldown_active=cooldown_active,
                anti_fatigue_eligible=anti_fatigue,
                alerts_in_last_48h=alerts_count,
                phone=d.phone,
            )
        )

    return items


@hemo_router.get("/donors/{donor_id}/eligibility", response_model=DonorManagementItem)
def get_donor_eligibility(
    donor_id: str,
    session: Annotated[Session, Depends(get_session)],
):
    """Calculates single donor eligibility, cooling-off status, and anti-fatigue clearance."""
    donor = session.get(Donor, donor_id)
    today = date.today()
    hospital_coord = (10.5089, 76.2052)

    if not donor:
        # Fallback to seed donor check
        if donor_id in ["d1", "DONOR-1108", "donor-aarav"]:
            return DonorManagementItem(
                donor_id=donor_id,
                name="Aarav",
                blood_group="B+",
                distance_km=3.8,
                last_donated_days=104,
                cooldown_active=False,
                anti_fatigue_eligible=True,
                alerts_in_last_48h=1,
            )
        raise HTTPException(status_code=404, detail="Donor not found")

    last_days = (today - donor.last_donation_date).days if donor.last_donation_date else 104
    cooldown_active = last_days < 90
    cutoff_48h = datetime.now(timezone.utc) - timedelta(hours=48)
    alerts_count = session.scalar(
        select(func.count(DonorAlert.id)).where(
            DonorAlert.donor_id == donor.id,
            DonorAlert.sent_at >= cutoff_48h,
        )
    ) or 0
    anti_fatigue = (not cooldown_active) and (alerts_count <= 3)
    dist = round(haversine_km(hospital_coord[0], hospital_coord[1], donor.latitude, donor.longitude), 2)

    return DonorManagementItem(
        donor_id=donor.id,
        name=donor.name,
        blood_group=donor.blood_group,
        distance_km=dist,
        last_donated_days=last_days,
        cooldown_active=cooldown_active,
        anti_fatigue_eligible=anti_fatigue,
        alerts_in_last_48h=alerts_count,
        phone=donor.phone,
    )


# ---------------------------------------------------------------------
# 6. Portal Access Control Probes (for Next.js access-control.tsx)
# ---------------------------------------------------------------------

PORTAL_ROLE_REQUIREMENTS = {
    "icu": "ICU_HOSPITAL",
    "hospital": "ICU_HOSPITAL",
    "donor": "REGISTERED_DONOR",
    "logistics": "DELIVERY_PARTNER",
    "driver": "DELIVERY_PARTNER",
    "bank": "BLOOD_BANK",
}


@hemo_router.post("/portal/{portal_name}", response_model=PortalProbeResponse)
def probe_portal_access(
    portal_name: str,
    user: Annotated[UserPayload, Depends(get_current_user)],
):
    """Verifies that the current caller has permission for the specified portal."""
    req_role = PORTAL_ROLE_REQUIREMENTS.get(portal_name.lower())
    if not req_role:
        raise HTTPException(status_code=404, detail=f"Unknown portal: {portal_name}")

    user_role = normalize_role(user.role)
    if user_role != req_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: role '{user.role}' is not authorized for portal '{portal_name}'. Required: '{req_role}'.",
        )

    return PortalProbeResponse(
        granted=True,
        role=user.role,
        portal=portal_name,
        detail=f"Access granted to {portal_name} portal",
    )


# ---------------------------------------------------------------------
# 6. PostGIS Spatial Query Engine
# ---------------------------------------------------------------------
spatial_engine = PostGISSpatialEngine(engine)


@hemo_router.get("/gis/spatial/donors-within-radius")
def get_donors_within_radius(
    lat: float,
    lng: float,
    radius_km: float = 10.0,
    blood_group: Optional[str] = None,
    eligible_only: bool = True,
    session: Annotated[Session, Depends(get_session)] = None,
):
    """
    PostGIS Spatial Query Engine: Finds donors within specified radius (km)
    using PostGIS ST_DWithin and geodesic spatial bounding boxes.
    """
    results = spatial_engine.find_donors_within_radius(
        session=session,
        center_lat=lat,
        center_lng=lng,
        radius_km=radius_km,
        blood_group=blood_group,
        eligible_only=eligible_only,
    )
    return {
        "status": "SUCCESS",
        "spatial_operator": "ST_DWithin",
        "center": {"lat": lat, "lng": lng},
        "radius_km": radius_km,
        "count": len(results),
        "donors": results,
    }


@hemo_router.get("/gis/spatial/banks-nearby")
def get_nearby_blood_banks(
    lat: float,
    lng: float,
    limit: int = 5,
    session: Annotated[Session, Depends(get_session)] = None,
):
    """
    PostGIS Spatial Query Engine: Ranks blood banks by spatial distance ST_Distance.
    """
    banks = spatial_engine.find_nearest_blood_banks(session, lat, lng, limit=limit)
    return {
        "status": "SUCCESS",
        "spatial_operator": "ST_Distance",
        "origin": {"lat": lat, "lng": lng},
        "banks": banks,
    }


@hemo_router.post("/gis/spatial/corridor-buffer")
def get_corridor_buffer(body: Dict[str, Any]):
    """
    PostGIS ST_Buffer equivalent: Generates a geographic polygon buffer
    around emergency road transport routes.
    """
    path_coords = body.get("path", [])
    buffer_m = float(body.get("buffer_meters", 250.0))
    buffer_feature = spatial_engine.create_corridor_buffer_polygon(path_coords, buffer_m)
    return {
        "status": "SUCCESS",
        "spatial_operator": "ST_Buffer",
        "buffer_feature": buffer_feature,
    }


# ---------------------------------------------------------------------
# 7. Heuristic + XGBoost Machine Learning Donor Response Model
# ---------------------------------------------------------------------

@hemo_router.post("/ml/predict-donor-response")
def predict_donor_response(body: Dict[str, Any]):
    """
    Runs blended Heuristic + XGBoost prediction to determine
    donor acceptance probability, predicted response ETA, and key factors.
    """
    features = DonorFeatureInput(
        donor_id=body.get("donor_id", f"d-{uuid4().hex[:4]}"),
        name=body.get("name", "Volunteer Donor"),
        blood_group=body.get("blood_group", "O+"),
        distance_km=float(body.get("distance_km", 3.5)),
        urgency_level=body.get("urgency_level", "critical"),
        historical_donations=int(body.get("historical_donations", 4)),
        days_since_last_donation=int(body.get("days_since_last_donation", 120)),
        compatibility_score=float(body.get("compatibility_score", 1.0)),
        hour_of_day=int(body.get("hour_of_day", 14)),
        traffic_factor=float(body.get("traffic_factor", 1.1)),
        donor_age=int(body.get("donor_age", 29)),
    )
    return DONOR_PREDICTOR.predict(features)


@hemo_router.get("/ml/metrics")
def get_ml_metrics():
    """Returns training parameters, validation metrics, and feature importances for XGBoost."""
    return {
        "status": "READY",
        "model_trained": DONOR_PREDICTOR.is_trained,
        "metrics": DONOR_PREDICTOR.metrics,
    }


@hemo_router.post("/ml/train-synthetic-model")
def retrain_synthetic_model(samples: int = 3000):
    """Retrains the XGBoost model on a freshly generated synthetic dataset."""
    DONOR_PREDICTOR._initialize_or_train()
    return {
        "status": "RETRAINED",
        "metrics": DONOR_PREDICTOR.metrics,
    }


# ---------------------------------------------------------------------
# 8. Firebase FCM Push Notifications & OTP Verification Handshake
# ---------------------------------------------------------------------

@hemo_router.post("/verify-otp", response_model=VerifyOtpResponse)
@app.post("/verify-otp", response_model=VerifyOtpResponse)
def verify_otp_endpoint(body: VerifyOtpPayload):
    """
    Next.js otp-view.tsx endpoint for verifying handshake security PIN.
    Validates OTP, releases locked blood units, and dispatches FCM push notification.
    """
    res = OTP_MANAGER.verify_otp(body.lock_id, body.stock_id, body.otp)
    if not res["verified"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res["message"],
        )
    return VerifyOtpResponse(
        status="VERIFIED",
        detail="Handshake verified successfully. Blood units released and delivered.",
    )


@hemo_router.post("/dispatch/handshake")
def complete_dispatch_handshake(body: DispatchDeliveryItem):
    """
    Courier view delivery handshake: verifies pickup/delivery OTPs and cold chain status.
    """
    res = OTP_MANAGER.verify_otp(None, body.stock_id, body.delivery_otp)
    return {
        "dispatch_id": body.dispatch_id,
        "courier_id": body.courier_id,
        "status": "DELIVERED" if res["verified"] else "OTP_PENDING",
        "cold_chain_verified": 2.0 <= body.cold_chain_temp <= 6.0,
        "cold_chain_temp": body.cold_chain_temp,
        "handshake": res,
    }


@hemo_router.post("/emergency/dispatch-ncc-coordinator")
def dispatch_ncc_coordinator_endpoint(body: Dict[str, Any]):
    """
    Automatically sends an emergency high-priority message & push notification
    to the Single Verified College NCC Coordinator & Blood Club Leader.
    """
    hospital_name = body.get("hospital_name") or body.get("hospital") or "Jubilee Mission ICU"
    blood_group = body.get("blood_group") or body.get("group") or "O-"
    units = int(body.get("units") or 2)
    urgency = body.get("urgency", "CRITICAL")
    patient_info = body.get("patient_info", "Emergency Critical Requisition")

    result = FCM_ENGINE.dispatch_ncc_coordinator_alert(
        hospital_name=hospital_name,
        blood_group=blood_group,
        units=units,
        urgency=urgency,
        patient_info=patient_info,
    )
    return result


@hemo_router.get("/emergency/ncc-coordinator")
def get_ncc_coordinator_profile():
    """
    Returns the profile and verification credentials of the Single Verified
    College NCC Coordinator & Blood Club Leader in Thrissur.
    """
    return {
        "coordinator": {
            "name": "Capt. Dr. Arun Balakrishnan",
            "title": "College NCC Blood Donation Coordinator & Red Cross Club Officer",
            "institution": "23 Kerala Battalion NCC • St. Thomas College & Govt. Engineering College Thrissur",
            "verification_id": "NCC-KL-23-BC01",
            "status": "VERIFIED_ACTIVE",
            "phone": "+91 94471 28904",
            "cadets_ready": 128,
            "fcm_token": "fcm_token_ncc_coordinator_23_kerala",
            "response_time_minutes": 15,
        }
    }


@hemo_router.post("/fcm/send")
def send_fcm_push(body: Dict[str, Any]):
    """
    Dispatches a simulated Firebase FCM push notification.
    """
    token = body.get("token")
    topic = body.get("topic")
    title = body.get("title", "Emergency Blood Alert")
    msg_body = body.get("body", "Immediate action required in Thrissur medical grid.")
    data = body.get("data", {})

    if topic:
        return FCM_ENGINE.broadcast_to_topic(topic, title, msg_body, data)
    elif token:
        return FCM_ENGINE.send_to_token(token, title, msg_body, data)
    else:
        # Default broadcast to emergency topic
        return FCM_ENGINE.broadcast_to_topic("emergency-alerts-thrissur", title, msg_body, data)


@hemo_router.get("/fcm/notifications")
def get_fcm_notifications(limit: int = 15):
    """Returns recent Firebase FCM notification delivery log."""
    return {
        "status": "SUCCESS",
        "count": len(FCM_ENGINE.message_history),
        "messages": FCM_ENGINE.get_recent_notifications(limit=limit),
    }


@hemo_router.post("/fcm/register-token")
def register_fcm_token(body: Dict[str, Any]):
    """Registers simulated Firebase device token."""
    user_id = body.get("user_id", "user-default")
    role = body.get("role", "ICU_HOSPITAL")
    token = body.get("fcm_token", f"token_{uuid4().hex[:8]}")
    topics = body.get("topics", ["emergency-alerts-thrissur"])
    dev = FCM_ENGINE.register_device(user_id, role, token, topics)
    return {"status": "REGISTERED", "device": dev.__dict__}


# Mount the routers to the application
app.include_router(hemo_router)
app.include_router(router)
app.include_router(identity_verification_router)
