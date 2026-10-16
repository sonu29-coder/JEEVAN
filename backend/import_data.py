import argparse
import csv
import re
from datetime import date, datetime, time, timezone
from pathlib import Path

from sqlalchemy import inspect
from backend.database import Base, SessionLocal, engine, ensure_column_migrations
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
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_DIR = PROJECT_ROOT / "data" / "synthetic"
RAW_BANKS_CSV = PROJECT_ROOT / "data" / "raw" / "private_bloodbanks_0.csv"
POSTAL_CITY = re.compile(
    r"([A-Za-z][A-Za-z .'-]{1,50}?)\s*[-,]\s*\d{3}\s?\d{3}"
)


def parse_date(value: str | None, formats: tuple[str, ...] = ("%Y-%m-%d",)) -> date | None:
    if not value or not value.strip():
        return None
    normalized = value.strip()
    for date_format in formats:
        try:
            return datetime.strptime(normalized, date_format).date()
        except ValueError:
            continue
    return None


def parse_datetime(value: str, *, end_of_day: bool = False) -> datetime | None:
    if not value or not str(value).strip():
        return None
    val_str = str(value).strip()
    try:
        return datetime.fromisoformat(val_str.replace("Z", "+00:00"))
    except Exception:
        pass
    parsed = parse_date(val_str)
    if parsed is not None:
        moment = time.max if end_of_day else time.min
        return datetime.combine(parsed, moment, tzinfo=timezone.utc)
    return None


