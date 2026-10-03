"""
HEMO-GRID AI - Test Suite for GIS Routing, Frontend Schemas, Security & RBAC
"""

import os
from datetime import date, timedelta

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JEEVAN_API_KEY"] = "test-only-api-key"
os.environ["JWT_SECRET_KEY"] = "test-hemo-grid-secret"

import pytest
from fastapi.testclient import TestClient
from backend.database import Base, SessionLocal, engine
from backend.main import app
from backend.routing import RoadGraph, RouteType, build_default_thrissur_graph, haversine_distance, optimize_route


@pytest.fixture()
def client():
    import backend.main as main
    Base.metadata.drop_all(bind=main.engine)
    Base.metadata.create_all(bind=main.engine)
    with TestClient(app) as test_client:
        yield test_client


# =====================================================================
# 1. GIS Routing & Algorithm Tests (A* vs Dijkstra)
# =====================================================================

def test_haversine_formula():
    # IMA Thrissur to Elite Mission Hospital
    ima = (10.5262, 76.2138)
    elite = (10.5089, 76.2052)
    dist = haversine_distance(ima, elite)
    assert 1.5 < dist < 3.0, f"Expected approx 2.1km, got {dist}"


def test_dijkstra_vs_a_star_green_corridor():
    graph = build_default_thrissur_graph()

    # Standard route with Dijkstra (traffic lights + congestion delay)
    dijkstra_path, d_dist, d_time = graph.dijkstra("bank-ima", "icu-elite")
    assert "bank-ima" in dijkstra_path
    assert "icu-elite" in dijkstra_path
    assert d_dist > 0
    assert d_time > 0

    # Green corridor with A* (preempted traffic lights, speed clearance)
    astar_path, a_dist, a_time = graph.a_star("bank-ima", "icu-elite")
    assert "bank-ima" in astar_path
    assert "icu-elite" in astar_path
    # Green corridor travel time must be significantly faster than standard transit time
    assert a_time < d_time, f"Green corridor time ({a_time}m) should be faster than standard time ({d_time}m)"


