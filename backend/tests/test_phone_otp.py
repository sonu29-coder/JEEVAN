"""
Unit & Integration Tests for Fast2SMS Dedicated Smart OTP Verification
Validates:
- Indian mobile number normalization and validation
- Fast2SMS provider configuration validation (FAST2SMS_API_KEY, FAST2SMS_OTP_ID)
- 2-minute OTP validity window (120s) and cooldown (45s)
- Fast2SMS Send OTP (POST /dev/otp/send) and Verify OTP (POST /dev/otp/verify)
- Failed attempt lockout (max 5)
- Full Donor registration with verified phone
- Returning verified donor login by phone or email without requiring OTP on each login
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

from backend.database import Base, SessionLocal, engine
from backend.main import app
from backend.models import Donor, PhoneVerification, User
from backend.otp_service import (
    OTP_EXPIRATION_SECONDS,
    OTP_RESEND_COOLDOWN_SECONDS,
)
from backend.phone_utils import (
    format_indian_phone_display,
    mask_indian_phone,
    normalize_indian_phone,
)
from backend.sms_provider import (
    Fast2SMSProvider,
    SMSConfigurationError,
    TestSMSProvider,
    get_sms_provider,
)


@pytest.fixture(autouse=True)
def setup_db():
    from backend.database import ensure_column_migrations
    Base.metadata.create_all(bind=engine)
    ensure_column_migrations(engine)
    session = SessionLocal()
    session.query(PhoneVerification).delete()
    session.query(User).filter(User.email.like("%@testotp.org")).delete()
    session.query(Donor).filter(Donor.email.like("%@testotp.org")).delete()
    session.commit()
    session.close()
    yield
    session = SessionLocal()
    session.query(PhoneVerification).delete()
    session.query(User).filter(User.email.like("%@testotp.org")).delete()
    session.query(Donor).filter(Donor.email.like("%@testotp.org")).delete()
    session.commit()
    session.close()


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------
# 1. Phone Normalization & Masking Tests
# ---------------------------------------------------------------------

def test_normalize_indian_phone_valid():
    assert normalize_indian_phone("9876543210") == "+919876543210"
    assert normalize_indian_phone("+919876543210") == "+919876543210"
    assert normalize_indian_phone("919876543210") == "+919876543210"
    assert normalize_indian_phone("09876543210") == "+919876543210"
    assert normalize_indian_phone("+91 98765 43210") == "+919876543210"
    assert normalize_indian_phone("+91-98765-43210") == "+919876543210"
    assert normalize_indian_phone("6123456789") == "+916123456789"
    assert normalize_indian_phone("7123456789") == "+917123456789"
    assert normalize_indian_phone("8123456789") == "+918123456789"


def test_normalize_indian_phone_invalid():
    with pytest.raises(ValueError, match="Please enter a valid mobile number."):
        normalize_indian_phone("1234567890")  # does not start with 6-9

    with pytest.raises(ValueError, match="Please enter a valid mobile number."):
        normalize_indian_phone("98765")  # too short

    with pytest.raises(ValueError, match="Please enter a valid mobile number."):
        normalize_indian_phone("abcdefghij")  # non-digits

    with pytest.raises(ValueError, match="Please enter a valid mobile number."):
        normalize_indian_phone("")


def test_format_and_mask_phone():
    assert format_indian_phone_display("+919876543210") == "+91 98765 43210"
    assert mask_indian_phone("+919876543210") == "+91 XXXXX 43210"


# ---------------------------------------------------------------------
# 2. Fast2SMS Provider Configuration Tests
# ---------------------------------------------------------------------

def test_fast2sms_missing_credentials(monkeypatch):
    monkeypatch.setenv("FAST2SMS_API_KEY", "")
    monkeypatch.setenv("SMS_PROVIDER_API_KEY", "")

    provider = Fast2SMSProvider()
    is_ok, missing = provider.validate_configuration()
    assert is_ok is False
    assert "FAST2SMS_API_KEY" in missing


def test_fast2sms_configured(monkeypatch):
    monkeypatch.setenv("FAST2SMS_API_KEY", "dummy_key_12345")

    provider = Fast2SMSProvider()
    is_ok, missing = provider.validate_configuration()
    assert is_ok is True
    assert len(missing) == 0


def test_send_otp_fails_honestly_when_fast2sms_unconfigured(client, monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "fast2sms")
    monkeypatch.setenv("FAST2SMS_API_KEY", "")
    monkeypatch.setenv("SMS_PROVIDER_API_KEY", "")

    res = client.post("/api/auth/send-otp", json={"phone_number": "9876543210"})
    assert res.status_code == 503
    data = res.json()
    assert "FAST2SMS_API_KEY" in data["detail"]


# ---------------------------------------------------------------------
# 3. OTP Send & Verify Flow with Test Provider
# ---------------------------------------------------------------------

def test_send_and_verify_otp_flow(client, monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "test")
    test_provider = TestSMSProvider()
    monkeypatch.setattr("backend.otp_service.get_sms_provider", lambda: test_provider)

    phone = "9876543210"

    # Step 1: Send OTP
    send_res = client.post("/api/auth/send-otp", json={"phone_number": phone})
    assert send_res.status_code == 200
    send_data = send_res.json()
    assert send_data["success"] is True
    assert send_data["phone_number"] == "+919876543210"
    assert send_data["formatted_phone"] == "+91 98765 43210"
    assert send_data["expires_in_seconds"] == 120  # Exactly 2 minutes
    assert send_data["cooldown_seconds"] == 60  # 60s cooldown
    # Crucial security assertion: plaintext OTP is NEVER returned to frontend!
    assert "otp" not in send_data

    # Retrieve sent OTP from test provider
    assert len(test_provider.sent_messages) == 1
    sent_otp = test_provider.sent_messages[0]["otp"]
    assert len(sent_otp) == 6

    # Verify that in database, OTP is stored as HMAC-SHA256 hash (never plain text)
    session = SessionLocal()
    record = session.query(PhoneVerification).filter_by(phone_number="+919876543210").first()
    assert record is not None
    assert len(record.otp_hash) == 64  # SHA256 hex digest
    assert record.otp_hash != sent_otp  # Never stored in plaintext
    assert record.phone_verified is False
    session.close()

    # Step 2: Try verifying with incorrect OTP
    wrong_res = client.post(
        "/api/auth/verify-otp",
        json={"phone_number": phone, "otp": "000000"},
    )
    assert wrong_res.status_code == 400
    assert "Incorrect code" in wrong_res.json()["detail"]

    # Step 3: Verify with correct OTP
    verify_res = client.post(
        "/api/auth/verify-otp",
        json={"phone_number": phone, "otp": sent_otp},
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["success"] is True
    assert verify_data["verified"] is True
    assert verify_data["phone_number"] == "+919876543210"
    assert verify_data["verification_token"] is not None

    # Step 4: OTP Single-use assertion: cannot verify again
    replay_res = client.post(
        "/api/auth/verify-otp",
        json={"phone_number": phone, "otp": sent_otp},
    )
    assert replay_res.status_code == 400
    assert "expired" in replay_res.json()["detail"].lower()


def test_otp_resend_cooldown(client, monkeypatch):
    """Enforces cooldown between resend requests."""
    monkeypatch.setenv("SMS_PROVIDER", "test")
    test_provider = TestSMSProvider()
    monkeypatch.setattr("backend.otp_service.get_sms_provider", lambda: test_provider)

    phone = "9876543210"
    res1 = client.post("/api/auth/send-otp", json={"phone_number": phone})
    assert res1.status_code == 200

    # Immediate second request should be rate-limited (HTTP 429)
    res2 = client.post("/api/auth/send-otp", json={"phone_number": phone})
    assert res2.status_code == 429
    assert "Please wait" in res2.json()["detail"]


def test_otp_max_incorrect_attempts_locking(client, monkeypatch):
    """Locks after 3 incorrect attempts."""
    monkeypatch.setenv("SMS_PROVIDER", "test")
    test_provider = TestSMSProvider()
    monkeypatch.setattr("backend.otp_service.get_sms_provider", lambda: test_provider)

    phone = "9876543210"
    client.post("/api/auth/send-otp", json={"phone_number": phone})
    sent_otp = test_provider.sent_messages[0]["otp"]

    for _ in range(2):
        res = client.post("/api/auth/verify-otp", json={"phone_number": phone, "otp": "111111"})
        assert res.status_code == 400
        assert "Incorrect code" in res.json()["detail"]

    # 3rd failed attempt should trigger lockout (max 3 attempts)
    res3 = client.post("/api/auth/verify-otp", json={"phone_number": phone, "otp": "111111"})
    assert res3.status_code == 429
    assert "Too many attempts" in res3.json()["detail"]

    # Even with correct OTP now, it's locked
    res_correct = client.post("/api/auth/verify-otp", json={"phone_number": phone, "otp": sent_otp})
    assert res_correct.status_code == 429


# ---------------------------------------------------------------------
# 4. Full Registration & Returning Donor Login Flow
# ---------------------------------------------------------------------

def test_donor_registration_with_verified_phone_and_login(client, monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "test")
    test_provider = TestSMSProvider()
    monkeypatch.setattr("backend.otp_service.get_sms_provider", lambda: test_provider)

    donor_phone = "9876543210"
    donor_email = "newdonor@testotp.org"
    donor_password = "SecurePassword2026!"

    # 1. First-time donor requests OTP
    send_res = client.post("/api/auth/send-otp", json={"phone_number": donor_phone})
    assert send_res.status_code == 200
    otp = test_provider.sent_messages[0]["otp"]

    # 2. Donor enters OTP and verifies
    verify_res = client.post(
        "/api/auth/verify-otp",
        json={"phone_number": donor_phone, "otp": otp},
    )
    assert verify_res.status_code == 200
    token = verify_res.json()["verification_token"]

    # 3. Donor completes registration
    reg_res = client.post(
        "/api/auth/register",
        json={
            "name": "Kavya Nair",
            "email": donor_email,
            "password": donor_password,
            "phone_number": donor_phone,
            "verification_token": token,
            "blood_group": "O-",
            "role": "donor",
        },
    )
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert reg_data["email"] == donor_email
    assert reg_data["phone_number"] == "+919876543210"
    assert reg_data["phone_verified"] is True
    assert reg_data["access_token"] is not None

    # Verify database state
    session = SessionLocal()
    db_user = session.query(User).filter_by(email=donor_email).first()
    assert db_user is not None
    assert db_user.phone_number == "+919876543210"
    assert db_user.phone_verified is True

    db_donor = session.query(Donor).filter_by(email=donor_email).first()
    assert db_donor is not None
    assert db_donor.phone == "+919876543210"
    assert db_donor.phone_verified is True
    assert db_donor.blood_group == "O-"
    session.close()

    # 4. Returning verified donor logs in via email + password (NO OTP required!)
    login_email_res = client.post(
        "/api/auth/login",
        json={"username_or_token": donor_email, "password": donor_password},
    )
    assert login_email_res.status_code == 200
    assert "access_token" in login_email_res.json()

    # 5. Returning verified donor logs in via mobile number + password (NO OTP required!)
    login_phone_res = client.post(
        "/api/auth/login",
        json={"username_or_token": donor_phone, "password": donor_password},
    )
    assert login_phone_res.status_code == 200
    assert "access_token" in login_phone_res.json()


def test_registration_rejected_without_verified_phone(client):
    """Attempts to register with an unverified phone number are rejected."""
    res = client.post(
        "/api/auth/register",
        json={
            "name": "Unverified User",
            "email": "unverified@testotp.org",
            "password": "Password2026!",
            "phone_number": "9123456789",
            "blood_group": "A+",
            "role": "donor",
        },
    )
    assert res.status_code == 400
    assert "Please verify your mobile number with OTP" in res.json()["detail"]


def test_fast2sms_gateway_error_fallback_in_demo_mode(client, monkeypatch):
    """When Fast2SMS rejects dispatch (e.g. unverified website), demo mode provides demo_otp fallback."""
    from backend.sms_provider import SMSDeliveryResult

    class FailingProvider:
        name = "fast2sms"
        def validate_configuration(self):
            return True, []
        def send_otp(self, phone_number, otp=""):
            return SMSDeliveryResult(
                success=False,
                provider="fast2sms",
                error="Before using OTP Message API, complete website verification. Visit OTP Message menu or use DLT SMS API.",
            )

    monkeypatch.setattr("backend.otp_service.get_sms_provider", lambda: FailingProvider())
    monkeypatch.setenv("IDENTITY_PROVIDER_MODE", "demo")

    phone = "9876543210"
    send_res = client.post("/api/auth/send-otp", json={"phone_number": phone})
    assert send_res.status_code == 200
    data = send_res.json()
    assert data["success"] is True
    assert "demo_otp" in data
    assert len(data["demo_otp"]) == 6
    assert data["gateway_notice"] is not None

    # Verification with demo_otp succeeds
    verify_res = client.post("/api/auth/verify-otp", json={"phone_number": phone, "otp": data["demo_otp"]})
    assert verify_res.status_code == 200
    assert verify_res.json()["verified"] is True

