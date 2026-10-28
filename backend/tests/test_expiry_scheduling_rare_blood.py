"""
Unit tests for JEEVAN:
1. Rare Blood Compatibility & Prioritization (Standard ABO/Rh rules, Decision Support label)
2. Blood Expiry & Scheduling Algorithm (FEFO rank, Storage duration in months, Storage limits enforcement)
3. Google OAuth genuine token security enforcement
"""

import os
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.database import Base, SessionLocal, engine
from backend.main import app
from backend.models import BloodBank, Inventory, Donor


@pytest.fixture
def test_setup():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        # Create bank
        bank = session.get(BloodBank, "BB_TEST")
        if not bank:
            bank = BloodBank(
                id="BB_TEST",
                name="Chennai Regional Blood Bank",
                address="123 Anna Salai",
                state="Tamil Nadu",
                phone="+91-44-12345678",
                latitude=13.0418,
                longitude=80.2341,
                area="T. Nagar",
                city="Chennai",
                synthetic=True,
            )
            session.add(bank)

        # Seed test inventory
        today = date.today()
        # PRBC expiring in 10 days
        inv_prbc = session.get(Inventory, "INV_PRBC_10")
        if not inv_prbc:
            inv_prbc = Inventory(
                id="INV_PRBC_10",
                blood_bank_id="BB_TEST",
                blood_group="O-",
                component="PRBC",
                units=4,
                expiry_date=today + timedelta(days=10),
                status="available",
                synthetic=True,
            )
            session.add(inv_prbc)

        # Platelets expiring in 3 days
        inv_plt = session.get(Inventory, "INV_PLT_03")
        if not inv_plt:
            inv_plt = Inventory(
                id="INV_PLT_03",
                blood_bank_id="BB_TEST",
                blood_group="A+",
                component="Platelets",
                units=6,
                expiry_date=today + timedelta(days=3),
                status="available",
                synthetic=True,
            )
            session.add(inv_plt)

        # Seed rare blood donors
        d_oneg = session.get(Donor, "D_ONEG_1")
        if not d_oneg:
            d_oneg = Donor(
                id="D_ONEG_1",
                donor_code="DONOR-RARE-01",
                name="Sneha Menon",
                blood_group="O-",
                phone="+91-9876543210",
                latitude=13.0450,
                longitude=80.2350,
                last_donation_date=today - timedelta(days=110),
                eligible=True,
                synthetic=True,
            )
            session.add(d_oneg)

        d_bneg = session.get(Donor, "D_BNEG_1")
        if not d_bneg:
            d_bneg = Donor(
                id="D_BNEG_1",
                donor_code="DONOR-RARE-02",
                name="Kavya Suresh",
                blood_group="B-",
                phone="+91-9876543211",
                latitude=13.0500,
                longitude=80.2400,
                last_donation_date=today - timedelta(days=95),
                eligible=True,
                synthetic=True,
            )
            session.add(d_bneg)

        session.commit()
    yield
    # Cleanup


def test_clinical_storage_limits_endpoint(test_setup):
    client = TestClient(app)
    res = client.get("/api/expiry/storage-limits")
    assert res.status_code == 200
    data = res.json()
    limits = data["limits"]
    assert "PRBC" in limits
    assert limits["PRBC"]["max_days"] == 42
    assert limits["PRBC"]["max_months"] == 1.4
    assert "Whole Blood" in limits
    assert limits["Whole Blood"]["max_days"] == 35
    assert limits["Whole Blood"]["max_months"] == 1.15
    assert "Platelets" in limits
    assert limits["Platelets"]["max_days"] == 5
    assert limits["Platelets"]["max_months"] == 0.16
    assert "FFP" in limits
    assert limits["FFP"]["max_days"] == 365
    assert limits["FFP"]["max_months"] == 12.0


def test_scheduling_algorithm_valid_schedule(test_setup):
    client = TestClient(app)
    today = date.today()
    valid_date = (today + timedelta(days=5)).isoformat()

    res = client.post(
        "/api/expiry/schedule",
        json={
            "stock_id": "INV_PRBC_10",
            "scheduled_date": valid_date,
            "procedure_type": "Elective Trauma Surgery",
            "recipient_hospital": "Kilpauk MCH",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "SCHEDULED"
    assert data["is_within_clinical_limits"] is True
    assert data["scheduled_date"] == valid_date
    assert data["remaining_storage_months"] > 0
    assert data["max_approved_storage_months"] == 1.4
    assert data["fefo_priority_rank"] >= 1


def test_scheduling_algorithm_rejects_exceeding_expiry(test_setup):
    client = TestClient(app)
    today = date.today()
    # Unit INV_PRBC_10 expires in 10 days. Schedule attempt for +15 days MUST be strictly rejected!
    invalid_date = (today + timedelta(days=15)).isoformat()

    res = client.post(
        "/api/expiry/schedule",
        json={
            "stock_id": "INV_PRBC_10",
            "scheduled_date": invalid_date,
            "procedure_type": "Delayed Surgery",
        },
    )
    assert res.status_code == 400
    detail = res.json()["detail"]
    assert "Never exceed clinically approved expiry dates" in detail
    assert "Schedule rejected" in detail


def test_rare_blood_compatibility_oneg(test_setup):
    client = TestClient(app)
    res = client.get("/api/compatibility/rare-blood?recipient_group=O-&component=PRBC")
    assert res.status_code == 200
    data = res.json()
    assert data["recipient_group"] == "O-"
    assert data["is_rare_group"] is True
    # O- can receive ONLY from O-
    assert data["compatible_donor_groups"] == ["O-"]
    assert "DECISION SUPPORT ONLY" in data["decision_support_notice"]
    assert "serological cross-match" in data["decision_support_notice"]
    assert data["total_matching_donors"] >= 1


def test_rare_blood_compatibility_bneg_priority(test_setup):
    client = TestClient(app)
    # B- recipient can receive from B- and O-
    res = client.get("/api/compatibility/rare-blood?recipient_group=B-&component=PRBC")
    assert res.status_code == 200
    data = res.json()
    assert "B-" in data["compatible_donor_groups"]
    assert "O-" in data["compatible_donor_groups"]
    matches = data["prioritized_matches"]
    assert len(matches) >= 1
    # Check that exact match (B-) is prioritized over universal donor (O-) to preserve O-
    first_match = matches[0]
    if any(m["blood_group"] == "B-" for m in matches):
        assert first_match["is_exact_match"] is True


def test_rare_blood_compatibility_bombay_oh():
    client = TestClient(app)
    res = client.get("/api/compatibility/rare-blood?recipient_group=Bombay+Oh&component=PRBC")
    assert res.status_code == 200
    data = res.json()
    assert data["is_rare_group"] is True
    # Bombay Oh can ONLY receive Bombay Oh
    assert data["compatible_donor_groups"] == ["Bombay Oh"]
    assert "Bombay" in data["compatibility_rule_summary"]
    assert "DECISION SUPPORT" in data["decision_support_notice"]


def test_google_auth_donor_requires_genuine_token():
    client = TestClient(app)
    # Sending fake mock string for donor without pytest testing bypass should fail
    # We test with arbitrary invalid token
    res = client.post(
        "/api/auth/google",
        json={
            "credential": "invalid-random-fake-token-xyz-12345",
            "target_role": "REGISTERED_DONOR",
        },
    )
    assert res.status_code == 401
    assert "Genuine Google OAuth authentication required" in res.json()["detail"]
