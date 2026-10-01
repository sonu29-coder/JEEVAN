import os
from datetime import date, timedelta

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JEEVAN_API_KEY"] = "test-only-api-key"

import pytest
from fastapi.testclient import TestClient
from redis.exceptions import RedisError
from sqlalchemy import func, select

from backend.database import Base, SessionLocal, engine
from backend.import_data import (
    RAW_BANKS_CSV,
    SYNTHETIC_DIR,
    import_data,
    licensed_bank_records,
    synthetic_records,
)
from backend.main import app, compatible_groups, publish_pending_alerts
from backend.models import BloodBank, Donor, Hospital, Inventory


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.events = []
        self.fail_events = False

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
        if self.fail_events:
            raise RedisError("Redis unavailable")
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
        yield test_client, fake_redis


@pytest.fixture()
def seeded(client):
    test_client, fake_redis = client
    today = date.today()
    with SessionLocal() as session:
        session.add_all(
            [
                Hospital(
                    id="H1",
                    name="Central Hospital",
                    city="Thrissur",
                    state="Kerala",
                    latitude=10.52,
                    longitude=76.21,
                    synthetic=True,
                    source="synthetic_demo",
                ),
                BloodBank(
                    id="BB1",
                    name="Central Blood Bank",
                    address="Main road",
                    city="Thrissur",
                    state="Kerala",
                    latitude=10.53,
                    longitude=76.22,
                    synthetic=True,
                    source="synthetic_demo",
                ),
                Donor(
                    id="D1",
                    donor_code="D-1",
                    name="Eligible Donor",
                    blood_group="O-",
                    phone="9000000001",
                    latitude=10.521,
                    longitude=76.211,
                    response_rate=90,
                    eligible=True,
                    synthetic=True,
                    source="synthetic_demo",
                ),
                Donor(
                    id="D2",
                    donor_code="D-2",
                    name="Incompatible Donor",
                    blood_group="B-",
                    phone="9000000002",
                    latitude=10.522,
                    longitude=76.212,
                    response_rate=80,
                    eligible=True,
                    synthetic=True,
                    source="synthetic_demo",
                ),
                Inventory(
                    id="I1",
                    blood_bank_id="BB1",
                    blood_group="A+",
                    component="RBC",
                    units=5,
                    expiry_date=today + timedelta(days=20),
                    status="available",
                    synthetic=True,
                    source="synthetic_demo",
                ),
            ]
        )
        session.commit()
    return test_client, fake_redis


def headers():
    return {"X-API-Key": "test-only-api-key"}


