from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(254))
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="manual", nullable=False)


class BloodBank(Base):
    __tablename__ = "blood_banks"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(254))
    licence_number: Mapped[str | None] = mapped_column(String(80))
    licence_issued: Mapped[date | None] = mapped_column(Date)
    licence_valid_until: Mapped[date | None] = mapped_column(Date)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="manual", nullable=False)


class Donor(Base):
    __tablename__ = "donors"
    __table_args__ = (Index("ix_donors_blood_group_eligible", "blood_group", "eligible"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    donor_code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    blood_group: Mapped[str] = mapped_column(String(3), nullable=False)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    email: Mapped[str | None] = mapped_column(String(254))
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    last_donation_date: Mapped[date | None] = mapped_column(Date)
    donation_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    response_rate: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    eligible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="manual", nullable=False)


class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (
        Index("ix_inventory_group_component_status", "blood_group", "component", "status"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    blood_bank_id: Mapped[str] = mapped_column(
        ForeignKey("blood_banks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    blood_group: Mapped[str] = mapped_column(String(3), nullable=False)
    component: Mapped[str] = mapped_column(String(40), nullable=False)
    units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="available")
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="manual", nullable=False)


class BloodRequest(Base):
    __tablename__ = "blood_requests"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    request_code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    hospital_id: Mapped[str | None] = mapped_column(ForeignKey("hospitals.id"))
    hospital_name: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    patient_blood_group: Mapped[str] = mapped_column(String(3), nullable=False)
    component: Mapped[str] = mapped_column(String(40), nullable=False)
    units_required: Mapped[int] = mapped_column(Integer, nullable=False)
    urgency: Mapped[str] = mapped_column(String(16), nullable=False, default="normal")
    hospital_latitude: Mapped[float] = mapped_column(Float, nullable=False)
    hospital_longitude: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="api", nullable=False)


class BloodMatch(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    request_id: Mapped[str] = mapped_column(
        ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    blood_bank_id: Mapped[str | None] = mapped_column(ForeignKey("blood_banks.id"))
    donor_id: Mapped[str | None] = mapped_column(ForeignKey("donors.id"))
    score: Mapped[float] = mapped_column(Float, nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    units_available: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="suggested")
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="api", nullable=False)


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    request_id: Mapped[str] = mapped_column(
        ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    inventory_id: Mapped[str] = mapped_column(
        ForeignKey("inventory.id"), nullable=False, index=True
    )
    units_reserved: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="api", nullable=False)


class DonorAlert(Base):
    __tablename__ = "donor_alerts"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    donor_id: Mapped[str] = mapped_column(
        ForeignKey("donors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    request_id: Mapped[str] = mapped_column(
        ForeignKey("blood_requests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    delivery_status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="api", nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    details: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="api", nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False, default="donor")  # admin, hospital, blood_bank, donor
    entity_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    phone_number: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(80), default="api", nullable=False)


class DonorIdentityVerification(Base):
    __tablename__ = "donor_identity_verifications"
    __table_args__ = (
        CheckConstraint(
            "verification_status IN ('pending', 'verified', 'failed')",
            name="ck_donor_identity_verification_status",
        ),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    verification_status: Mapped[str] = mapped_column(String(16), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_reference: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PhoneVerification(Base):
    __tablename__ = "phone_verifications"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    phone_number: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    otp_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    otp_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    last_otp_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    send_count_hour: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_token: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
