"""
Comprehensive Test Suite for JEEVAN End-to-End Workflow:
- Phase 3: Authentication, Bcrypt Password Hashing, RBAC, User Registration & Admin
- Phase 5: Donor Profile Management, Privacy Protection, History
- Phase 6: Blood Bank Inventory CRUD, Row-Level Concurrency, Low-Stock Warnings
- Phase 7, 8, 9, 10, 11: End-to-End Hospital Request -> Geo Matching -> Reservation -> Alerts -> Fulfillment
"""

import os
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JEEVAN_API_KEY"] = "test-only-api-key"
os.environ["JWT_SECRET_KEY"] = "test-hemo-grid-secret"

import pytest
from fastapi.testclient import TestClient

from backend.database import Base, SessionLocal, engine
from backend.main import app
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
    User,
)
from backend.auth import hash_password, create_access_token


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.events = []

    def get(self, key):
        return self.values.get(key)

    def setex(self, key, _ttl, value):
        self.values[key] = value

    def scan_iter(self, match):
        prefix = match.removesuffix("*")
        return iter(key for key in self.values if key.startswith(prefix))

    def delete(self, *keys):
        for key in keys:
            self.values.pop(key, None)

    def xadd(self, stream, fields, **_kwargs):
        self.events.append((stream, fields))
        return str(len(self.events))

    def ping(self):
        return True

    def close(self):
        return None


@pytest.fixture()
def client(monkeypatch):
    import backend.main as main
    fake_redis = FakeRedis()
    monkeypatch.setattr(main, "redis_client", fake_redis)
    Base.metadata.drop_all(bind=main.engine)
    Base.metadata.create_all(bind=main.engine)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def seeded_db(client):
    today = date.today()
    with SessionLocal() as session:
        # 1. Admin & Demo Users
        admin_user = User(
            id="usr-admin-01",
            email="admin@jeevan.org",
            hashed_password=hash_password("AdminSecure2026!"),
            name="System Admin",
            role="ADMIN",
            is_active=True,
            synthetic=True,
        )
        hosp_user = User(
            id="usr-hosp-01",
            email="dr.rajesh@jubileemission.org",
            hashed_password=hash_password("HospSecure2026!"),
            name="Dr. Rajesh Nair",
            role="ICU_HOSPITAL",
            entity_id="H1",
            is_active=True,
            synthetic=True,
        )
        session.add_all([admin_user, hosp_user])

        # 2. Hospital
        hospital = Hospital(
            id="H1",
            name="Jubilee Mission Hospital",
            city="Thrissur",
            state="Kerala",
            latitude=10.5186,
            longitude=76.2223,
            phone="+91-487-2432200",
            email="icu@jubileemission.org",
            synthetic=True,
        )
        session.add(hospital)

        # 3. Blood Bank
        bank = BloodBank(
            id="BB1",
            name="IMA Blood Bank Thrissur",
            address="Medical College Road",
            city="Thrissur",
            state="Kerala",
            latitude=10.5262,
            longitude=76.2138,
            phone="+91-487-2335525",
            email="info@imathrissur.org",
            synthetic=True,
        )
        session.add(bank)

        # 4. Donor
        donor = Donor(
            id="D1",
            donor_code="DONOR-1108",
            name="Aarav Sharma",
            blood_group="O-",
            phone="+91-9847012345",
            email="donor.aarav@gmail.com",
            latitude=10.5240,
            longitude=76.2150,
            last_donation_date=today - timedelta(days=105),
            donation_count=5,
            response_rate=92.0,
            eligible=True,
            synthetic=True,
        )
        session.add(donor)

        # 5. Inventory
        inv_o_neg = Inventory(
            id="INV-ONEG-01",
            blood_bank_id="BB1",
            blood_group="O-",
            component="PRBC",
            units=10,
            expiry_date=today + timedelta(days=25),
            status="available",
            synthetic=True,
        )
        inv_expired = Inventory(
            id="INV-EXP-01",
            blood_bank_id="BB1",
            blood_group="O-",
            component="PRBC",
            units=5,
            expiry_date=today - timedelta(days=2),
            status="available",
            synthetic=True,
        )
        session.add_all([inv_o_neg, inv_expired])
        session.commit()

    return client


