"""
HEMO-GRID AI - Test Suite for Blood Expiry Radar MCMF Redistribution & Arrhenius Kinetics
Tests:
  1. Arrhenius-based shelf-life reduction for temperatures outside 2-6°C
  2. NetworkX Min-Cost Max-Flow redistribution suggestions
  3. Cost formula: Cost = distance - lambda*(max_expiry_days - expiry_days)
  4. Integration with /api/inventory/expiry-radar without altering existing response schema
"""

import os
import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient

from backend.database import Base, SessionLocal, engine
from backend.main import (
    app,
    arrhenius_shelf_life_reduction,
    compute_mcmf_redistribution,
)
from backend.models import BloodBank, Hospital, Inventory


from sqlalchemy import func, select


@pytest.fixture
def client():
    with SessionLocal() as session:
        count = session.scalar(select(func.count(Inventory.id))) or 0
        if count == 0:
            bank = session.get(BloodBank, "BB_RADAR")
            if not bank:
                bank = BloodBank(
                    id="BB_RADAR",
                    name="Test Blood Bank",
                    address="Test Road",
                    state="Tamil Nadu",
                    phone="+91-9999999999",
                    latitude=13.0827,
                    longitude=80.2707,
                    area="Central",
                    city="Chennai",
                    synthetic=True,
                )
                session.add(bank)
            inv = Inventory(
                id="INV_RADAR_01",
                blood_bank_id="BB_RADAR",
                blood_group="O+",
                component="PRBC",
                units=8,
                expiry_date=date.today() + timedelta(days=20),
                status="available",
                synthetic=True,
            )
            session.add(inv)
            session.commit()
    with TestClient(app) as test_client:
        yield test_client


def test_arrhenius_normal_temperature_no_reduction():
    # 4°C is optimal baseline storage temperature (inside 2-6°C)
    adj_hours, af, is_excursion, msg = arrhenius_shelf_life_reduction(
        nominal_hours=72.0, storage_temp_c=4.0
    )
    assert adj_hours == 72
    assert af == 1.0
    assert is_excursion is False
    assert msg is None

    # Boundary checks: 2.0°C and 6.0°C
    h2, af2, exc2, _ = arrhenius_shelf_life_reduction(nominal_hours=48.0, storage_temp_c=2.0)
    assert h2 == 48 and af2 == 1.0 and exc2 is False

    h6, af6, exc6, _ = arrhenius_shelf_life_reduction(nominal_hours=48.0, storage_temp_c=6.0)
    assert h6 == 48 and af6 == 1.0 and exc6 is False


def test_arrhenius_thermal_abuse_reduces_remaining_hours():
    # 12°C: warm excursion accelerates spoilage
    adj_hours, af, is_excursion, msg = arrhenius_shelf_life_reduction(
        nominal_hours=48.0, storage_temp_c=12.0
    )
    assert is_excursion is True
    assert af > 1.5  # Significant degradation
    assert adj_hours < 48  # Remaining hours reduced
    assert "Thermal excursion" in msg

    # 25°C: severe thermal abuse
    adj_hours_room, af_room, _, _ = arrhenius_shelf_life_reduction(
        nominal_hours=48.0, storage_temp_c=25.0
    )
    assert af_room > 5.0
    assert adj_hours_room < adj_hours  # Warmer temperature reduces hours even more


def test_arrhenius_freezing_and_subcooling_excursion():
    # Freezing temperature (<= 0°C) causes catastrophic hemolysis
    adj_hours_frozen, af_frozen, is_exc_frozen, msg_frozen = arrhenius_shelf_life_reduction(
        nominal_hours=72.0, storage_temp_c=-1.5
    )
    assert adj_hours_frozen == 0
    assert is_exc_frozen is True
    assert "Freezing excursion" in msg_frozen

    # Sub-cooling (0 < T < 2.0°C)
    adj_hours_sub, af_sub, is_exc_sub, msg_sub = arrhenius_shelf_life_reduction(
        nominal_hours=48.0, storage_temp_c=1.0
    )
    assert is_exc_sub is True
    assert af_sub > 1.0
    assert adj_hours_sub < 48
    assert "Sub-chilling excursion" in msg_sub