def make_request(client, **overrides):
    body = {
        "hospital_name": "Central Hospital",
        "patient_blood_group": "A+",
        "component": "RBC",
        "units_required": 2,
        "urgency": "critical",
        "hospital_latitude": 10.52,
        "hospital_longitude": 76.21,
    }
    body.update(overrides)
    response = client.post("/api/requests", headers=headers(), json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_api_key_is_required(client):
    test_client, _ = client
    assert test_client.get("/api/hospitals").status_code == 401
    assert test_client.get("/api/hospitals", headers=headers()).status_code == 200


def test_availability_cache_and_reservation_adjustment(seeded):
    client, _ = seeded
    params = {"blood_group": "A+", "component": "RBC"}
    first = client.get("/api/availability", headers=headers(), params=params)
    second = client.get("/api/availability", headers=headers(), params=params)
    assert first.status_code == 200
    assert first.json()["items"], first.json()
    assert first.json()["items"][0]["available_units"] == 5
    assert first.json()["cached"] is False
    assert second.json()["cached"] is True

    request = make_request(client, units_required=5)
    reservation = client.post(
        f"/api/requests/{request['request_id']}/reservations",
        headers=headers(),
        json={"inventory_id": "I1", "units": 3, "ttl_minutes": 10},
    )
    assert reservation.status_code == 201, reservation.text
    updated = client.get("/api/availability", headers=headers(), params=params)
    assert updated.json()["items"][0]["available_units"] == 2
    assert updated.json()["cached"] is False

    other_request = make_request(client, units_required=5)
    overbooked = client.post(
        f"/api/requests/{other_request['request_id']}/reservations",
        headers=headers(),
        json={"inventory_id": "I1", "units": 3, "ttl_minutes": 10},
    )
    assert overbooked.status_code == 409


def test_geographic_urgency_matches_and_alert_stream(seeded):
    client, fake_redis = seeded
    request = make_request(client)
    response = client.post(
        f"/api/requests/{request['request_id']}/matches",
        headers=headers(),
    )
    assert response.status_code == 200, response.text
    matches = response.json()["matches"]
    assert {match["type"] for match in matches} == {"donor", "blood_bank"}
    assert "D1" in {match["donor_id"] for match in matches}
    assert "D2" not in {match["donor_id"] for match in matches}
    assert all(match["distance_km"] >= 0 for match in matches)

    alert_response = client.post(
        f"/api/requests/{request['request_id']}/alerts",
        headers=headers(),
    )
    assert alert_response.status_code == 201, alert_response.text
    payload = alert_response.json()
    assert payload["created"] == 1
    assert payload["published_to_redis"] == 1
    assert fake_redis.events[0][0] == "jeevan:donor-alerts"
    alert_id = payload["alerts"][0]["alert_id"]

    acknowledged = client.post(
        f"/api/alerts/{alert_id}/acknowledge",
        headers=headers(),
    )
    assert acknowledged.json()["status"] == "acknowledged"
    audit = client.get(
        "/api/audit",
        headers=headers(),
        params={"entity_type": "donor_alert"},
    )
    assert audit.status_code == 200
    assert any(record["action"] == "ACKNOWLEDGE_ALERT" for record in audit.json())


def test_fulfillment_requires_and_confirms_active_reservation(seeded):
    client, _ = seeded
    request = make_request(client)
    status_url = f"/api/requests/{request['request_id']}/status"
    no_reservation = client.patch(
        status_url,
        headers=headers(),
        json={"status": "fulfilled"},
    )
    assert no_reservation.status_code == 409

    reserved = client.post(
        f"/api/requests/{request['request_id']}/reservations",
        headers=headers(),
        json={"inventory_id": "I1", "units": 2, "ttl_minutes": 10},
    )
    assert reserved.status_code == 201
    fulfilled = client.patch(
        status_url,
        headers=headers(),
        json={"status": "fulfilled"},
    )
    assert fulfilled.status_code == 200
    assert fulfilled.json()["status"] == "fulfilled"
    details = client.get(
        f"/api/requests/{request['request_id']}",
        headers=headers(),
    )
    assert details.json()["reservations"][0]["status"] == "confirmed"
    available = client.get(
        "/api/availability",
        headers=headers(),
        params={"blood_group": "A+", "component": "RBC"},
    )
    assert available.json()["items"][0]["available_units"] == 3


def test_cancelling_request_releases_its_reservation(seeded):
    client, _ = seeded
    request = make_request(client)
    reserved = client.post(
        f"/api/requests/{request['request_id']}/reservations",
        headers=headers(),
        json={"inventory_id": "I1", "units": 2, "ttl_minutes": 10},
    )
    assert reserved.status_code == 201
    cancelled = client.patch(
        f"/api/requests/{request['request_id']}/status",
        headers=headers(),
        json={"status": "cancelled"},
    )
    assert cancelled.status_code == 200
    details = client.get(
        f"/api/requests/{request['request_id']}",
        headers=headers(),
    )
    assert details.json()["reservations"][0]["status"] == "released"
    stock = client.get("/api/availability", headers=headers())
    assert stock.json()["items"][0]["available_units"] == 5


def test_component_specific_compatibility():
    assert compatible_groups("O+", "Plasma") == {"AB-", "AB+"}
    assert compatible_groups("A+", "Platelets") == {"A-", "A+"}


def test_alert_outbox_retries_when_redis_recovers(seeded):
    client, fake_redis = seeded
    fake_redis.fail_events = True
    request = make_request(client)
    response = client.post(
        f"/api/requests/{request['request_id']}/alerts",
        headers=headers(),
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["pending_delivery"] == 1
    assert payload["published_to_redis"] == 0
    assert fake_redis.events == []

    fake_redis.fail_events = False
    assert publish_pending_alerts() == 1
    assert len(fake_redis.events) == 1


def test_historic_blood_bank_csv_keeps_provenance_without_fabricated_coordinates():
    records = licensed_bank_records(RAW_BANKS_CSV)
    assert len(records) == 199
    assert records[0]["city"] == "Chennai"
    assert records[0]["latitude"] is None
    assert records[0]["longitude"] is None
    assert records[0]["synthetic"] is False
    assert records[0]["licence_valid_until"] == date(2015, 12, 31)


def test_generated_csv_importer_converts_all_nine_files():
    records = list(synthetic_records(SYNTHETIC_DIR))
    assert len(records) == 1_315
    files = {file_name for file_name, _, _ in records}
    assert files == {
        "hospitals.csv",
        "blood_banks.csv",
        "donors.csv",
        "inventory.csv",
        "requests.csv",
        "matches.csv",
        "reservations.csv",
        "donor_alerts.csv",
        "audit_logs.csv",
    }
    reservation = next(row for _, model, row in records if model.__name__ == "Reservation")
    assert reservation["expires_at"].tzinfo is not None


def test_csv_import_is_transactional_and_idempotent():
    Base.metadata.drop_all(bind=engine)
    counts = import_data(SYNTHETIC_DIR, RAW_BANKS_CSV)
    second_counts = import_data(SYNTHETIC_DIR, RAW_BANKS_CSV)
    assert counts == second_counts
    assert counts["donors.csv"] == 300
    assert counts["private_bloodbanks_0.csv"] == 199
    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(Donor)) == 300
        assert session.scalar(select(func.count()).select_from(BloodBank)) == 214
