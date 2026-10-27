"""
HEMO-GRID AI - LinUCB Contextual Bandit Test Suite
Tests for:
  - LinUCB contextual bandit algorithm (pure NumPy)
  - 5 context features: distance, blood group match, days since last donation, past accept rate, hours since last notified
  - Cold-start fallback to XGBoost
  - record_feedback(donor_id, accepted: bool) state persistence to disk
  - Notification fatigue penalty
  - Batch ranking
  - API endpoint integration
"""

import json
import os
import tempfile
from pathlib import Path
import pytest
import numpy as np
from fastapi.testclient import TestClient

from backend.ml_donor_model import (
    BANDIT_CONTEXT_FEATURES,
    DonorArm,
    DonorFeatureInput,
    HeuristicDonorScorer,
    LinUCBDonorBandit,
    XGBoostDonorPredictor,
    compute_fatigue_penalty,
    record_feedback,
)
from backend.main import app


@pytest.fixture
def temp_bandit_state():
    with tempfile.TemporaryDirectory() as tmpdir:
        state_path = Path(tmpdir) / "test_bandit_state.json"
        yield state_path


def test_bandit_context_features_list():
    assert len(BANDIT_CONTEXT_FEATURES) == 5
    assert "distance" in BANDIT_CONTEXT_FEATURES
    assert "blood_group_match" in BANDIT_CONTEXT_FEATURES
    assert "days_since_last_donation" in BANDIT_CONTEXT_FEATURES
    assert "past_accept_rate" in BANDIT_CONTEXT_FEATURES
    assert "hours_since_last_notified" in BANDIT_CONTEXT_FEATURES


def test_linucb_feature_extraction():
    bandit = LinUCBDonorBandit(state_file=Path("dummy.json"))
    donor = DonorFeatureInput(
        donor_id="d-test-1",
        name="Test Donor",
        blood_group="O+",
        distance_km=5.0,
        urgency_level="high",
        days_since_last_donation=120,
        compatibility_score=1.0,
        past_accept_rate=0.8,
        hours_since_last_notified=24.0,
    )
    x, raw_ctx = bandit.extract_context(donor)
    assert x is not None
    assert x.shape == (5,)
    assert raw_ctx["distance"] == 5.0
    assert raw_ctx["blood_group_match"] == 1.0
    assert raw_ctx["days_since_last_donation"] == 120.0
    assert raw_ctx["past_accept_rate"] == 0.8
    assert raw_ctx["hours_since_last_notified"] == 24.0


def test_fatigue_penalty_calculation():
    # Immediate / within 2 hours: heavy penalty
    p_0h = compute_fatigue_penalty(0.0)
    p_1h = compute_fatigue_penalty(1.0)
    assert 0.35 <= p_0h <= 0.40
    assert 0.35 <= p_1h <= 0.40

    # 12 hours: moderate penalty
    p_12h = compute_fatigue_penalty(12.0)
    assert 0.20 <= p_12h <= 0.30

    # 24 hours: mild penalty
    p_24h = compute_fatigue_penalty(24.0)
    assert 0.10 <= p_24h <= 0.20

    # 48+ hours: zero penalty
    p_48h = compute_fatigue_penalty(48.0)
    p_72h = compute_fatigue_penalty(72.0)
    assert p_48h == 0.0
    assert p_72h == 0.0

    # Monotonically decreasing
    assert p_0h > p_12h > p_24h > p_48h


def test_linucb_cold_start_fallback_to_xgboost(temp_bandit_state):
    predictor = XGBoostDonorPredictor()
    predictor.bandit = LinUCBDonorBandit(state_file=temp_bandit_state)

    donor = DonorFeatureInput(
        donor_id="cold-donor-99",
        name="Cold Donor",
        blood_group="A+",
        distance_km=3.0,
        urgency_level="critical",
    )

    pred = predictor.predict(donor)
    assert pred["model_breakdown"]["is_cold_start"] is True
    assert pred["model_breakdown"]["model_type"] == "XGBoost Fallback"
    assert "xgboost_probability" in pred["model_breakdown"]
    assert "heuristic_probability" in pred["model_breakdown"]
    assert "blend_ratio" in pred["model_breakdown"]
    assert pred["response_probability"] > 0


