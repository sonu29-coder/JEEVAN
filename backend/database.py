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

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://jeevan:jeevan@localhost:5432/jeevan",
)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite://"):
    engine_options["connect_args"] = {"check_same_thread": False}
    if DATABASE_URL in {"sqlite://", "sqlite:///:memory:"}:
        engine_options["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
redis_client = Redis.from_url(
    os.getenv("REDIS_URL", "redis://localhost:6379/0"),
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
            if "donors" in tables:
                donor_cols = {c["name"] for c in inspector.get_columns("donors")}
                if "phone_verified" not in donor_cols:
                    conn.execute(text(f"ALTER TABLE donors ADD COLUMN phone_verified BOOLEAN DEFAULT {bool_default}"))
    except Exception as exc:
        logger.warning("Column migration check notice: %s", exc)

