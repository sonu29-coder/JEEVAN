import os
import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.fcm_notifications import (
    DonorRateLimiter,
    FCM_ENGINE,
    FirebaseFCMEngine,
    TokenBucket,
)
from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_token_bucket_algorithm():
    # Capacity 3, refill 1 token per second
    bucket = TokenBucket(capacity=3.0, refill_rate=1.0)
    assert bucket.consume(1.0)[0] is True
    assert bucket.consume(1.0)[0] is True
    assert bucket.consume(1.0)[0] is True

    # 4th consume should be throttled
    allowed, retry_after = bucket.consume(1.0)
    assert allowed is False
    assert retry_after > 0.0

    # Wait for refill
    time.sleep(1.05)
    allowed, _ = bucket.consume(1.0)
    assert allowed is True


def test_donor_rate_limiter_per_donor():
    limiter = DonorRateLimiter(capacity=2.0, refill_rate=0.5)

    # Donor A consumes 2 tokens
    assert limiter.consume("donor-123")[0] is True
    assert limiter.consume("donor-123")[0] is True
    assert limiter.consume("donor-123")[0] is False

    # Donor B has their own independent bucket
    assert limiter.consume("donor-456")[0] is True
    assert limiter.consume("donor-456")[0] is True
    assert limiter.consume("donor-456")[0] is False


def test_fcm_rate_limiting_on_donor_notifications():
    engine = FirebaseFCMEngine()
    engine.donor_rate_limiter = DonorRateLimiter(capacity=2.0, refill_rate=0.1)

    # Save donor device token
    engine.save_donor_device_token(donor_id="donor-test", device_token="test_donor_token_xyz")

    # Send 2 notifications (should succeed)
    res1 = engine.send_to_donor("donor-test", "Alert 1", "Body 1")
    assert res1["success"] == 1

    res2 = engine.send_to_donor("donor-test", "Alert 2", "Body 2")
    assert res2["success"] == 1

    # 3rd notification should be rate limited
    res3 = engine.send_to_donor("donor-test", "Alert 3", "Body 3")
    assert res3["status"] == "RATE_LIMITED"
    assert res3["success"] == 0
    assert res3["failure"] == 1
    assert "retry_after_seconds" in res3
    assert res3["retry_after_seconds"] > 0

    # In-memory history should reflect the attempts
    recent = engine.get_recent_notifications(limit=5)
    assert any(m["status"] == "RATE_LIMITED" for m in recent)


def test_fcm_fallback_when_sending_fails():
    engine = FirebaseFCMEngine()
    # Mock firebase app that fails when sending
    mock_app = MagicMock()
    engine._firebase_app = mock_app
    engine._firebase_initialized = True

    with patch("firebase_admin.messaging.send", side_effect=Exception("FCM Quota Exceeded")):
        res = engine.send_to_token(
            token="recipient_token_123",
            title="Emergency Alert",
            body="Immediate donor needed",
        )
        # Should smoothly fall back to in-memory list
        assert res["mode"] == "FALLBACK_IN_MEMORY"
        assert res["success"] == 1
        assert len(engine.message_history) > 0
        assert engine.message_history[0].status == "DELIVERED_FALLBACK"


def test_fcm_real_sending_success():
    engine = FirebaseFCMEngine()
    mock_app = MagicMock()
    engine._firebase_app = mock_app
    engine._firebase_initialized = True

    with patch("firebase_admin.messaging.send", return_value="projects/jeevan/messages/real-fcm-999"):
        res = engine.send_to_token(
            token="recipient_token_456",
            title="Real Alert",
            body="Blood matched",
        )
        assert res["mode"] == "REAL_FCM"
        assert res["name"] == "projects/jeevan/messages/real-fcm-999"
        assert engine.message_history[0].status == "DELIVERED"
        assert engine.message_history[0].message_id == "projects/jeevan/messages/real-fcm-999"


def test_api_save_donor_device_token(client):
    response = client.post(
        "/api/donor/device-token",
        json={
            "donor_id": "donor-sarah",
            "device_token": "fcm_token_device_sarah_12345",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SAVED"
    assert data["donor_id"] == "donor-sarah"
    assert data["device_token"] == "fcm_token_device_sarah_12345"

    # Verify endpoint works on both /donor/device-token and /donors/device-token
    response2 = client.post(
        "/api/donors/device-token",
        json={
            "donor_id": "donor-vikram",
            "device_token": "fcm_token_device_vikram_67890",
        },
    )
    assert response2.status_code == 200
    data2 = response2.json()
    assert data2["donor_id"] == "donor-vikram"


def test_api_donor_rate_limiting_via_fcm_send(client):
    # Reset limiter for donor-sarah
    FCM_ENGINE.donor_rate_limiter = DonorRateLimiter(capacity=2.0, refill_rate=0.1)
    FCM_ENGINE.save_donor_device_token("donor-sarah", "fcm_token_device_sarah_12345")

    # Send 1st push
    res1 = client.post(
        "/api/fcm/send",
        json={
            "donor_id": "donor-sarah",
            "title": "Need O- Blood",
            "body": "Urgent requirement",
        },
    )
    assert res1.status_code == 200
    assert res1.json()["success"] == 1

    # Send 2nd push
    res2 = client.post(
        "/api/fcm/send",
        json={
            "donor_id": "donor-sarah",
            "title": "Need O- Blood (Second Call)",
            "body": "Urgent requirement",
        },
    )
    assert res2.status_code == 200
    assert res2.json()["success"] == 1

    # Send 3rd push -> Should be rate limited
    res3 = client.post(
        "/api/fcm/send",
        json={
            "donor_id": "donor-sarah",
            "title": "Need O- Blood (Third Call)",
            "body": "Urgent requirement",
        },
    )
    assert res3.status_code == 200
    data3 = res3.json()
    assert data3["status"] == "RATE_LIMITED"
    assert data3["success"] == 0
    assert data3["failure"] == 1
    assert data3["retry_after_seconds"] > 0