def test_record_feedback_and_persistence(temp_bandit_state):
    bandit = LinUCBDonorBandit(state_file=temp_bandit_state)
    donor_id = "warm-donor-42"

    assert bandit.is_cold_start(donor_id) is True

    # Record feedback: accepted
    res1 = bandit.record_feedback(donor_id=donor_id, accepted=True)
    assert res1["status"] == "SUCCESS"
    assert res1["accepted"] is True
    assert res1["feedback_count"] == 1
    assert res1["accepted_count"] == 1
    assert res1["declined_count"] == 0
    assert res1["model_saved"] is True
    assert temp_bandit_state.exists()

    assert bandit.is_cold_start(donor_id) is False

    # Record feedback: declined
    res2 = bandit.record_feedback(donor_id=donor_id, accepted=False)
    assert res2["feedback_count"] == 2
    assert res2["accepted_count"] == 1
    assert res2["declined_count"] == 1

    # Reload from disk into a fresh bandit instance
    fresh_bandit = LinUCBDonorBandit(state_file=temp_bandit_state)
    assert fresh_bandit.is_cold_start(donor_id) is False
    arm = fresh_bandit.donor_arms[donor_id]
    assert arm.feedback_count == 2
    assert arm.accepted_count == 1
    assert arm.declined_count == 1


def test_linucb_warm_prediction_and_learning(temp_bandit_state):
    predictor = XGBoostDonorPredictor()
    predictor.bandit = LinUCBDonorBandit(state_file=temp_bandit_state)

    donor = DonorFeatureInput(
        donor_id="learner-donor",
        name="Learner Donor",
        blood_group="B+",
        distance_km=2.0,
        urgency_level="critical",
    )

    # Initial cold-start prediction
    pred_cold = predictor.predict(donor)
    assert pred_cold["model_breakdown"]["is_cold_start"] is True

    # Provide multiple positive feedbacks
    for _ in range(3):
        predictor.record_feedback(donor.donor_id, accepted=True)

    pred_warm = predictor.predict(donor)
    assert pred_warm["model_breakdown"]["is_cold_start"] is False
    assert pred_warm["model_breakdown"]["model_type"] == "LinUCB Contextual Bandit"
    assert pred_warm["model_breakdown"]["linucb_score"] is not None
    assert 0.05 <= pred_warm["response_probability"] <= 0.98


def test_batch_rank_donors_applies_fatigue():
    predictor = XGBoostDonorPredictor()

    donor_rested = DonorFeatureInput(
        donor_id="d-rested",
        name="Rested Donor",
        blood_group="O+",
        distance_km=4.0,
        urgency_level="high",
        hours_since_last_notified=72.0,
    )
    donor_fatigued = DonorFeatureInput(
        donor_id="d-fatigued",
        name="Fatigued Donor",
        blood_group="O+",
        distance_km=4.0,
        urgency_level="high",
        hours_since_last_notified=1.0,
    )

    ranked = predictor.batch_rank_donors([donor_fatigued, donor_rested])
    assert ranked[0]["donor_id"] == "d-rested"
    assert ranked[1]["donor_id"] == "d-fatigued"
    assert ranked[0]["response_probability"] > ranked[1]["response_probability"]
    assert ranked[1]["model_breakdown"]["fatigue_penalty"] > 0.35


def test_api_predict_and_feedback_endpoints():
    client = TestClient(app)

    # 1. Test POST /api/ml/predict-donor-response
    response = client.post(
        "/api/ml/predict-donor-response",
        json={
            "donor_id": "api-donor-1",
            "name": "API Volunteer",
            "blood_group": "O-",
            "distance_km": 3.0,
            "urgency_level": "critical",
            "hours_since_last_notified": 48.0,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "donor_id" in data
    assert "response_probability" in data
    assert "predicted_eta_minutes" in data
    assert "model_breakdown" in data
    assert "key_factors" in data

    # 2. Test POST /api/ml/feedback
    fb_res = client.post(
        "/api/ml/feedback",
        json={"donor_id": "api-donor-1", "accepted": True},
    )
    assert fb_res.status_code == 200
    fb_data = fb_res.json()
    assert fb_data["status"] == "SUCCESS"
    assert fb_data["donor_id"] == "api-donor-1"
    assert fb_data["accepted"] is True
    assert fb_data["feedback_count"] >= 1
