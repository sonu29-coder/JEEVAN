import base64
import hashlib
import hmac
import json
import os
import re
import time
from datetime import datetime, timezone
from secrets import token_urlsafe
from typing import Annotated, Any, Dict, Optional

import pyotp
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth import decode_access_token, normalize_role
from backend.database import SessionLocal
from backend.models import DonorIdentityVerification, User

router = APIRouter(prefix="/api/donor/identity", tags=["Donor identity verification"])
DEMO_PROVIDER = "DEMO"
WEBHOOK_MAX_AGE_SECONDS = 300
WEBHOOK_MAX_BODY_BYTES = 4096
PROVIDER_REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
TOTP_INTERVAL_SECONDS = 120  # 2-minute validity window for TOTP


def send_sms(phone_number: str, message: str) -> bool:
    """
    Stub function for SMS dispatch.
    To be connected to an actual external SMS gateway provider (e.g. Fast2SMS, Twilio, AWS SNS) later.
    Returns True indicating the SMS request was accepted.
    """
    # STUB: ready to connect to external SMS provider later
    return True


def get_totp_secret_for_user(user_id: str, seed: str = "") -> str:
    """
    Derives a deterministic, cryptographically secure Base32 secret for TOTP.
    """
    secret_key = (
        os.getenv("JWT_SECRET_KEY")
        or os.getenv("JEEVAN_API_KEY")
        or "jeevan-identity-totp-secret-salt-2026"
    ).encode("utf-8")
    h = hmac.new(secret_key, f"{user_id}:{seed}".encode("utf-8"), hashlib.sha256).digest()
    return base64.b32encode(h[:20]).decode("utf-8")


def generate_totp(secret: str | None = None) -> tuple[str, str]:
    """
    Generates a secure 6-digit Time-based One-Time Password (TOTP) using pyotp.
    Returns (otp_code, base32_secret).
    """
    sec = secret or pyotp.random_base32()
    totp = pyotp.TOTP(sec, interval=TOTP_INTERVAL_SECONDS)
    return totp.now(), sec


def verify_totp(secret: str, code: str) -> bool:
    """
    Verifies a submitted TOTP code against the Base32 secret using pyotp with a 1-step window allowance.
    """
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret, interval=TOTP_INTERVAL_SECONDS)
    return bool(totp.verify(str(code).strip(), valid_window=1))



def get_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def require_persisted_donor(
    session: Annotated[Session, Depends(get_session)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in with a donor account to access identity verification.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[7:].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A signed-in donor account is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    user_id = payload.get("user_id") or payload.get("sub")
    token_role = payload.get("role")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid sign-in.")

    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A persisted, active donor account is required.",
        )
    if (
        not isinstance(token_role, str)
        or normalize_role(token_role) != "REGISTERED_DONOR"
        or normalize_role(user.role) != "REGISTERED_DONOR"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Identity verification is available to donor accounts only.",
        )
    return user


def require_demo_provider() -> None:
    if os.getenv("IDENTITY_PROVIDER_MODE", "demo").strip().lower() != "demo":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No real identity verification provider integration is configured.",
        )


def public_status(
    record: DonorIdentityVerification | None,
) -> dict[str, object]:
    return {
        "verification_status": record.verification_status if record else "not_started",
        "provider": record.provider if record else DEMO_PROVIDER,
        "verified_at": record.verified_at if record else None,
        "demo_mode": True,
        "notice": (
            "DEMO only: no real identity or Aadhaar verification was performed, "
            "and no identity documents or numbers are collected."
        ),
    }


async def read_limited_body(request: Request) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > WEBHOOK_MAX_BODY_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Request body is too large.",
            )
        body.extend(chunk)
    return bytes(body)