# =====================================================================
# Phase 3: Authentication, Bcrypt Hashing, RBAC & User Management Tests
# =====================================================================

def test_user_registration_flow(seeded_db):
    client = seeded_db
    reg_payload = {
        "email": "new.doctor@amala.org",
        "password": "StrongPassword2026!",
        "name": "Dr. Lakshmi Varma",
        "role": "hospital",
        "entity_id": "H2",
    }
    response = client.post("/api/auth/register", json=reg_payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "new.doctor@amala.org"
    assert data["role"] == "ICU_HOSPITAL"
    assert "access_token" in data

    # Test login with the newly registered user
    login_res = client.post(
        "/api/auth/login",
        json={"username_or_token": "new.doctor@amala.org", "password": "StrongPassword2026!"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["role"] == "ICU_HOSPITAL"


def test_user_registration_duplicate_email(seeded_db):
    client = seeded_db
    payload = {
        "email": "dr.rajesh@jubileemission.org",
        "password": "SomePassword123!",
        "name": "Duplicate User",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


def test_user_login_invalid_password(seeded_db):
    client = seeded_db
    response = client.post(
        "/api/auth/login",
        json={"username_or_token": "dr.rajesh@jubileemission.org", "password": "WrongPassword!"},
    )
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


def test_admin_endpoints_access_control(seeded_db):
    client = seeded_db
    # Generate admin token
    admin_token = create_access_token(user_id="usr-admin-01", role="ADMIN", label="System Admin")
    # Generate non-admin token
    donor_token = create_access_token(user_id="usr-donor-01", role="REGISTERED_DONOR", label="Aarav")

    # Non-admin attempting to list users -> 403 Forbidden
    res_forbidden = client.get("/api/admin/users", headers={"Authorization": f"Bearer {donor_token}"})
    assert res_forbidden.status_code == 403

    # Admin listing users -> 200 OK
    res_admin = client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    users = res_admin.json()
    assert len(users) >= 2

    # Admin system stats endpoint
    stats_res = client.get("/api/admin/system-stats", headers={"Authorization": f"Bearer {admin_token}"})
    assert stats_res.status_code == 200
    counts = stats_res.json()["counts"]
    assert counts["users"] >= 2
    assert counts["hospitals"] >= 1
    assert counts["blood_banks"] >= 1
    assert counts["donors"] >= 1
    assert counts["inventory"] >= 2


# =====================================================================
# Phase 5: Donor Profile Management & Privacy Tests
# =====================================================================

def test_donor_profile_retrieval_and_privacy(seeded_db):
    client = seeded_db
    res = client.get("/api/donors/D1", headers={"Authorization": "Bearer HOSP-9042"})
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Aarav Sharma"
    assert data["blood_group"] == "O-"
    # Privacy: Phone and email should be partially obfuscated
    assert "XXXX" in data["phone"]
    assert "***@" in data["email"]
    assert "medical_eligibility_note" in data


def test_donor_profile_update(seeded_db):
    client = seeded_db
    update_payload = {
        "blood_group": "O-",
        "phone": "+91-9988776655",
        "eligible": False,
    }
    patch_res = client.patch(
        "/api/donors/D1",
        json=update_payload,
        headers={"Authorization": "Bearer DONOR-1108"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["eligible"] is False

    # Check persistence
    get_res = client.get("/api/donors/D1", headers={"Authorization": "Bearer DONOR-1108"})
    assert get_res.json()["eligible"] is False


def test_donor_history(seeded_db):
    client = seeded_db
    res = client.get("/api/donors/D1/history", headers={"Authorization": "Bearer DONOR-1108"})
    assert res.status_code == 200
    data = res.json()
    assert data["donation_count"] == 5
    assert data["response_rate"] == 92.0
    assert isinstance(data["recent_alerts"], list)


# =====================================================================
# Phase 6: Blood Bank Inventory Management Tests
# =====================================================================

def test_create_and_list_inventory(seeded_db):
    client = seeded_db
    new_stock = {
        "blood_bank_id": "BB1",
        "blood_group": "A+",
        "component": "Whole Blood",
        "units": 8,
        "expiry_date": (date.today() + timedelta(days=20)).isoformat(),
        "status": "available",
    }
    create_res = client.post(
        "/api/inventory",
        json=new_stock,
        headers={"Authorization": "Bearer BANK-5501"},
    )
    assert create_res.status_code == 201
    item = create_res.json()
    assert item["blood_group"] == "A+"
    assert item["units"] == 8
    assert item["available_units"] == 8
    assert item["is_low_stock"] is False

    # List inventory
    list_res = client.get(
        "/api/inventory?blood_group=A+",
        headers={"Authorization": "Bearer BANK-5501"},
    )
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1


def test_update_inventory_stock(seeded_db):
    client = seeded_db
    patch_res = client.patch(
        "/api/inventory/INV-ONEG-01",
        json={"units": 2},
        headers={"Authorization": "Bearer BANK-5501"},
    )
    assert patch_res.status_code == 200
    item = patch_res.json()
    assert item["units"] == 2
    assert item["is_low_stock"] is True  # units <= 2 triggers low stock flag


# =====================================================================
# Phases 7, 8, 9, 10, 11: End-to-End Hospital Request to Fulfillment
# =====================================================================

def test_end_to_end_hospital_request_lifecycle(seeded_db):
    client = seeded_db
    auth_header = {"Authorization": "Bearer HOSP-9042"}

    # 1. Hospital submits urgent blood request for O- PRBC
    req_payload = {
        "hospital_name": "Jubilee Mission Hospital",
        "patient_blood_group": "O-",
        "component": "PRBC",
        "units_required": 2,
        "urgency": "critical",
        "hospital_latitude": 10.5186,
        "hospital_longitude": 76.2223,
    }
    create_res = client.post("/api/requests", json=req_payload, headers=auth_header)
    assert create_res.status_code == 201
    req_data = create_res.json()
    req_id = req_data["request_id"]
    assert req_data["status"] == "pending"

    # 2. Geographic Matching with PostGIS / Haversine
    match_res = client.post(f"/api/requests/{req_id}/matches?radius_km=30", headers=auth_header)
    assert match_res.status_code == 200
    matches = match_res.json()["matches"]
    assert len(matches) >= 1
    # First match should be the nearby blood bank with available O- PRBC
    bb_match = next((m for m in matches if m["type"] == "blood_bank"), None)
    assert bb_match is not None
    assert bb_match["blood_group"] == "O-"
    assert bb_match["distance_km"] < 5.0
    inv_id = bb_match["inventory_id"]

    # 3. Create Concurrency-Safe Reservation
    reserve_payload = {
        "inventory_id": inv_id,
        "units": 2,
        "ttl_minutes": 15,
    }
    reserve_res = client.post(
        f"/api/requests/{req_id}/reservations",
        json=reserve_payload,
        headers=auth_header,
    )
    assert reserve_res.status_code == 201
    res_data = reserve_res.json()
    assert res_data["units_reserved"] == 2
    assert res_data["status"] == "active"

    # 4. Trigger Donor Alert
    alert_payload = {"donor_ids": ["D1"]}
    alert_res = client.post(
        f"/api/requests/{req_id}/alerts",
        json=alert_payload,
        headers=auth_header,
    )
    assert alert_res.status_code == 201
    alert_id = alert_res.json()["alerts"][0]["alert_id"]

    # 5. Donor acknowledges the alert
    ack_res = client.post(f"/api/alerts/{alert_id}/acknowledge", headers={"Authorization": "Bearer DONOR-1108"})
    assert ack_res.status_code == 200
    assert ack_res.json()["status"] == "acknowledged"

    # 6. Fulfill Request (Decrements inventory from 10 -> 8 and confirms reservation)
    fulfill_res = client.patch(
        f"/api/requests/{req_id}/status",
        json={"status": "fulfilled"},
        headers=auth_header,
    )
    assert fulfill_res.status_code == 200
    assert fulfill_res.json()["status"] == "fulfilled"

    # 7. Verify inventory decreased by 2 units in DB
    inv_check = client.get("/api/inventory?blood_group=O-", headers=auth_header)
    assert inv_check.status_code == 200
    active_inv = next(i for i in inv_check.json() if i["id"] == "INV-ONEG-01")
    # Initial units was 2 after test_update_inventory_stock or 10 - 2 = 8
    assert active_inv["units"] == 8

    # 8. Verify audit logs recorded actions
    audit_res = client.get(f"/api/audit?entity_type=request&entity_id={req_id}", headers=auth_header)
    assert audit_res.status_code == 200
    assert len(audit_res.json()) >= 1


def test_expiry_radar_clinical_rules_and_prioritization(seeded_db):
    client = seeded_db
    auth_header = {"Authorization": "Bearer HOSP-9042"}

    # 1. Fetch Blood Expiry Radar
    res = client.get("/api/inventory/expiry-radar", headers=auth_header)
    assert res.status_code == 200
    data = res.json()

    assert "summary" in data
    assert "items" in data
    assert "clinical_protocols" in data
    assert len(data["clinical_protocols"]) >= 4

    summary = data["summary"]
    assert summary["total_units"] >= 1
    assert summary["adherence_rate_pct"] >= 0.0

    items = data["items"]
    assert len(items) >= 1
    # Check first item has FEFO priority rank 1
    assert items[0]["fefo_priority_rank"] == 1
    assert "urgency_tier" in items[0]
    assert "clinical_rules" in items[0]

    # Verify clinical rules logic (FEFO / Pediatric restriction / Trauma match)
    for it in items:
        rule_ids = [r["rule_id"] for r in it["clinical_rules"]]
        if it["days_remaining"] <= 5 and it["available_units"] > 0:
            assert "FEFO_PRIORITY" in rule_ids
        if it["component"] in ("PRBC", "Whole Blood") and it["days_remaining"] <= 28:
            assert it["pediatric_safe"] is False
            assert "PEDIATRIC_RESTRICTION" in rule_ids

    # 2. Prioritize an inventory item under clinical FEFO
    target_item = items[0]
    prioritize_res = client.post(
        f"/api/inventory/{target_item['id']}/prioritize",
        json={"reason": "Cardiac Emergency Crossmatch", "clinical_case": "Acute Trauma"},
        headers=auth_header,
    )
    assert prioritize_res.status_code == 200
    assert prioritize_res.json()["success"] is True

    # 3. Redistribute an inventory item to another medical center
    redistribute_res = client.post(
        f"/api/inventory/{target_item['id']}/redistribute",
        json={"target_bank_id": "BB-GMC-01", "courier_notes": "Urgent cold chain transfer"},
        headers=auth_header,
    )
    assert redistribute_res.status_code == 200
    assert redistribute_res.json()["success"] is True
    assert "dispatch_code" in redistribute_res.json()

    # 4. Verify item now marked prioritized in radar
    radar_updated = client.get("/api/inventory/expiry-radar", headers=auth_header).json()
    updated_item = next(i for i in radar_updated["items"] if i["id"] == target_item["id"])
    assert updated_item["prioritized"] is True
    assert updated_item["priority_reason"] == "Cardiac Emergency Crossmatch"

