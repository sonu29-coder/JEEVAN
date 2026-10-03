"""
HEMO-GRID AI / JEEVAN - Real Fast2SMS OTP API Provider
Integrates the official Fast2SMS no-DLT OTP SMS Route:
  POST https://www.fast2sms.com/dev/bulkV2 (route="otp", variables_values="<6-digit-otp>")

Configured via environment variables:
  FAST2SMS_API_KEY : Fast2SMS Authorization Key (from Dev API)
  FAST2SMS_ROUTE   : "otp" (default no-DLT route) or "q" (Quick SMS)

SECURITY:
- Never log, display, or return the actual OTP.
- OTPs are cryptographically generated and HMAC-hashed on the backend.
- Fast2SMS API key is strictly backend-only.
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger("jeevan.sms")


@dataclass
class SMSDeliveryResult:
    success: bool
    provider: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    status_code: Optional[int] = None


@dataclass
class SMSVerifyResult:
    success: bool
    provider: str
    message: Optional[str] = None
    error: Optional[str] = None
    status_code: Optional[int] = None


class SMSConfigurationError(Exception):
    """Raised when an SMS provider lacks required environment credentials."""

    def __init__(self, provider: str, missing_keys: List[str]):
        self.provider = provider
        self.missing_keys = missing_keys
        super().__init__(
            f"Fast2SMS Provider is not configured. Missing environment variables: {', '.join(missing_keys)}"
        )


class BaseSMSProvider(ABC):
    name: str = "base"
    has_remote_verify: bool = False

    @abstractmethod
    def validate_configuration(self) -> Tuple[bool, List[str]]:
        """Returns (is_configured, missing_keys)."""
        pass

    @abstractmethod
    def send_otp(self, phone_number: str, otp: str = "") -> SMSDeliveryResult:
        """Dispatches real OTP via provider."""
        pass

    def verify_otp(self, phone_number: str, otp: str) -> SMSVerifyResult:
        """Verifies OTP with provider if supported."""
        return SMSVerifyResult(
            success=False,
            provider=self.name,
            error="Remote OTP verification is not implemented for this provider.",
        )


class Fast2SMSProvider(BaseSMSProvider):
    """
    Official Fast2SMS Real SMS Provider:
    - Primary: Fast2SMS no-DLT OTP SMS route via POST https://www.fast2sms.com/dev/bulkV2 (route="otp")
    - Alternative: Quick SMS route (route="q") or Smart OTP
    """
    name = "fast2sms"
    has_remote_verify = False

    def __init__(
        self,
        api_key: Optional[str] = None,
        route: Optional[str] = None,
        otp_id: Optional[str] = None,
    ):
        self.api_key = (
            api_key
            or os.getenv("FAST2SMS_API_KEY", "")
            or os.getenv("SMS_PROVIDER_API_KEY", "")
        ).strip()
        self.route = (
            route
            or os.getenv("FAST2SMS_ROUTE", "")
            or "otp"
        ).strip().lower()
        self.otp_id = (
            otp_id
            or os.getenv("FAST2SMS_OTP_ID", "")
            or os.getenv("SMS_TEMPLATE_ID", "")
        ).strip()

    def validate_configuration(self) -> Tuple[bool, List[str]]:
        missing = []
        if not self.api_key:
            missing.append("FAST2SMS_API_KEY")
        return len(missing) == 0, missing

    def send_otp(self, phone_number: str, otp: str = "") -> SMSDeliveryResult:
        is_ok, missing = self.validate_configuration()
        if not is_ok:
            raise SMSConfigurationError(self.name, missing)

        clean_number = phone_number.replace("+91", "").replace("+", "").strip()
        masked_phone = f"+91 {clean_number[:3]}XXXX{clean_number[-3:]}" if len(clean_number) >= 6 else "+91 XXXX"
        logger.info("Dispatching real Fast2SMS SMS to %s via route '%s'", masked_phone, self.route)

        url = "https://www.fast2sms.com/dev/bulkV2"
        headers = {
            "authorization": self.api_key,
            "Content-Type": "application/json",
            "accept": "application/json",
        }

        if self.route == "q":
            payload = {
                "route": "q",
                "message": f"Your JEEVAN verification OTP is {otp}. Valid for 2 minutes.",
                "language": "english",
                "flash": 0,
                "numbers": clean_number,
            }
        else:
            # Official Fast2SMS no-DLT OTP SMS route
            payload = {
                "route": "otp",
                "variables_values": otp,
                "numbers": clean_number,
            }

        try:
            with httpx.Client(timeout=12.0) as client:
                resp = client.post(url, json=payload, headers=headers)
                data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}

                logger.info("Fast2SMS gateway returned HTTP %s", resp.status_code)

                if resp.status_code == 200 and data.get("return") is True:
                    req_id = data.get("request_id") or data.get("message")
                    return SMSDeliveryResult(
                        success=True,
                        provider=self.name,
                        message_id=str(req_id) if req_id else None,
                        status_code=resp.status_code,
                    )
                else:
                    err_msg = data.get("message") or f"Fast2SMS error HTTP {resp.status_code}"
                    logger.warning("Fast2SMS send OTP failed: %s", err_msg)
                    return SMSDeliveryResult(
                        success=False,
                        provider=self.name,
                        error=str(err_msg),
                        status_code=resp.status_code,
                    )
        except Exception as exc:
            logger.exception("Network exception contacting Fast2SMS /dev/bulkV2")
            return SMSDeliveryResult(
                success=False,
                provider=self.name,
                error=f"Connection to Fast2SMS failed: {str(exc)}",
            )


class TwoFactorProvider(BaseSMSProvider):
    """
    2Factor.in Real SMS OTP Provider (No DLT required for testing).
    Send OTP   : GET https://2factor.in/API/V1/{api_key}/SMS/{phone_number}/{otp}/OTP1
    """
    name = "2factor"
    has_remote_verify = False

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (
            api_key
            or os.getenv("TWOFACTOR_API_KEY", "")
            or os.getenv("SMS_PROVIDER_API_KEY", "")
        ).strip()

    def validate_configuration(self) -> Tuple[bool, List[str]]:
        if not self.api_key:
            return False, ["TWOFACTOR_API_KEY"]
        return True, []

    def send_otp(self, phone_number: str, otp: str = "") -> SMSDeliveryResult:
        is_ok, missing = self.validate_configuration()
        if not is_ok:
            raise SMSConfigurationError(self.name, missing)

        clean = phone_number.replace("+91", "").replace("+", "").strip()
        url = f"https://2factor.in/API/V1/{self.api_key}/SMS/{clean}/{otp}/OTP1"

        try:
            with httpx.Client(timeout=12.0) as client:
                resp = client.get(url)
                data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                if resp.status_code == 200 and data.get("Status") == "Success":
                    return SMSDeliveryResult(
                        success=True,
                        provider=self.name,
                        message_id=str(data.get("Details", "")),
                        status_code=resp.status_code,
                    )
                return SMSDeliveryResult(
                    success=False,
                    provider=self.name,
                    error=str(data.get("Details", f"2Factor Error HTTP {resp.status_code}")),
                    status_code=resp.status_code,
                )
        except Exception as exc:
            return SMSDeliveryResult(
                success=False,
                provider=self.name,
                error=f"Connection to 2Factor failed: {str(exc)}",
            )


class TestSMSProvider(BaseSMSProvider):
    """
    In-memory Test SMS Provider for automated unit testing (pytest).
    Activated ONLY when SMS_PROVIDER is set to 'test' or 'mock'.
    """
    __test__ = False
    name = "test"
    has_remote_verify = False
    _shared_otps: Dict[str, str] = {}

    def __init__(self):
        self.sent_otps = self._shared_otps
        self.sent_messages: List[dict] = []

    def validate_configuration(self) -> Tuple[bool, List[str]]:
        return True, []

    def send_otp(self, phone_number: str, otp: str = "") -> SMSDeliveryResult:
        clean = phone_number.replace("+91", "").replace("+", "").strip()
        self.sent_otps[clean] = otp
        self.sent_messages.append({"phone_number": phone_number, "otp": otp})
        return SMSDeliveryResult(
            success=True,
            provider="test",
            message_id="test-sms-req-001",
            status_code=200,
        )


def get_sms_provider() -> BaseSMSProvider:
    """
    Factory to return the active SMS Provider.
    Defaults to Fast2SMS dedicated OTP SMS.
    """
    provider_type = os.getenv("SMS_PROVIDER", "fast2sms").strip().lower()

    if provider_type in ("test", "mock"):
        return TestSMSProvider()
    if provider_type in ("2factor", "twofactor"):
        return TwoFactorProvider()
    return Fast2SMSProvider()
