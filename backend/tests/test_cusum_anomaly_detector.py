"""
Tests for CUSUM Cold-Chain Anomaly Detector & Courier Status Alert.

Validates:
1. Mathematical precision of CUSUM formula:
   S_t = max(0, S_{t-1} + T_t - mu0 - k), alarm if S_t > h (mu0 = 4°C).
2. Normal operating condition (in-control baseline storage 2.0°C - 6.0°C).
3. Temperature excursion alarm triggering when cumulative variance exceeds h.
4. Backward-compatible courier status responses including optional "cold_chain_alert" boolean.
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app, cusum_anomaly_detector, CusumResult, HEMO_DISPATCHES


@pytest.fixture
def client():
    return TestClient(app)


def test_cusum_baseline_in_control():
    """
    Test that temperature readings around baseline mu0 = 4.0°C keep S_t at 0
    and do not trigger cold_chain_alert.
    """
    normal_readings = [3.8, 3.9, 4.0, 4.1, 3.8, 4.2]
    res = cusum_anomaly_detector(normal_readings, mu0=4.0, k=0.5, h=2.0)
    
    assert isinstance(res, CusumResult)
    assert res["cold_chain_alert"] is False
    assert res["alarm"] is False
    assert res["s_t"] == 0.0
    assert res.cold_chain_alert is False


def test_cusum_temperature_excursion_alarm():
    """
    Test that sustained elevated temperatures trigger the alarm when S_t > h (h=2.0).
    S_1 = max(0, 0 + 5.5 - 4.0 - 0.5) = 1.0
    S_2 = max(0, 1.0 + 6.0 - 4.0 - 0.5) = 2.5 > 2.0 -> ALARM
    """
    hot_readings = [5.5, 6.0]
    res = cusum_anomaly_detector(hot_readings, mu0=4.0, k=0.5, h=2.0)
    
    assert res["cold_chain_alert"] is True
    assert res["alarm"] is True
    assert res["s_t"] == 2.5
    assert len(res["s_history"]) == 2
    assert res["s_history"] == [1.0, 2.5]


def test_cusum_single_reading_and_unpacking():
    """
    Test single reading input and tuple unpacking compatibility:
    alert, s_t = cusum_anomaly_detector(...)
    """
    # Single reading below threshold + slack
    alert, s_t = cusum_anomaly_detector(4.2, mu0=4.0, k=0.5, h=2.0)
    assert alert is False
    assert s_t == 0.0

    # Index access
    res = cusum_anomaly_detector(7.0, mu0=4.0, k=0.5, h=2.0)
    assert res[0] is True  # cold_chain_alert
    assert res[1] == 2.5   # s_t: max(0, 7.0 - 4.0 - 0.5) = 2.5 > 2.0


def test_cusum_decay_recovery():
    """
    Test that once temperature cools back down below mu0, S_t decays back towards 0.
    """
    readings = [5.5, 6.0, 3.0, 2.5, 2.0]
    res = cusum_anomaly_detector(readings, mu0=4.0, k=0.5, h=2.0)
    
    # S_1 = 1.0
    # S_2 = 2.5
    # S_3 = max(0, 2.5 + 3.0 - 4.0 - 0.5) = 1.0
    # S_4 = max(0, 1.0 + 2.5 - 4.0 - 0.5) = 0.0
    # S_5 = max(0, 0.0 + 2.0 - 4.0 - 0.5) = 0.0
    assert res["s_history"] == [1.0, 2.5, 1.0, 0.0, 0.0]
    assert res["s_t"] == 0.0
    assert res["cold_chain_alert"] is False


def test_courier_status_patch_includes_cold_chain_alert(client):
    """
    Test PATCH /api/dispatches/{dispatch_id}/status includes cold_chain_alert in response.
    """
    headers = {"Authorization": "Bearer DLVR-8821"}
    
    # 1. Normal status update
    res = client.patch(
        "/api/dispatches/DSP-8821-01/status",
        json={"status": "IN_TRANSIT", "cold_chain_temp": 3.9},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "cold_chain_alert" in data
    assert data["cold_chain_alert"] is False
    assert data["ok"] is True
    assert data["status"] == "IN_TRANSIT"

    # 2. Excursion status update on dedicated dispatch
    try:
        res_alert = client.patch(
            "/api/dispatches/DSP-TEST-ALERT/status",
            json={"temperature_readings": [5.5, 6.2, 6.8]},
            headers=headers,
        )
        assert res_alert.status_code == 200
        data_alert = res_alert.json()
        assert data_alert["cold_chain_alert"] is True
        assert data_alert["cusum_score"] > 2.0
    finally:
        HEMO_DISPATCHES.pop("DSP-TEST-ALERT", None)
        if "DSP-8821-01" in HEMO_DISPATCHES:
            HEMO_DISPATCHES["DSP-8821-01"]["cold_chain_temp"] = 3.8
            HEMO_DISPATCHES["DSP-8821-01"]["temperature_readings"] = [3.8]
            HEMO_DISPATCHES["DSP-8821-01"]["cold_chain_alert"] = False


def test_courier_status_get_includes_cold_chain_alert(client):
    """
    Test GET /api/dispatches/{dispatch_id}/status includes cold_chain_alert.
    """
    headers = {"Authorization": "Bearer DLVR-8821"}
    res = client.get("/api/dispatches/DSP-8821-02/status", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "cold_chain_alert" in data
    assert isinstance(data["cold_chain_alert"], bool)


def test_list_courier_dispatches_includes_cold_chain_alert(client):
    """
    Test GET /api/dispatches returns items with cold_chain_alert field.
    """
    headers = {"Authorization": "Bearer DLVR-8821"}
    res = client.get("/api/dispatches", headers=headers)
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    for d in items:
        assert "cold_chain_alert" in d
        assert isinstance(d["cold_chain_alert"], bool)
