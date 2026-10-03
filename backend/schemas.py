"""
HEMO-GRID AI - Pydantic Schemas & DTOs
Strictly aligned with Next.js frontend interfaces and TypeScript contracts.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, populate_by_name=True)


# ==========================================
# 1. Authentication & Security Schemas
# ==========================================

class UserRole(str, Enum):
    ADMIN = "ADMIN"
    ICU_HOSPITAL = "ICU_HOSPITAL"
    HOSPITAL = "HOSPITAL"
    DONOR = "DONOR"
    REGISTERED_DONOR = "REGISTERED_DONOR"
    DELIVERY_PARTNER = "DELIVERY_PARTNER"
    BLOOD_BANK = "BLOOD_BANK"


class LoginRequest(APIModel):
    username_or_token: Optional[str] = Field(default=None, description="Email, username or frontend demo token (e.g. HOSP-9042)")
    password: Optional[str] = Field(default=None, description="Password (verified with bcrypt for DB users)")
    role: Optional[UserRole] = Field(default=None, description="Role to assume: ADMIN, ICU_HOSPITAL, DONOR, DELIVERY_PARTNER, BLOOD_BANK")


class PhoneSendOtpRequest(APIModel):
    phone_number: str = Field(description="Indian mobile number (e.g. +91XXXXXXXXXX, 9876543210)")


class PhoneSendOtpResponse(APIModel):
    success: bool = True
    message: str
    phone_number: str
    formatted_phone: str
    expires_in_seconds: int = 300
    cooldown_seconds: int = 60
    provider: str
    demo_otp: Optional[str] = Field(default=None, description="Demo OTP provided when running in demo mode")
    gateway_notice: Optional[str] = Field(default=None, description="Notice if SMS gateway reported a non-fatal error")



class PhoneVerifyOtpRequest(APIModel):
    phone_number: str = Field(description="Indian mobile number (e.g. +91XXXXXXXXXX, 9876543210)")
    otp: str = Field(min_length=4, max_length=8, description="Verification OTP received via SMS")


class PhoneVerifyOtpResponse(APIModel):
    success: bool = True
    verified: bool = True
    phone_number: str
    verification_token: Optional[str] = None
    message: str


class RegisterRequest(APIModel):
    email: str = Field(min_length=5, max_length=254, description="User email address")
    password: str = Field(min_length=6, max_length=128, description="User password (min 6 chars)")
    name: str = Field(min_length=2, max_length=200, description="Full name or entity name")
    phone_number: Optional[str] = Field(default=None, description="Verified donor mobile number (e.g. +91XXXXXXXXXX)")
    verification_token: Optional[str] = Field(default=None, description="Verification token from /api/auth/verify-otp")
    blood_group: Optional[str] = Field(default="O+", description="Donor blood group (A+, B+, O+, AB+, etc.)")
    role: Optional[str] = Field(default="donor", description="Role: admin, hospital, blood_bank, donor, delivery_partner")
    entity_id: Optional[str] = Field(default=None, description="Associated hospital or blood bank ID")


class RegisterResponse(APIModel):
    id: str
    email: str
    name: str
    role: str
    phone_number: Optional[str] = None
    phone_verified: bool = False
    entity_id: Optional[str] = None
    access_token: str
    token_type: str = "bearer"
    message: str


class UserResponse(APIModel):
    id: str
    email: str
    name: str
    role: str
    phone_number: Optional[str] = None
    phone_verified: bool = False
    entity_id: Optional[str] = None
    is_active: bool
    synthetic: bool
    created_at: Optional[datetime] = None


class TokenResponse(APIModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    label: str
    badge: str
    expires_in_seconds: int = 86400


class UserPayload(APIModel):
    user_id: str
    role: str
    label: Optional[str] = None
    exp: Optional[int] = None


class PortalProbeRequest(APIModel):
    portal: Optional[str] = None


class PortalProbeResponse(APIModel):
    granted: bool
    role: str
    portal: str
    detail: Optional[str] = None


# ==========================================
# 2. GIS Routing Schemas
# ==========================================

class RouteTypeEnum(str, Enum):
    STANDARD = "STANDARD"
    GREEN_CORRIDOR = "GREEN_CORRIDOR"


class Coordinate(APIModel):
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)


class RouteOptimizeRequest(APIModel):
    origin: Optional[Union[str, Coordinate, List[float]]] = Field(
        default=None,
        description="Origin node ID (e.g. 'bank-ima') or coordinate {lat, lng} or [lat, lng]"
    )
    destination: Optional[Union[str, Coordinate, List[float]]] = Field(
        default=None,
        description="Destination node ID (e.g. 'icu-elite') or coordinate {lat, lng} or [lat, lng]"
    )
    origin_id: Optional[str] = None
    destination_id: Optional[str] = None
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    dest_lat: Optional[float] = None
    dest_lng: Optional[float] = None
    route_type: RouteTypeEnum = Field(default=RouteTypeEnum.STANDARD)


class TurnByTurnStep(APIModel):
    node_id: str
    name: str
    instruction: str
    road_name: str
    distance_km: float
    segment_km: float
    eta_mins: float
    coordinates: List[float]


class RouteOptimizeResponse(APIModel):
    route_type: str
    algorithm: str
    origin_id: str
    destination_id: str
    total_distance_km: float
    distance_km: float
    eta_minutes: float
    eta_mins: float
    path: List[List[float]]
    node_ids: List[str]
    turn_by_turn: List[TurnByTurnStep]
    green_corridor_active: bool


# ==========================================
# 3. Blood Requests (ICU Hospital View)
# ==========================================

BloodGroupType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
ComponentType = Literal["Whole Blood", "PRBC", "Platelets", "RBC", "Plasma"]
UrgencyLevelType = Literal["CRITICAL", "HIGH", "ROUTINE", "normal", "urgent", "critical"]
RequestStatusType = Literal["PENDING", "RESERVED", "DISPATCHED", "DELIVERED", "pending", "matched", "fulfilled", "cancelled"]


class DispatchPayload(APIModel):
    """Payload sent by Next.js dispatch-view.tsx to /api/request-blood"""
    icu_id: str
    blood_group: BloodGroupType
    component_type: ComponentType
    urgency: UrgencyLevelType
    units: int = Field(ge=1, le=100)
    location: Optional[Coordinate] = None


class DispatchResponse(APIModel):
    """Response expected by Next.js dispatch-view.tsx"""
    request_id: str
    status: str
    matched_donors: int
    eta_minutes: int


class ICUHospitalBloodRequest(APIModel):
    """Schema for ICU Hospital View of blood requests"""
    id: str
    hospital_name: str
    blood_type: str
    units: int
    urgency_level: str
    status: Literal["PENDING", "RESERVED", "DISPATCHED", "DELIVERED"]
    created_at: Optional[datetime] = None
    eta_minutes: Optional[int] = None


class ReservePayload(APIModel):
    """Payload sent by Next.js stock-view.tsx to /api/reserve-stock"""
    stock_id: str
    bank_id: str
    icu_id: str
    blood_group: str
    component_type: str
    units: int = 1


class ReserveResponse(APIModel):
    """Response expected by Next.js stock-view.tsx"""
    lock_id: str
    expires_in: int = 900  # 15 minutes


class ReserveConflictResponse(APIModel):
    detail: str
    locked_until: Optional[int] = None


# ==========================================
# 4. Donor Management (Donor View)
# ==========================================

class DonorManagementItem(APIModel):
    """
    Schema required for Donor Management (Donor View):
    donor_id, distance_km, last_donated_days, cooldown_active (boolean),
    anti_fatigue_eligible (boolean based on 48h alert cap & 90-day cooldown).
    """
    donor_id: str
    name: Optional[str] = None
    blood_group: str
    distance_km: float
    last_donated_days: int
    cooldown_active: bool
    anti_fatigue_eligible: bool
    alerts_in_last_48h: int = 0
    phone: Optional[str] = None


# ==========================================
# 5. Delivery & OTP Handshake (Courier View)
# ==========================================

class VerifyOtpPayload(APIModel):
    """Payload sent by Next.js otp-view.tsx to /api/verify-otp"""
    lock_id: Optional[str] = None
    stock_id: str
    otp: str


class VerifyOtpResponse(APIModel):
    """Response expected by Next.js otp-view.tsx"""
    status: Optional[str] = "VERIFIED"
    detail: Optional[str] = "Handshake verified successfully. Blood units released."


class DispatchDeliveryItem(APIModel):
    """
    Schema required for Delivery & OTP Handshake (Courier View):
    dispatch_id, courier_id, pickup_otp, delivery_otp,
    cold_chain_temp (defaulting within 2.0°C - 6.0°C range).
    """
    dispatch_id: str
    courier_id: str
    pickup_otp: str
    delivery_otp: str
    cold_chain_temp: float = Field(default=3.8, ge=2.0, le=6.0)
    stock_id: Optional[str] = None
    bank_id: Optional[str] = None
    icu_id: Optional[str] = None
    blood_group: Optional[str] = None
    component_type: Optional[str] = None
    status: str = "IN_TRANSIT"
    locked_until: Optional[int] = None


# ==========================================
# 6. Inventory & Donor CRUD Schemas
# ==========================================

class InventoryCreate(APIModel):
    blood_bank_id: str
    blood_group: str = Field(min_length=2, max_length=3)
    component: str = Field(min_length=2, max_length=80)
    units: int = Field(ge=0, le=1000)
    expiry_date: str = Field(description="YYYY-MM-DD format")
    status: Optional[str] = Field(default="available")


class InventoryUpdate(APIModel):
    units: Optional[int] = Field(default=None, ge=0, le=1000)
    expiry_date: Optional[str] = Field(default=None, description="YYYY-MM-DD format")
    status: Optional[str] = Field(default=None, description="available, quarantined, discarded, expired")


class InventoryItemResponse(APIModel):
    id: str
    blood_bank_id: str
    blood_bank_name: Optional[str] = None
    blood_group: str
    component: str
    units: int
    available_units: int
    reserved_units: int
    expiry_date: str
    status: str
    is_low_stock: bool
    is_expired: bool
    synthetic: bool


class DonorProfileUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    blood_group: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    eligible: Optional[bool] = None


# ==========================================
# Blood Expiry Radar & Clinical Prioritization
# ==========================================

class ClinicalRuleAlert(APIModel):
    rule_id: str
    title: str
    severity: str = Field(description="'critical', 'warning', or 'info'")
    description: str
    clinical_action: str
    badge: str


class ExpiryRadarItem(APIModel):
    id: str
    blood_bank_id: str
    blood_bank_name: str
    blood_group: str
    component: str
    units: int
    available_units: int
    reserved_units: int
    expiry_date: str
    days_remaining: int
    hours_remaining: int
    urgency_tier: str = Field(description="'CRITICAL', 'WARNING', 'MONITORING', 'SAFE', 'EXPIRED'")
    fefo_priority_rank: int
    pediatric_safe: bool
    trauma_candidate: bool
    clinical_rules: list[ClinicalRuleAlert]
    suggested_action: str
    recommended_transfer_target_id: Optional[str] = None
    recommended_transfer_target_name: Optional[str] = None
    prioritized: bool = False
    priority_reason: Optional[str] = None
    synthetic: bool = False


class ExpiryRadarSummary(APIModel):
    total_units: int
    critical_units: int
    warning_units: int
    safe_units: int
    expired_units: int
    fefo_candidates_count: int
    potential_wastage_units: int
    adherence_rate_pct: float


class ExpiryRadarResponse(APIModel):
    summary: ExpiryRadarSummary
    items: list[ExpiryRadarItem]
    clinical_protocols: list[dict]


class PrioritizeUnitRequest(APIModel):
    reason: Optional[str] = Field(default="FEFO Surgical Queue Priority")
    clinical_case: Optional[str] = Field(default="Elective Surgery / Immediate Trauma")


class RedistributeUnitRequest(APIModel):
    target_bank_id: str
    courier_notes: Optional[str] = Field(default=None)

