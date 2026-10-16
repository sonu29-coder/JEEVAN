"""
RBAC & Security Test Suite for JEEVAN
Covers:
- Demo credentials authentication
- Server-side role assignment & rejection of privilege escalation
- Cross-role authorization barriers (Hospital, Donor, Courier, Admin)
- Expired token handling
- Session revocation on logout
"""

import os
from datetime import datetime, timedelta, timezone
import jwt
import pytest
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JEEVAN_API_KEY"] = "test-only-api-key"
os.environ["JWT_SECRET_KEY"] = "test-hemo-grid-secret"

from backend.database import Base
from backend.main import app, engine, SessionLocal
from backend.models import User
from backend.auth import hash_password, create_access_token, JWT_SECRET_KEY, JWT_ALGORITHM


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    # Seed demo users
    db = SessionLocal()
    try:
        users = [
            User(
                id="usr-hosp-01",
                email="dr.rajesh@jubileemission.org",
                hashed_password=hash_password("HospitalPassword2026!"),
                role="hospital",
                name="Dr. Rajesh Nair",
                is_active=True,
            ),
            User(
                id="usr-donor-01",
                email="sneha.donor@gmail.com",
                hashed_password=hash_password("DonorPassword2026!"),
                role="donor",
                name="Sneha Menon",
                is_active=True,
            ),
            User(
                id="usr-courier-01",
                email="driver.arun@gmail.com",
                hashed_password=hash_password("DriverPassword2026!"),
                role="courier",
                name="Arun Kumar",
                is_active=True,
            ),
            User(
                id="usr-admin-01",
                email="admin@jeevan.org",
                hashed_password=hash_password("AdminPassword2026!"),
                role="admin",
                name="System Administrator",
                is_active=True,
            ),
            User(
                id="usr-inactive-01",
                email="inactive.user@jeevan.org",
                hashed_password=hash_password("SomePassword123!"),
                role="hospital",
                name="Suspended Doctor",
                is_active=False,
            ),
        ]
        db.add_all(users)
        db.commit()
    finally:
        db.close()

    with TestClient(app) as test_client:
        yield test_client