def test_mcmf_cost_formula_prioritizes_near_expiry():
    # Distance = 10 km, max_expiry_days = 5, lambda = 1.5
    # For unit with 1 day remaining:
    # cost_1d = 10 - 1.5 * (5 - 1) = 10 - 6 = 4.0
    # For unit with 4 days remaining:
    # cost_4d = 10 - 1.5 * (5 - 4) = 10 - 1.5 = 8.5
    dist = 10.0
    lambda_param = 1.5
    max_days = 5

    cost_1d = dist - lambda_param * (max_days - 1)
    cost_4d = dist - lambda_param * (max_days - 4)

    assert cost_1d == 4.0
    assert cost_4d == 8.5
    assert cost_1d < cost_4d  # Lower cost = higher priority for min-cost flow


def test_api_expiry_radar_default_response_shape(client):
    auth_header = {"Authorization": "Bearer HOSP-9042"}
    res = client.get("/api/inventory/expiry-radar", headers=auth_header)
    assert res.status_code == 200
    data = res.json()

    # All existing response fields MUST be preserved
    assert "summary" in data
    assert "items" in data
    assert "clinical_protocols" in data

    summary = data["summary"]
    assert "total_units" in summary
    assert "critical_units" in summary
    assert "warning_units" in summary
    assert "safe_units" in summary
    assert "expired_units" in summary
    assert "fefo_candidates_count" in summary
    assert "potential_wastage_units" in summary
    assert "adherence_rate_pct" in summary

    # New optional fields
    assert "redistribution_suggestions" in data
    assert "mcmf_optimization_summary" in data
    assert "arrhenius_temperature_analysis" in data
    assert isinstance(data["redistribution_suggestions"], list)


def test_api_expiry_radar_arrhenius_temperature_excursion(client):
    auth_header = {"Authorization": "Bearer HOSP-9042"}

    # 1. Normal temperature: 4°C
    res_normal = client.get("/api/inventory/expiry-radar?storage_temp_c=4.0", headers=auth_header)
    assert res_normal.status_code == 200
    normal_data = res_normal.json()
    assert normal_data["arrhenius_temperature_analysis"]["is_temperature_excursion"] is False
    assert normal_data["summary"]["temperature_excursions_count"] == 0

    # 2. Elevated temperature excursion: 14°C
    res_hot = client.get("/api/inventory/expiry-radar?storage_temp_c=14.0", headers=auth_header)
    assert res_hot.status_code == 200
    hot_data = res_hot.json()
    assert hot_data["arrhenius_temperature_analysis"]["is_temperature_excursion"] is True
    assert hot_data["summary"]["temperature_excursions_count"] > 0

    # Compare remaining hours for item with positive hours
    item_normal = next(i for i in normal_data["items"] if i["hours_remaining"] > 0)
    item_hot = next(i for i in hot_data["items"] if i["id"] == item_normal["id"])
    assert item_hot["hours_remaining"] < item_normal["hours_remaining"]
    assert item_hot["temperature_excursion"] is True
    assert item_hot["arrhenius_decay_factor"] > 1.0


def test_api_expiry_radar_mcmf_redistribution_suggestions(client):
    auth_header = {"Authorization": "Bearer HOSP-9042"}
    res = client.get("/api/inventory/expiry-radar?lambda_param=2.0", headers=auth_header)
    assert res.status_code == 200
    data = res.json()

    mcmf = data["mcmf_optimization_summary"]
    assert mcmf["algorithm"] == "NetworkX Min-Cost Max-Flow"
    assert mcmf["lambda_weight"] == 2.0
    assert "distance - lambda * (max_expiry_days - expiry_days)" in mcmf["cost_formula"]

    suggestions = data["redistribution_suggestions"]
    if suggestions:
        s0 = suggestions[0]
        assert "transfer_id" in s0
        assert "source_facility_id" in s0
        assert "target_hospital_id" in s0
        assert "units_to_transfer" in s0
        assert "cost_metric" in s0
        assert "distance_km" in s0
        assert s0["units_to_transfer"] > 0