@router.get("/status")
def get_identity_status(
    user: Annotated[User, Depends(require_persisted_donor)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    require_demo_provider()
    record = session.get(DonorIdentityVerification, user.id)
    return public_status(record)


@router.post("/start")
async def start_identity_verification(
    request: Request,
    user: Annotated[User, Depends(require_persisted_donor)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    require_demo_provider()
    if request.headers.get("content-length", "").isdigit() and int(request.headers["content-length"]) > WEBHOOK_MAX_BODY_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Request body is too large.")
    request_body = await read_limited_body(request)
    if request_body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identity verification does not accept identity numbers or documents.",
        )
    record = session.get(DonorIdentityVerification, user.id)
    if record is None:
        record = DonorIdentityVerification(
            user_id=user.id,
            verification_status="pending",
            provider=DEMO_PROVIDER,
            provider_reference=token_urlsafe(32),
        )
        session.add(record)
    elif record.verification_status != "verified":
        if record.verification_status == "failed":
            record.provider_reference = token_urlsafe(32)
        record.verification_status = "pending"
        record.provider = DEMO_PROVIDER
        record.verified_at = None
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        record = session.get(DonorIdentityVerification, user.id)
        if record is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Verification could not be started. Please try again.",
            ) from None

    # Generate 6-digit TOTP using pyotp and dispatch via send_sms stub
    totp_secret = get_totp_secret_for_user(user.id, record.provider_reference)
    totp_code, _ = generate_totp(totp_secret)
    target_phone = user.phone_number or "+919876543210"
    send_sms(target_phone, f"Your JEEVAN donor identity verification code is {totp_code}. Valid for 2 minutes.")

    # Return status WITHOUT returning the OTP in the API response
    return public_status(record)


@router.post("/send-otp")
def send_identity_otp(
    user: Annotated[User, Depends(require_persisted_donor)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    """
    Generates and dispatches a 6-digit TOTP code via send_sms stub.
    Does not return the OTP value in the API response.
    """
    require_demo_provider()
    record = session.get(DonorIdentityVerification, user.id)
    if record is None:
        record = DonorIdentityVerification(
            user_id=user.id,
            verification_status="pending",
            provider=DEMO_PROVIDER,
            provider_reference=token_urlsafe(32),
        )
        session.add(record)
    else:
        record.verification_status = "pending"
        record.verified_at = None

    session.commit()

    # Generate TOTP via pyotp and dispatch via send_sms stub
    totp_secret = get_totp_secret_for_user(user.id, record.provider_reference)
    totp_code, _ = generate_totp(totp_secret)
    target_phone = user.phone_number or "+919876543210"
    send_sms(target_phone, f"Your JEEVAN verification code is {totp_code}. Valid for 2 minutes.")

    # Return status without returning the OTP
    return public_status(record)


@router.post("/verify")
@router.post("/verify-otp")
def verify_identity_otp(
    body: Dict[str, Any],
    user: Annotated[User, Depends(require_persisted_donor)],
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    """
    Verifies submitted TOTP code using pyotp.
    """
    require_demo_provider()
    record = session.get(DonorIdentityVerification, user.id)
    if record is None or record.verification_status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending verification request found.")

    submitted_otp = str(body.get("otp") or body.get("code") or "").strip()
    if not submitted_otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP code is required.")

    totp_secret = get_totp_secret_for_user(user.id, record.provider_reference)
    if not verify_totp(totp_secret, submitted_otp):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code.")

    record.verification_status = "verified"
    record.verified_at = datetime.now(timezone.utc)
    session.commit()
    return public_status(record)


@router.post("/webhook")
async def identity_verification_webhook(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    x_identity_timestamp: Annotated[str | None, Header()] = None,
    x_identity_signature: Annotated[str | None, Header()] = None,
) -> dict[str, bool]:
    require_demo_provider()
    secret = os.getenv("IDENTITY_WEBHOOK_SECRET", "")
    if len(secret.encode("utf-8")) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Identity verification webhook is not configured.",
        )
    if (
        not x_identity_timestamp
        or len(x_identity_timestamp) > 12
        or not x_identity_timestamp.isascii()
        or not x_identity_timestamp.isdigit()
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")
    timestamp = int(x_identity_timestamp)
    if abs(time.time() - timestamp) > WEBHOOK_MAX_AGE_SECONDS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")
    if (
        not x_identity_signature
        or len(x_identity_signature) != 71
        or not x_identity_signature.startswith("sha256=")
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Webhook must be JSON.")
    if request.headers.get("content-length", "").isdigit() and int(request.headers["content-length"]) > WEBHOOK_MAX_BODY_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Webhook request is too large.")
    raw_body = await read_limited_body(request)

    signed_payload = x_identity_timestamp.encode("ascii") + b"." + raw_body
    expected_signature = "sha256=" + hmac.new(
        secret.encode("utf-8"), signed_payload, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(x_identity_signature, expected_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature.")

    try:
        event = json.loads(raw_body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook event.") from None
    if (
        not isinstance(event, dict)
        or set(event) != {"provider_reference", "status"}
        or not isinstance(event["provider_reference"], str)
        or not PROVIDER_REFERENCE_PATTERN.fullmatch(event["provider_reference"])
        or not isinstance(event["status"], str)
        or event["status"] not in {"verified", "failed"}
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook event.")

    record = session.scalar(
        select(DonorIdentityVerification)
        .where(DonorIdentityVerification.provider_reference == event["provider_reference"])
        .with_for_update()
    )
    if record is None or record.provider != DEMO_PROVIDER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verification request not found.")
    if record.verification_status != "pending":
        if record.verification_status == event["status"]:
            return {"accepted": True}
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Verification request is already complete.")

    record.verification_status = event["status"]
    record.verified_at = datetime.now(timezone.utc) if event["status"] == "verified" else None
    session.commit()
    return {"accepted": True}