def test_01_valid_hospital_credentials_authenticates_as_hospital(client):
    res = client.post("/api/auth/login", json={
        "email": "dr.rajesh@jubileemission.org",
        "password": "HospitalPassword2026!",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "ICU_HOSPITAL"
    assert "access_token" in data

    # Verify /api/auth/me returns the verified role
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "ICU_HOSPITAL"


def test_02_valid_donor_credentials_authenticates_as_donor(client):
    res = client.post("/api/auth/login", json={
        "email": "sneha.donor@gmail.com",
        "password": "DonorPassword2026!",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "REGISTERED_DONOR"
    assert "access_token" in data

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "REGISTERED_DONOR"


def test_03_valid_courier_credentials_authenticates_as_courier(client):
    res = client.post("/api/auth/login", json={
        "email": "driver.arun@gmail.com",
        "password": "DriverPassword2026!",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "DELIVERY_PARTNER"
    assert "access_token" in data

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "DELIVERY_PARTNER"


def test_04_invalid_credentials_fail_authentication(client):
    # Wrong password
    res1 = client.post("/api/auth/login", json={
        "email": "dr.rajesh@jubileemission.org",
        "password": "WrongPassword2026!",
    })
    assert res1.status_code == 401

    # Non-existent email
    res2 = client.post("/api/auth/login", json={
        "email": "nonexistent@jeevan.org",
        "password": "HospitalPassword2026!",
    })
    assert res2.status_code == 401

    # Suspended / Inactive account returns 403 Forbidden
    res3 = client.post("/api/auth/login", json={
        "email": "inactive.user@jeevan.org",
        "password": "SomePassword123!",
    })
    assert res3.status_code == 403


def test_05_privilege_escalation_is_prevented(client):
    # An ordinary hospital user trying to submit role="ADMIN" in login body
    res = client.post("/api/auth/login", json={
        "email": "dr.rajesh@jubileemission.org",
        "password": "HospitalPassword2026!",
        "role": "ADMIN",
    })
    assert res.status_code == 200
    data = res.json()
    # The server must NOT give ADMIN role, it must remain ICU_HOSPITAL from DB
    assert data["role"] == "ICU_HOSPITAL"

    # Attempting to access admin endpoint with hospital token must be denied
    admin_res = client.get(
        "/api/admin/system-stats",
        headers={"Authorization": f"Bearer {data['access_token']}"},
    )
    assert admin_res.status_code == 403


def test_06_donor_denied_access_to_hospital_endpoints(client):
    # Authenticate as donor
    res = client.post("/api/auth/login", json={
        "email": "sneha.donor@gmail.com",
        "password": "DonorPassword2026!",
    })
    token = res.json()["access_token"]

    # Try accessing hospital-only endpoints
    headers = {"Authorization": f"Bearer {token}"}
    req_res = client.post("/api/request-blood", json={
        "blood_group": "O+",
        "units": 2,
        "urgency": "CRITICAL",
        "hospital_id": "hosp-1",
    }, headers=headers)
    assert req_res.status_code == 403

    icu_view = client.get("/api/requests/icu-view", headers=headers)
    assert icu_view.status_code == 403


def test_07_hospital_denied_access_to_courier_endpoints(client):
    # Authenticate as hospital
    res = client.post("/api/auth/login", json={
        "email": "dr.rajesh@jubileemission.org",
        "password": "HospitalPassword2026!",
    })
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Try accessing courier-only endpoints
    dispatches = client.get("/api/dispatches", headers=headers)
    assert dispatches.status_code == 403

    fast_create = client.post("/api/dispatches/fast-create", json={
        "request_id": "req-1",
        "pickup_bank_id": "bank-1",
        "delivery_hospital_id": "hosp-1",
        "blood_group": "O+",
        "units": 2,
    }, headers=headers)
    assert fast_create.status_code == 403


def test_08_courier_denied_access_to_donor_endpoints(client):
    # Authenticate as courier
    res = client.post("/api/auth/login", json={
        "email": "driver.arun@gmail.com",
        "password": "DriverPassword2026!",
    })
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Try accessing donor management endpoint
    mgmt = client.get("/api/donors/management", headers=headers)
    assert mgmt.status_code == 403

    alerts = client.get("/api/donors/1/alerts", headers=headers)
    assert alerts.status_code == 403


def test_09_expired_token_denied_access(client):
    # Forge expired token
    now = datetime.now(timezone.utc)
    expired_payload = {
        "sub": "sneha.donor@gmail.com",
        "user_id": "usr-donor-01",
        "role": "REGISTERED_DONOR",
        "exp": int((now - timedelta(hours=2)).timestamp()),
        "iat": int((now - timedelta(hours=3)).timestamp()),
    }
    expired_token = jwt.encode(expired_payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401


def test_10_logout_revokes_token(client):
    # Authenticate
    res = client.post("/api/auth/login", json={
        "email": "dr.rajesh@jubileemission.org",
        "password": "HospitalPassword2026!",
    })
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Validate token works
    valid_res = client.get("/api/auth/me", headers=headers)
    assert valid_res.status_code == 200

    # Logout
    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Token must now be rejected with 401
    after_res = client.get("/api/auth/me", headers=headers)
    assert after_res.status_code == 401
    assert "revoked" in after_res.json()["detail"].lower()


def test_11_admin_can_access_all_workspaces(client):
    # Authenticate as admin
    res = client.post("/api/auth/login", json={
        "email": "admin@jeevan.org",
        "password": "AdminPassword2026!",
    })
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Admin accesses hospital
    hosp_res = client.get("/api/requests/icu-view", headers=headers)
    assert hosp_res.status_code == 200

    # Admin accesses courier
    courier_res = client.get("/api/dispatches", headers=headers)
    assert courier_res.status_code == 200

    # Admin accesses donor management
    donor_res = client.get("/api/donors/management", headers=headers)
    assert donor_res.status_code == 200

    # Admin accesses system stats
    stats_res = client.get("/api/admin/system-stats", headers=headers)
    assert stats_res.status_code == 200