def test_route_optimize_endpoint_standard(client):
    response = client.post(
        "/api/route/optimize",
        json={
            "origin": "bank-ima",
            "destination": "icu-elite",
            "route_type": "STANDARD",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["route_type"] == "STANDARD"
    assert data["algorithm"] == "Dijkstra"
    assert data["total_distance_km"] > 0
    assert data["eta_minutes"] > 0
    assert len(data["path"]) >= 2
    assert len(data["turn_by_turn"]) >= 2
    assert "coordinates" in data["turn_by_turn"][0]


def test_route_optimize_endpoint_green_corridor(client):
    response = client.post(
        "/api/route/optimize",
        json={
            "origin_lat": 10.5262,
            "origin_lng": 76.2138,
            "dest_lat": 10.5089,
            "dest_lng": 76.2052,
            "route_type": "GREEN_CORRIDOR",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["route_type"] == "GREEN_CORRIDOR"
    assert data["algorithm"] == "A*"
    assert data["green_corridor_active"] is True
    assert data["total_distance_km"] > 0


# =====================================================================
# 2. Authentication & JWT Bearer Security Tests
# =====================================================================

def test_jwt_login_with_roles(client):
    roles = ["ICU_HOSPITAL", "DONOR", "DELIVERY_PARTNER", "BLOOD_BANK"]
    for role in roles:
        response = client.post(
            "/api/auth/login",
            json={"role": role},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        # DONOR normalizes to REGISTERED_DONOR
        expected_role = "REGISTERED_DONOR" if role == "DONOR" else role
        assert data["role"] == expected_role

        # Verify access token works with /api/auth/me
        me_res = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        )
        assert me_res.status_code == 200
        assert me_res.json()["role"] == expected_role


def test_frontend_demo_tokens_interoperability(client):
    demo_tokens = {
        "HOSP-9042": "ICU_HOSPITAL",
        "DONOR-1108": "REGISTERED_DONOR",
        "DLVR-8821": "DELIVERY_PARTNER",
    }
    for token, expected_role in demo_tokens.items():
        me_res = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_res.status_code == 200
        assert me_res.json()["role"] == expected_role


def test_portal_access_control_rbac(client):
    # Hospital token accessing ICU portal -> 200 OK
    res1 = client.post(
        "/api/portal/icu",
        headers={"Authorization": "Bearer HOSP-9042"},
    )
    assert res1.status_code == 200
    assert res1.json()["granted"] is True

    # Hospital token attempting to access Donor portal -> 403 Forbidden
    res2 = client.post(
        "/api/portal/donor",
        headers={"Authorization": "Bearer HOSP-9042"},
    )
    assert res2.status_code == 403

    # Courier token accessing Logistics portal -> 200 OK
    res3 = client.post(
        "/api/portal/logistics",
        headers={"Authorization": "Bearer DLVR-8821"},
    )
    assert res3.status_code == 200
    assert res3.json()["granted"] is True


# =====================================================================
# 3. Blood Requests (ICU Hospital View) Tests
# =====================================================================

def test_request_blood_dispatch_flow(client):
    payload = {
        "icu_id": "icu-elite",
        "blood_group": "O-",
        "component_type": "PRBC",
        "urgency": "CRITICAL",
        "units": 2,
        "location": {"lat": 10.5089, "lng": 76.2052},
    }
    response = client.post(
        "/api/request-blood",
        json=payload,
        headers={"Authorization": "Bearer HOSP-9042"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["request_id"].startswith("REQ-")
    assert data["status"] == "SENT"
    assert data["matched_donors"] >= 1
    assert data["eta_minutes"] > 0


def test_icu_hospital_view_schema(client):
    response = client.get(
        "/api/requests/icu-view",
        headers={"Authorization": "Bearer HOSP-9042"},
    )
    assert response.status_code == 200
    requests = response.json()
    assert len(requests) >= 1
    item = requests[0]
    # Strictly checking Next.js ICU view fields:
    # id, hospital_name, blood_type, units, urgency_level, status
    assert "id" in item
    assert "hospital_name" in item
    assert "blood_type" in item
    assert "units" in item
    assert "urgency_level" in item
    assert item["status"] in ["PENDING", "RESERVED", "DISPATCHED", "DELIVERED"]


def test_stock_reservation_concurrency(client):
    # Reserve unit s2
    res1 = client.post(
        "/api/reserve-stock",
        json={
            "stock_id": "s2",
            "bank_id": "bank-gmc",
            "icu_id": "icu-elite",
            "blood_group": "O+",
            "component_type": "Whole Blood",
            "units": 1,
        },
        headers={"Authorization": "Bearer HOSP-9042"},
    )
    assert res1.status_code == 200
    assert "lock_id" in res1.json()
    assert res1.json()["expires_in"] == 900

    # Second hospital attempts to reserve the same unit -> 409 Conflict
    res2 = client.post(
        "/api/reserve-stock",
        json={
            "stock_id": "s2",
            "bank_id": "bank-gmc",
            "icu_id": "icu-westfort",
            "blood_group": "O+",
            "component_type": "Whole Blood",
            "units": 1,
        },
        headers={"Authorization": "Bearer HOSP-9042"},
    )
    assert res2.status_code == 409
    assert "on hold" in res2.json()["detail"]


# =====================================================================
# 4. Donor Management & Anti-Fatigue Rules Tests
# =====================================================================

def test_donor_management_view(client):
    response = client.get(
        "/api/donors/management",
        headers={"Authorization": "Bearer DONOR-1108"},
    )
    assert response.status_code == 200
    donors = response.json()
    assert len(donors) >= 1
    for d in donors:
        # Strictly checking required fields:
        # donor_id, distance_km, last_donated_days, cooldown_active, anti_fatigue_eligible
        assert "donor_id" in d
        assert "distance_km" in d
        assert "last_donated_days" in d
        assert isinstance(d["cooldown_active"], bool)
        assert isinstance(d["anti_fatigue_eligible"], bool)

        # Verify business logic
        if d["last_donated_days"] < 90:
            assert d["cooldown_active"] is True
            assert d["anti_fatigue_eligible"] is False


def test_single_donor_eligibility(client):
    response = client.get(
        "/api/donors/d1/eligibility",
        headers={"Authorization": "Bearer DONOR-1108"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["donor_id"] == "d1"
    assert data["last_donated_days"] >= 90
    assert data["cooldown_active"] is False
    assert data["anti_fatigue_eligible"] is True


# =====================================================================
# 5. Delivery & OTP Handshake (Courier View) Tests
# =====================================================================

def test_courier_dispatches_schema(client):
    response = client.get(
        "/api/dispatches",
        headers={"Authorization": "Bearer DLVR-8821"},
    )
    assert response.status_code == 200
    dispatches = response.json()
    assert len(dispatches) >= 1
    for d in dispatches:
        # Strictly checking required Courier View fields:
        # dispatch_id, courier_id, pickup_otp, delivery_otp, cold_chain_temp
        assert "dispatch_id" in d
        assert "courier_id" in d
        assert "pickup_otp" in d
        assert "delivery_otp" in d
        assert 2.0 <= d["cold_chain_temp"] <= 6.0


def test_verify_delivery_otp_handshake(client):
    # s6 lock has OTP '8492'
    verify_res = client.post(
        "/api/verify-otp",
        json={"lock_id": "LCK-71D4", "stock_id": "s6", "otp": "8492"},
        headers={"Authorization": "Bearer HOSP-9042"},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "VERIFIED"

    # Wrong PIN fails with 400 Bad Request
    fail_res = client.post(
        "/api/verify-otp",
        json={"lock_id": "LCK-71D4", "stock_id": "s6", "otp": "0000"},
        headers={"Authorization": "Bearer HOSP-9042"},
    )
    assert fail_res.status_code == 400


# =====================================================================
# 6. CORS Configuration Verification
# =====================================================================

def test_cors_headers_options_request(client):
    response = client.options(
        "/api/route/optimize",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization,Content-Type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "authorization" in response.headers.get("access-control-allow-headers", "").lower()
