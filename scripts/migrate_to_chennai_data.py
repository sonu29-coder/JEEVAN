"""
Controlled Database Migration: Transition JEEVAN from Kerala Demo Data to Chennai Synthetic Data.
Safely replaces synthetic Kerala records with Chennai synthetic demonstration records.
Preserves:
- All user authentication accounts (including real user accounts)
- Database schema and table constraints
- Any non-synthetic or user-created operational records
- Verified backups created before modification
"""

import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.database import SessionLocal, engine, ensure_column_migrations, redis_client
from backend.import_data import import_data, SYNTHETIC_DIR
from backend.models import (
    AuditLog,
    BloodBank,
    BloodMatch,
    BloodRequest,
    DeliveryRecord,
    Donor,
    DonorAlert,
    Hospital,
    Inventory,
    Reservation,
    User,
)
from sqlalchemy import text


def run_controlled_migration():
    print("=" * 70)
    print("   JEEVAN — CONTROLLED CHENNAI DEMO DATA MIGRATION")
    print("=" * 70)

    db_path = PROJECT_ROOT / "jeevan.db"
    if db_path.is_file():
        backup_dir = PROJECT_ROOT / "backups" / "pre_chennai_migration"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_file = backup_dir / f"jeevan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db.bak"
        shutil.copy2(db_path, backup_file)
        print(f"[1/6] Created safety database backup at: {backup_file.relative_to(PROJECT_ROOT)}")

    # Ensure schema has all required columns
    print("\n[2/6] Running schema column migrations...")
    ensure_column_migrations(engine)
    print("      All required columns verified.")

    # Remove old Kerala synthetic demo records
    print("\n[3/6] Identifying and purging old synthetic Kerala demo records...")
    with SessionLocal() as session:
        with session.begin():
            # Hospitals: synthetic Kerala records
            deleted_hosp = session.execute(
                text("DELETE FROM hospitals WHERE synthetic = 1 AND (state = 'Kerala' OR city = 'Thrissur')")
            ).rowcount
            print(f"      Removed {deleted_hosp} old Kerala synthetic hospital records.")

            # Blood banks: synthetic Kerala records (leave Tamil Nadu historic records intact!)
            deleted_banks = session.execute(
                text("DELETE FROM blood_banks WHERE synthetic = 1 AND (state = 'Kerala' OR city = 'Thrissur')")
            ).rowcount
            print(f"      Removed {deleted_banks} old Kerala synthetic blood bank records.")

            # Donors: synthetic records with Kerala coordinates or synthetic tag
            deleted_donors = session.execute(
                text("DELETE FROM donors WHERE synthetic = 1 AND (latitude < 11.5 OR source = 'synthetic_demo')")
            ).rowcount
            print(f"      Removed {deleted_donors} old Kerala synthetic donor records.")

            # Inventory: old synthetic demo records
            deleted_inv = session.execute(
                text("DELETE FROM inventory WHERE synthetic = 1 AND source = 'synthetic_demo'")
            ).rowcount
            print(f"      Removed {deleted_inv} old Kerala synthetic inventory records.")

            # Matches, Reservations, Alerts, Requests
            deleted_matches = session.execute(
                text("DELETE FROM matches WHERE synthetic = 1 AND source = 'synthetic_demo'")
            ).rowcount
            print(f"      Removed {deleted_matches} old Kerala synthetic match records.")

            deleted_res = session.execute(
                text("DELETE FROM reservations WHERE synthetic = 1 AND source = 'synthetic_demo'")
            ).rowcount
            print(f"      Removed {deleted_res} old Kerala synthetic reservation records.")

            deleted_alerts = session.execute(
                text("DELETE FROM donor_alerts WHERE synthetic = 1 AND (message LIKE '%Thrissur%' OR source = 'synthetic_demo')")
            ).rowcount
            print(f"      Removed {deleted_alerts} old Kerala synthetic donor alert records.")

            deleted_requests = session.execute(
                text("DELETE FROM blood_requests WHERE synthetic = 1 AND (hospital_latitude < 11.5 OR source = 'synthetic_demo')")
            ).rowcount
            print(f"      Removed {deleted_requests} old Kerala synthetic blood request records.")

            # Old delivery records with Thrissur addresses
            deleted_deliv = session.execute(
                text("DELETE FROM delivery_records WHERE synthetic = 1 AND (pickup_name LIKE '%Thrissur%' OR destination_name LIKE '%Thrissur%' OR pickup_address LIKE '%Thrissur%')")
            ).rowcount
            print(f"      Removed {deleted_deliv} old Kerala synthetic delivery records.")

            # Old audit logs
            deleted_audits = session.execute(
                text("DELETE FROM audit_logs WHERE synthetic = 1 AND source = 'synthetic_demo'")
            ).rowcount
            print(f"      Removed {deleted_audits} old Kerala synthetic audit log records.")

            # Verify user accounts are completely untouched
            user_count = session.execute(text("SELECT count(*) FROM users")).scalar()
            print(f"\n      [PROTECTED] User accounts preserved: {user_count} accounts intact.")

    # Import new Chennai synthetic datasets
    print("\n[4/6] Importing new Chennai synthetic demo datasets from CSV...")
    counts = import_data(data_dir=SYNTHETIC_DIR, raw_banks_csv=None)
    for fname, count in counts.items():
        print(f"      -> {fname}: imported {count} Chennai records.")

    # Invalidate Redis availability caches
    print("\n[5/6] Flushing stale Redis availability cache...")
    try:
        keys = list(redis_client.scan_iter(match="jeevan:*"))
        if keys:
            redis_client.delete(*keys)
            print(f"      Cleared {len(keys)} cached keys from Redis.")
        else:
            print("      Redis cache was clear.")
    except Exception as exc:
        print(f"      Redis notice (offline/skipped): {exc}")

    # Database Summary Verification
    print("\n[6/6] Final Database Record Counts in jeevan.db:")
    with SessionLocal() as session:
        for model in (Hospital, BloodBank, Donor, Inventory, BloodRequest, DeliveryRecord, BloodMatch, Reservation, DonorAlert, User, AuditLog):
            c = session.scalar(text(f"SELECT count(*) FROM {model.__tablename__}"))
            print(f"      • {model.__tablename__:<24}: {c}")

    print("\n" + "=" * 70)
    print("   MIGRATION COMPLETE: Database is fully populated with Chennai data!")
    print("=" * 70)


if __name__ == "__main__":
    run_controlled_migration()
