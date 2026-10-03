"""
HEMO-GRID AI - Firebase Cloud Messaging (FCM) & OTP Handshake Engine
Simulates Firebase FCM push notifications, device tokens, emergency topic broadcasts,
and secure OTP delivery verification between Blood Banks, Couriers, and ICU Hospitals.
"""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


@dataclass
class FCMMessage:
    message_id: str
    recipient_token: Optional[str]
    topic: Optional[str]
    title: str
    body: str
    data: Dict[str, Any]
    priority: str = "high"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "DELIVERED"
    delivery_latency_ms: int = 42


@dataclass
class DeviceRegistration:
    user_id: str
    role: str
    fcm_token: str
    registered_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    subscribed_topics: List[str] = field(default_factory=list)


class FirebaseFCMEngine:
    """
    Simulated Firebase Cloud Messaging (FCM) Push Notification Server.
    Provides standard FCM payloads, topic broadcasts, and delivery receipt logs.
    """

    def __init__(self):
        self.devices: Dict[str, DeviceRegistration] = {}
        self.message_history: List[FCMMessage] = []
        self._init_default_demo_devices()

    def _init_default_demo_devices(self):
        """Seed default tokens for Thrissur medical grid stakeholders."""
        default_devices = [
            ("icu-elite", "ICU_HOSPITAL", "fcm_token_icu_elite_4892", ["emergency-alerts-thrissur", "icu-dispatches"]),
            ("icu-westfort", "ICU_HOSPITAL", "fcm_token_icu_westfort_1120", ["emergency-alerts-thrissur", "icu-dispatches"]),
            ("bank-ima", "BLOOD_BANK", "fcm_token_bank_ima_9934", ["emergency-alerts-thrissur", "stock-alerts"]),
            ("courier-42", "COURIER", "fcm_token_courier_42_7712", ["courier-jobs"]),
            ("donor-d1", "DONOR", "fcm_token_donor_aarav_3311", ["donor-requests-o-negative"]),
            (
                "ncc-coord-thrissur",
                "NCC_BLOOD_CLUB_COORDINATOR",
                "fcm_token_ncc_coordinator_23_kerala",
                ["emergency-alerts-thrissur", "ncc-cadet-mobilization"],
            ),
        ]
        for u_id, role, token, topics in default_devices:
            self.register_device(u_id, role, token, topics)

    def dispatch_ncc_coordinator_alert(
        self,
        hospital_name: str,
        blood_group: str,
        units: int,
        urgency: str = "CRITICAL",
        patient_info: str = "Trauma Surgery Emergency",
    ) -> Dict[str, Any]:
        """
        Dispatches an automatic high-priority emergency message to the
        Single Verified College NCC Coordinator & Blood Club Leader.
        """
        coordinator_name = "Capt. Dr. Arun Balakrishnan"
        coordinator_unit = "23 Kerala Battalion NCC • St. Thomas College & GEC Thrissur"
        coordinator_phone = "+91 94471 28904"
        token = "fcm_token_ncc_coordinator_23_kerala"

        title = f"🚨 URGENT CODE RED: {units} Units {blood_group} Needed at {hospital_name}"
        body = (
            f"Official Emergency Alert for College NCC Coordinator {coordinator_name}: "
            f"{hospital_name} requires immediate emergency dispatch of {units} units {blood_group} "
            f"({urgency.upper()}). Please mobilize verified college NCC cadets."
        )

        fcm_res = self.send_to_token(
            token=token,
            title=title,
            body=body,
            data={
                "type": "NCC_EMERGENCY_DISPATCH",
                "hospital": hospital_name,
                "blood_group": blood_group,
                "units": str(units),
                "urgency": urgency,
                "coordinator_name": coordinator_name,
                "coordinator_unit": coordinator_unit,
                "coordinator_phone": coordinator_phone,
                "cadets_mobilized_count": "128",
            },
            priority="high",
        )

        return {
            "status": "DISPATCHED_TO_NCC_COORDINATOR",
            "message_id": fcm_res["name"],
            "coordinator": {
                "name": coordinator_name,
                "title": "College NCC Blood Donation Coordinator & Red Cross Club Officer",
                "unit": coordinator_unit,
                "phone": coordinator_phone,
                "verification_id": "NCC-KL-23-BC01",
                "status": "VERIFIED_ACTIVE",
                "cadets_available": 128,
            },
            "emergency": {
                "hospital_name": hospital_name,
                "blood_group": blood_group,
                "units": units,
                "urgency": urgency,
                "alert_body": body,
            },
            "delivery_timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def register_device(
        self, user_id: str, role: str, fcm_token: str, topics: Optional[List[str]] = None
    ) -> DeviceRegistration:
        dev = DeviceRegistration(
            user_id=user_id,
            role=role,
            fcm_token=fcm_token,
            subscribed_topics=topics or ["emergency-alerts-thrissur"],
        )
        self.devices[fcm_token] = dev
        return dev

    def send_to_token(
        self,
        token: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
        priority: str = "high",
    ) -> Dict[str, Any]:
        """Send simulated FCM push notification to a specific device token."""
        msg_id = f"projects/jeevan-fcm/messages/{uuid4().hex[:12]}"
        msg = FCMMessage(
            message_id=msg_id,
            recipient_token=token,
            topic=None,
            title=title,
            body=body,
            data=data or {},
            priority=priority,
        )
        self.message_history.insert(0, msg)
        logger.info("[FCM PUSH -> %s]: %s - %s", token[:12], title, body)

        return {
            "name": msg_id,
            "multicast_id": int(time.time() * 1000),
            "success": 1,
            "failure": 0,
            "canonical_ids": 0,
            "results": [{"message_id": msg_id, "status": "DELIVERED"}],
        }

    def broadcast_to_topic(
        self,
        topic: str,
        title: str,
        body: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Broadcast emergency alert to all subscribers of a Firebase topic."""
        msg_id = f"projects/jeevan-fcm/topics/{topic}/{uuid4().hex[:10]}"
        msg = FCMMessage(
            message_id=msg_id,
            recipient_token=None,
            topic=topic,
            title=title,
            body=body,
            data=data or {},
            priority="high",
        )
        self.message_history.insert(0, msg)
        logger.info("[FCM BROADCAST -> /topics/%s]: %s - %s", topic, title, body)

        # Count recipient devices
        sub_count = sum(1 for d in self.devices.values() if topic in d.subscribed_topics)

        return {
            "message_id": msg_id,
            "topic": topic,
            "recipients_reached": max(1, sub_count),
            "status": "BROADCAST_SUCCESS",
            "timestamp": msg.timestamp,
        }

    def get_recent_notifications(self, limit: int = 15) -> List[Dict[str, Any]]:
        return [asdict(m) for m in self.message_history[:limit]]


class OTPVerificationManager:
    """
    Manages security PINs and OTP handshakes for emergency blood custody transfers.
    Integrates directly with Next.js otp-view.tsx and courier workflows.
    """

    def __init__(self, fcm_engine: FirebaseFCMEngine):
        self.fcm = fcm_engine
        # Standard seeded OTPs matching frontend/lib/hemo-data.ts
        self.active_otps: Dict[str, Dict[str, Any]] = {
            "LCK-71D4": {
                "otp": "8492",
                "stock_id": "STK-O-01",
                "bank_id": "bank-ima",
                "icu_id": "icu-elite",
                "status": "PENDING",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        }

    def generate_otp_for_lock(
        self, lock_id: str, stock_id: str, bank_id: str, icu_id: str
    ) -> str:
        """Create a 4-digit security PIN for a newly locked blood unit."""
        if lock_id == "LCK-71D4":
            otp = "8492"
        else:
            otp = str(random.randint(1000, 9999))

        self.active_otps[lock_id] = {
            "otp": otp,
            "stock_id": stock_id,
            "bank_id": bank_id,
            "icu_id": icu_id,
            "status": "PENDING",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # Dispatch simulated push notification to driver/courier with the PIN
        self.fcm.broadcast_to_topic(
            topic="courier-jobs",
            title="🔒 New Blood Custody Lock Created",
            body=f"Lock {lock_id} generated. Secure handshake PIN: {otp}",
            data={"lock_id": lock_id, "otp": otp, "stock_id": stock_id},
        )
        return otp

    def verify_otp(
        self, lock_id: Optional[str], stock_id: Optional[str], input_otp: str
    ) -> Dict[str, Any]:
        """
        Validates OTP provided by ICU Hospital or Courier.
        If valid, marks lock as VERIFIED and dispatches Firebase push notifications.
        """
        # Check standard default or active locks
        expected = None
        target_lock_id = lock_id

        if target_lock_id and target_lock_id in self.active_otps:
            expected = self.active_otps[target_lock_id]["otp"]
        elif target_lock_id == "LCK-71D4":
            expected = "8492"
        elif input_otp in ["8492", "1234"]:
            # Standard demo bypass
            expected = input_otp
            target_lock_id = target_lock_id or "LCK-71D4"

        if expected and str(input_otp).strip() == str(expected):
            if target_lock_id and target_lock_id in self.active_otps:
                self.active_otps[target_lock_id]["status"] = "VERIFIED"
                self.active_otps[target_lock_id]["verified_at"] = datetime.now(timezone.utc).isoformat()

            # Trigger Firebase push notifications for delivery confirmation
            self.fcm.broadcast_to_topic(
                topic="emergency-alerts-thrissur",
                title="✅ Emergency Blood Delivery Handshake Completed",
                body=f"Custody verified for {stock_id or 'blood unit'}. Handshake confirmed at ICU Hospital.",
                data={
                    "event": "HANDSHAKE_VERIFIED",
                    "lock_id": target_lock_id,
                    "stock_id": stock_id,
                    "verified": True,
                },
            )

            return {
                "verified": True,
                "status": "VERIFIED",
                "message": "Handshake successful. Blood unit custody securely transferred.",
                "lock_id": target_lock_id,
                "stock_id": stock_id,
                "verified_at": datetime.now(timezone.utc).isoformat(),
            }
        else:
            return {
                "verified": False,
                "status": "INVALID_OTP",
                "message": "The entered PIN does not match the active custody lock.",
                "lock_id": target_lock_id,
                "stock_id": stock_id,
            }


# Global instances
FCM_ENGINE = FirebaseFCMEngine()
OTP_MANAGER = OTPVerificationManager(FCM_ENGINE)
