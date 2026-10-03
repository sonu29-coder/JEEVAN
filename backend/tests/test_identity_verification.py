import hashlib
import hmac
import json
import os
import time

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JEEVAN_API_KEY"] = "test-only-api-key"
os.environ["JWT_SECRET_KEY"] = "test-hemo-grid-secret"

import pytest
from fastapi.testclient import TestClient

from backend.auth import create_access_token
from backend.database import Base, SessionLocal, engine
from backend.main import app
from backend.models import DonorIdentityVerification, User

WEBHOOK_SECRET = "test-identity-webhook-secret-with-at-least-32-bytes"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("IDENTITY_PROVIDER_MODE", "demo")
    monkeypatch.setenv("IDENTITY_WEBHOOK_SECRET", WEBHOOK_SECRET)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        session.add(
            User(
                id="usr-identity-donor",
                email="identity-donor@example.org",
                hashed_password="not-used",
                name="Test Donor",
                role="REGISTERED_DONOR",
                is_active=True,
            )
        )
        session.add(
            User(
                id="usr-identity-hospital",
                email="identity-hospital@example.org",
                hashed_password="not-used",
                name="Test Hospital",
                role="ICU_HOSPITAL",
                is_active=True,
            )
        )
        session.commit()
    with TestClient(app) as test_client:
        yield test_client


def donor_headers() -> dict[str, str]:
    token = create_access_token("usr-identity-donor", "REGISTERED_DONOR")
    return {"Authorization": f"Bearer {token}"}


def signed_webhook_headers(body: bytes, *, timestamp: int | None = None) -> dict[str, str]:
    signed_at = str(timestamp if timestamp is not None else int(time.time()))
    signature = hmac.new(
        WEBHOOK_SECRET.encode(),
        signed_at.encode() + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    return {
        "X-Identity-Timestamp": signed_at,
        "X-Identity-Signature": f"sha256={signature}",
        "Content-Type": "application/json",
    }


def get_provider_reference(user_id: str = "usr-identity-donor") -> str:
    with SessionLocal() as session:
        record = session.get(DonorIdentityVerification, user_id)
        assert record is not None
        return record.provider_reference


def test_donor_can_start_and_read_a_single_demo_verification(client):
    headers = donor_headers()
    started = client.post("/api/donor/identity/start", headers=headers)
    assert started.status_code == 200
    assert started.json()["verification_status"] == "pending"
    assert started.json()["provider"] == "DEMO"
    assert started.json()["demo_mode"] is True
    assert "Aadhaar" in started.json()["notice"]
    assert "provider_reference" not in started.json()

    repeated_start = client.post("/api/donor/identity/start", headers=headers)
    assert repeated_start.status_code == 200
    assert repeated_start.json()["verification_status"] == "pending"
    assert client.get("/api/donor/identity/status", headers=headers).json() == started.json()

    with SessionLocal() as session:
        records = session.query(DonorIdentityVerification).all()
        assert len(records) == 1
        assert set(records[0].__table__.columns.keys()) == {
            "user_id",
            "verification_status",
            "provider",
            "provider_reference",
            "verified_at",
        }


def test_only_a_valid_signed_webhook_can_mark_identity_verified(client):
    headers = donor_headers()
    client.post("/api/donor/identity/start", headers=headers)
    reference = get_provider_reference()
    body = json.dumps(
        {"provider_reference": reference, "status": "verified"},
        separators=(",", ":"),
    ).encode()

    forged = client.post(
        "/api/donor/identity/webhook",
        content=body,
        headers={"X-Identity-Timestamp": str(int(time.time())), "X-Identity-Signature": "sha256=invalid"},
    )
    assert forged.status_code == 401
    assert client.get("/api/donor/identity/status", headers=headers).json()["verification_status"] == "pending"

    completed = client.post(
        "/api/donor/identity/webhook",
        content=body,
        headers=signed_webhook_headers(body),
    )
    assert completed.status_code == 200
    status_data = client.get("/api/donor/identity/status", headers=headers).json()
    assert status_data["verification_status"] == "verified"
    assert status_data["verified_at"] is not None
    assert status_data["demo_mode"] is True

    conflicting = json.dumps(
        {"provider_reference": reference, "status": "failed"},
        separators=(",", ":"),
    ).encode()
    conflict = client.post(
        "/api/donor/identity/webhook",
        content=conflicting,
        headers=signed_webhook_headers(conflicting),
    )
    assert conflict.status_code == 409


def test_identity_verification_requires_an_active_persisted_donor(client):
    hospital_token = create_access_token("usr-identity-hospital", "ICU_HOSPITAL")
    response = client.post(
        "/api/donor/identity/start",
        headers={"Authorization": f"Bearer {hospital_token}"},
    )
    assert response.status_code == 403

    demo_token = client.get(
        "/api/donor/identity/status",
        headers={"Authorization": "Bearer DONOR-1108"},
    )
    assert demo_token.status_code == 401

    missing = client.get("/api/donor/identity/status")
    assert missing.status_code == 401


def test_start_does_not_accept_identity_data_and_failed_attempt_can_retry(client):
    headers = donor_headers()
    rejected_body = client.post(
        "/api/donor/identity/start",
        headers=headers,
        json={"verification_status": "verified", "aadhaar_number": "must-not-be-accepted"},
    )
    assert rejected_body.status_code == 400

    client.post("/api/donor/identity/start", headers=headers)
    first_reference = get_provider_reference()
    failed_body = json.dumps(
        {"provider_reference": first_reference, "status": "failed"},
        separators=(",", ":"),
    ).encode()
    failed = client.post(
        "/api/donor/identity/webhook",
        content=failed_body,
        headers=signed_webhook_headers(failed_body),
    )
    assert failed.status_code == 200
    assert client.get("/api/donor/identity/status", headers=headers).json()["verification_status"] == "failed"

    retried = client.post("/api/donor/identity/start", headers=headers)
    assert retried.status_code == 200
    assert retried.json()["verification_status"] == "pending"
    assert get_provider_reference() != first_reference


def test_webhook_rejects_extra_fields_and_expired_signatures(client):
    client.post("/api/donor/identity/start", headers=donor_headers())
    reference = get_provider_reference()
    body = json.dumps(
        {"provider_reference": reference, "status": "verified", "document": "unexpected"},
        separators=(",", ":"),
    ).encode()
    extra_field = client.post(
        "/api/donor/identity/webhook",
        content=body,
        headers=signed_webhook_headers(body),
    )
    assert extra_field.status_code == 400

    valid_shape = json.dumps(
        {"provider_reference": reference, "status": "verified"},
        separators=(",", ":"),
    ).encode()
    expired = client.post(
        "/api/donor/identity/webhook",
        content=valid_shape,
        headers=signed_webhook_headers(valid_shape, timestamp=int(time.time()) - 301),
    )
    assert expired.status_code == 401
    assert client.get("/api/donor/identity/status", headers=donor_headers()).json()["verification_status"] == "pending"


def test_non_demo_provider_mode_cannot_start_identity_verification(client, monkeypatch):
    monkeypatch.setenv("IDENTITY_PROVIDER_MODE", "real")
    response = client.post("/api/donor/identity/start", headers=donor_headers())
    assert response.status_code == 503
    assert "No real identity verification provider integration" in response.json()["detail"]
