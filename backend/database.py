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
    socket_connect_timeout=2,
    socket_timeout=2,
)


class Base(DeclarativeBase):
    pass
