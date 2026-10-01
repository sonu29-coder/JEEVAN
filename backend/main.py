import asyncio
import hmac
import json
import logging
import math
import os
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from redis.exceptions import RedisError
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from backend.database import Base, SessionLocal, engine, redis_client
from backend.models import (
    AuditLog,
    BloodBank,
    BloodMatch,
    BloodRequest,
    Donor,
    DonorAlert,
    Hospital,
    Inventory,
    Reservation,
    utc_now,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("jeevan")
ALERT_STREAM = "jeevan:donor-alerts"
AVAILABILITY_CACHE_PREFIX = "jeevan:availability:"
AVAILABILITY_TTL_SECONDS = 30

BLOOD_GROUPS = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
COMPONENTS = {"Whole Blood", "RBC", "Platelets", "Plasma"}
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


def require_api_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
    configured_key = os.getenv("JEEVAN_API_KEY")
    if not configured_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API access is disabled until JEEVAN_API_KEY is configured",
        )
    if not x_api_key or not hmac.compare_digest(x_api_key, configured_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid X-API-Key header is required",
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
    if component == "Plasma":
        abo_group = recipient_group.rstrip("+-")
        plasma_groups = {
            "O": {"AB-", "AB+"},
            "A": {"A-", "A+", "AB-", "AB+"},
            "B": {"B-", "B+", "AB-", "AB+"},
            "AB": BLOOD_GROUPS,
        }
        return plasma_groups[abo_group]
    if component == "Platelets":
        abo_group = recipient_group.rstrip("+-")
        return {
            group
            for group in BLOOD_GROUPS
            if group.rstrip("+-") == abo_group
        }
    return DONOR_GROUPS_FOR_RECIPIENT[recipient_group]


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
    except RedisError:
        logger.exception("Could not invalidate the blood availability cache")


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
    worker_task = asyncio.create_task(background_work_worker())
    try:
        yield
    finally:
        worker_task.cancel()
        with suppress(asyncio.CancelledError):
            await worker_task
        redis_client.close()


app = FastAPI(
    title="JEEVAN API",
    description=(
        "Blood availability, geographic donor matching, hospital requests, "
        "reservations, donor alerts, and an audit trail."
    ),
    version="1.0.0",
    lifespan=lifespan,
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
    checks = {"postgres": "connected", "redis": "connected"}
    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except Exception:
        logger.exception("PostgreSQL health check failed")
        checks["postgres"] = "unavailable"
    try:
        redis_client.ping()
    except RedisError:
        logger.exception("Redis health check failed")
        checks["redis"] = "unavailable"
    healthy = all(value == "connected" for value in checks.values())
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
    if blood_group is not None and blood_group not in BLOOD_GROUPS:
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
        statement = statement.where(Inventory.component == component)
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
            Inventory.component == request.component,
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
    if inventory.component != request.component or inventory.blood_group not in compatible_groups(
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
        except RedisError:
            logger.exception("Alert %s remains pending in PostgreSQL", alert.id)
            continue
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


app.include_router(router)