def parse_bool(value: str | bool | None, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None or not str(value).strip():
        return default
    return str(value).strip().casefold() in {"true", "1", "yes", "y"}


def read_csv(path: Path, encoding: str = "utf-8-sig") -> list[dict[str, str]]:
    with path.open("r", encoding=encoding, newline="") as csv_file:
        return list(csv.DictReader(csv_file))


def remap(row: dict[str, str], key_map: dict[str, str]) -> dict[str, str]:
    return {key_map.get(key, key): value for key, value in row.items()}


def synthetic_records(data_dir: Path) -> list[tuple[str, type, dict[str, str]]]:
    files = [
        ("hospitals.csv", Hospital, {"hospital_id": "id", "hospital_name": "name"}),
        ("blood_banks.csv", BloodBank, {"blood_bank_id": "id", "blood_bank_name": "name"}),
        ("donors.csv", Donor, {"donor_id": "id"}),
        ("inventory.csv", Inventory, {"inventory_id": "id"}),
        ("requests.csv", BloodRequest, {"request_id": "id"}),
        ("deliveries.csv", DeliveryRecord, {"delivery_id": "id"}),
        ("matches.csv", BloodMatch, {"match_id": "id", "request_id": "request_id"}),
        ("reservations.csv", Reservation, {"reservation_id": "id", "request_id": "request_id", "inventory_id": "inventory_id"}),
        ("donor_alerts.csv", DonorAlert, {"alert_id": "id", "donor_id": "donor_id", "request_id": "request_id"}),
        ("audit_logs.csv", AuditLog, {"audit_id": "id"}),
    ]
    for file_name, model, key_map in files:
        path = data_dir / file_name
        if not path.is_file():
            raise FileNotFoundError(f"Required generated data file not found: {path}")
        
        valid_columns = {c.key for c in inspect(model).mapper.column_attrs}
        for source in read_csv(path):
            row = remap(source, key_map)
            row.pop("synthetic_location", None)
            row["synthetic"] = parse_bool(row.get("synthetic"), default=True)
            if row.get("source"):
                row["source"] = str(row["source"]).strip()
            
            float_fields = (
                "latitude", "longitude", "hospital_latitude", "hospital_longitude",
                "response_rate", "score", "distance_km", "estimated_distance_km",
                "estimated_delivery_minutes", "cold_chain_temp",
            )
            for field in float_fields:
                if field in row:
                    row[field] = float(row[field]) if row[field] not in (None, "") else None

            int_fields = (
                "units", "units_required", "units_reserved", "donation_count",
                "units_available", "age", "donation_history_count",
            )
            for field in int_fields:
                if field in row:
                    row[field] = int(row[field]) if row[field] not in (None, "") else None

            for field in ("eligible", "phone_verified"):
                if field in row:
                    row[field] = parse_bool(row[field])

            for field in ("expiry_date", "last_donation_date", "licence_issued", "licence_valid_until"):
                if field in row:
                    row[field] = parse_date(row[field])

            dt_fields = (
                "created_at", "sent_at", "approved_at", "dispatched_at", "delivered_at",
                "pickup_timestamp", "dispatch_timestamp", "arrival_timestamp",
                "picked_up_at", "last_inventory_update",
            )
            for field in dt_fields:
                if field in row:
                    row[field] = parse_datetime(row[field])

            if "expires_at" in row:
                row["expires_at"] = parse_datetime(row["expires_at"], end_of_day=True)

            if model is DonorAlert:
                row["delivery_status"] = "published" if row.get("status") in ("sent", "acknowledged") else "pending"
                if "sent_at" in source:
                    row["sent_at"] = parse_datetime(source.get("sent_at", ""))

            if model is AuditLog:
                row["user_id"] = str(row["user_id"]) if row.get("user_id") else None
                row["entity_id"] = str(row["entity_id"])

            filtered_row = {k: v for k, v in row.items() if k in valid_columns}
            yield file_name, model, filtered_row


def licensed_bank_records(path: Path) -> list[dict]:
    records = []
    for row in read_csv(path, encoding="cp1252"):
        source_text = row.get("NAME OF THE BLOOD BANK", "").strip()
        if not source_text:
            continue
        lines = [line.strip() for line in source_text.splitlines() if line.strip()]
        name = lines[0].rstrip(" ,")[:240]
        city_matches = POSTAL_CITY.findall(source_text.replace("\n", " "))
        city = city_matches[-1].strip(" ,-") if city_matches else "Unknown"
        records.append(
            {
                "id": f"TN-{int(row['S. No']):04d}",
                "name": name,
                "address": " ".join(source_text.split()),
                "city": city,
                "state": "Tamil Nadu",
                "latitude": None,
                "longitude": None,
                "licence_number": row.get("LICENCE NUMBER", "").strip() or None,
                "licence_issued": parse_date(
                    row.get("DATED"),
                    formats=("%d.%m.%Y", "%Y-%m-%d"),
                ),
                "licence_valid_until": parse_date(
                    row.get("VALID UP TO"),
                    formats=("%d.%m.%Y", "%Y-%m-%d"),
                ),
                "synthetic": False,
                "source": path.name,
            }
        )
    return records


def import_data(
    data_dir: Path = SYNTHETIC_DIR,
    raw_banks_csv: Path | None = RAW_BANKS_CSV,
) -> dict[str, int]:
    Base.metadata.create_all(bind=engine)
    ensure_column_migrations(engine)
    counts: dict[str, int] = {}
    with SessionLocal() as session:
        with session.begin():
            current_file = None
            for file_name, model, row in synthetic_records(data_dir):
                if current_file is not None and file_name != current_file:
                    session.flush()
                current_file = file_name
                session.merge(model(**row))
                counts[file_name] = counts.get(file_name, 0) + 1
            session.flush()
            if raw_banks_csv is not None and raw_banks_csv.is_file():
                legacy_records = licensed_bank_records(raw_banks_csv)
                for record in legacy_records:
                    session.merge(BloodBank(**record))
                counts[raw_banks_csv.name] = len(legacy_records)
                session.flush()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Idempotently import JEEVAN CSV files into PostgreSQL."
    )
    parser.add_argument(
        "--synthetic-dir",
        type=Path,
        default=SYNTHETIC_DIR,
        help="Directory containing the generated JEEVAN CSV files",
    )
    parser.add_argument(
        "--raw-banks-csv",
        type=Path,
        default=RAW_BANKS_CSV,
        help="Historic licensed blood-bank directory CSV (use --skip-raw-banks to omit)",
    )
    parser.add_argument(
        "--skip-raw-banks",
        action="store_true",
        help="Skip importing the legacy licensed blood-bank directory",
    )
    args = parser.parse_args()
    counts = import_data(
        data_dir=args.synthetic_dir,
        raw_banks_csv=None if args.skip_raw_banks else args.raw_banks_csv,
    )
    for file_name, count in counts.items():
        print(f"{file_name}: imported {count} record(s)")
    print("Import complete. Re-running this command updates existing CSV IDs.")


if __name__ == "__main__":
    main()
