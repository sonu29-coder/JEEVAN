import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from redis import Redis
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
for env_path in (
    PROJECT_ROOT / ".env.local",
    PROJECT_ROOT / ".env",
    Path(__file__).resolve().parent / ".env",
    Path(__file__).resolve().parent / ".env" / ".env",
):
    if env_path.is_file():
        load_dotenv(env_path, override=False)

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
if not DATABASE_URL:
    DATABASE_URL = "postgresql+psycopg://jeevan:jeevan@localhost:5432/jeevan"
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql+psycopg2://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("sqlite:///./"):
    rel_path = DATABASE_URL[len("sqlite:///./"):]
    DATABASE_URL = f"sqlite:///{(PROJECT_ROOT / rel_path).resolve().as_posix()}"


engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite://"):
    engine_options["connect_args"] = {"check_same_thread": False}
    if DATABASE_URL in {"sqlite://", "sqlite:///:memory:"}:
        engine_options["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

raw_redis_url = os.getenv("REDIS_URL", "").strip()
if not raw_redis_url or raw_redis_url.lower() in {"none", "disabled", "false"}:
    raw_redis_url = "redis://localhost:6379/0"

redis_client = Redis.from_url(
    raw_redis_url,
    decode_responses=True,
    socket_connect_timeout=0.2,
    socket_timeout=0.2,
)


class Base(DeclarativeBase):
    pass


def ensure_column_migrations(target_engine=None):
    """Safely adds missing columns to existing SQLite / PostgreSQL tables without dropping data."""
    from sqlalchemy import inspect, text
    eng = target_engine or engine
    is_sqlite = eng.dialect.name == "sqlite"
    bool_default = "0" if is_sqlite else "FALSE"
    dt_type = "DATETIME" if is_sqlite else "TIMESTAMP"

    try:
        with eng.begin() as conn:
            inspector = inspect(conn)
            tables = set(inspector.get_table_names())
            if "users" in tables:
                user_cols = {c["name"] for c in inspector.get_columns("users")}
                if "phone_number" not in user_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN phone_number VARCHAR(40)"))
                if "phone_verified" not in user_cols:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT {bool_default}"))

            if "hospitals" in tables:
                hosp_cols = {c["name"] for c in inspector.get_columns("hospitals")}
                if "facility_type" not in hosp_cols:
                    conn.execute(text("ALTER TABLE hospitals ADD COLUMN facility_type VARCHAR(80)"))
                if "area" not in hosp_cols:
                    conn.execute(text("ALTER TABLE hospitals ADD COLUMN area VARCHAR(120)"))
                if "pincode" not in hosp_cols:
                    conn.execute(text("ALTER TABLE hospitals ADD COLUMN pincode VARCHAR(20)"))
                if "available_blood_groups" not in hosp_cols:
                    conn.execute(text("ALTER TABLE hospitals ADD COLUMN available_blood_groups TEXT"))
                if "available_units_by_blood_group" not in hosp_cols:
                    conn.execute(text("ALTER TABLE hospitals ADD COLUMN available_units_by_blood_group TEXT"))
                if "emergency_contact_demo" not in hosp_cols:
                    conn.execute(text("ALTER TABLE hospitals ADD COLUMN emergency_contact_demo VARCHAR(60)"))
                if "operating_status" not in hosp_cols:
                    conn.execute(text("ALTER TABLE hospitals ADD COLUMN operating_status VARCHAR(60)"))
                if "last_inventory_update" not in hosp_cols:
                    conn.execute(text(f"ALTER TABLE hospitals ADD COLUMN last_inventory_update {dt_type}"))

            if "blood_banks" in tables:
                bank_cols = {c["name"] for c in inspector.get_columns("blood_banks")}
                if "area" not in bank_cols:
                    conn.execute(text("ALTER TABLE blood_banks ADD COLUMN area VARCHAR(120)"))

            if "donors" in tables:
                donor_cols = {c["name"] for c in inspector.get_columns("donors")}
                if "phone_verified" not in donor_cols:
                    conn.execute(text(f"ALTER TABLE donors ADD COLUMN phone_verified BOOLEAN DEFAULT {bool_default}"))
                if "age" not in donor_cols:
                    conn.execute(text("ALTER TABLE donors ADD COLUMN age INTEGER"))
                if "gender" not in donor_cols:
                    conn.execute(text("ALTER TABLE donors ADD COLUMN gender VARCHAR(20)"))
                if "city" not in donor_cols:
                    conn.execute(text("ALTER TABLE donors ADD COLUMN city VARCHAR(120)"))
                if "area" not in donor_cols:
                    conn.execute(text("ALTER TABLE donors ADD COLUMN area VARCHAR(120)"))
                if "availability_status" not in donor_cols:
                    conn.execute(text("ALTER TABLE donors ADD COLUMN availability_status VARCHAR(40)"))
                if "contact_verification_status" not in donor_cols:
                    conn.execute(text("ALTER TABLE donors ADD COLUMN contact_verification_status VARCHAR(40)"))
                if "consent_status" not in donor_cols:
                    conn.execute(text("ALTER TABLE donors ADD COLUMN consent_status VARCHAR(60)"))

            if "blood_requests" in tables:
                req_cols = {c["name"] for c in inspector.get_columns("blood_requests")}
                if not is_sqlite:
                    conn.execute(text("ALTER TABLE blood_requests ALTER COLUMN patient_blood_group TYPE VARCHAR(20)"))
                if "department" not in req_cols:
                    conn.execute(text("ALTER TABLE blood_requests ADD COLUMN department VARCHAR(100)"))
                if "patient_identifier" not in req_cols:
                    conn.execute(text("ALTER TABLE blood_requests ADD COLUMN patient_identifier VARCHAR(100)"))
                if "priority" not in req_cols:
                    conn.execute(text("ALTER TABLE blood_requests ADD COLUMN priority VARCHAR(20)"))
                if "assigned_delivery_id" not in req_cols:
                    conn.execute(text("ALTER TABLE blood_requests ADD COLUMN assigned_delivery_id VARCHAR(40)"))
                if "approved_at" not in req_cols:
                    conn.execute(text(f"ALTER TABLE blood_requests ADD COLUMN approved_at {dt_type}"))
                if "dispatched_at" not in req_cols:
                    conn.execute(text(f"ALTER TABLE blood_requests ADD COLUMN dispatched_at {dt_type}"))
                if "delivered_at" not in req_cols:
                    conn.execute(text(f"ALTER TABLE blood_requests ADD COLUMN delivered_at {dt_type}"))

            if "delivery_records" in tables:
                deliv_cols = {c["name"] for c in inspector.get_columns("delivery_records")}
                if "source_facility_id" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN source_facility_id VARCHAR(40)"))
                if "destination_facility_id" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN destination_facility_id VARCHAR(40)"))
                if "priority" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN priority VARCHAR(20)"))
                if "pickup_area" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN pickup_area VARCHAR(120)"))
                if "destination_area" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN destination_area VARCHAR(120)"))
                if "estimated_distance_km" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN estimated_distance_km FLOAT"))
                if "estimated_delivery_minutes" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN estimated_delivery_minutes FLOAT"))
                if "vehicle_type" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN vehicle_type VARCHAR(60)"))
                if "dispatch_timestamp" not in deliv_cols:
                    conn.execute(text(f"ALTER TABLE delivery_records ADD COLUMN dispatch_timestamp {dt_type}"))
                if "arrival_timestamp" not in deliv_cols:
                    conn.execute(text(f"ALTER TABLE delivery_records ADD COLUMN arrival_timestamp {dt_type}"))
                if "proof_of_handover_status" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN proof_of_handover_status VARCHAR(40)"))
                if "data_source" not in deliv_cols:
                    conn.execute(text("ALTER TABLE delivery_records ADD COLUMN data_source VARCHAR(80)"))
    except Exception as exc:
        logger.warning("Column migration check notice: %s", exc)


