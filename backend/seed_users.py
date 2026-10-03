"""
Seed Default System Accounts for JEEVAN
Creates Administrator, Hospital Physician, Blood Bank Admin, Donor, and Logistics accounts.
Uses bcrypt password hashing and marks all demo accounts as synthetic.
"""

import sys
from uuid import uuid4
from sqlalchemy import select

from backend.auth import hash_password, normalize_role
from backend.database import SessionLocal
from backend.models import User

DEFAULT_USERS = [
    {
        "id": "usr-admin-01",
        "email": "admin@jeevan.org",
        "password": "AdminPassword2026!",
        "name": "Jeevan Grid Administrator",
        "role": "ADMIN",
        "entity_id": "hq-thrissur",
    },
    {
        "id": "usr-hosp-01",
        "email": "dr.rajesh@jubileemission.org",
        "password": "HospitalPassword2026!",
        "name": "Dr. Rajesh Nair, MD",
        "role": "ICU_HOSPITAL",
        "entity_id": "hosp-jubilee",
    },
    {
        "id": "usr-bank-01",
        "email": "ima.admin@imathrissur.org",
        "password": "BloodBankPassword2026!",
        "name": "IMA Blood Bank Admin",
        "role": "BLOOD_BANK",
        "entity_id": "bank-ima",
    },
    {
        "id": "usr-donor-01",
        "email": "sneha.donor@gmail.com",
        "password": "DonorPassword2026!",
        "name": "Sneha Menon",
        "role": "REGISTERED_DONOR",
        "entity_id": "d2",
    },
    {
        "id": "usr-donor-02",
        "email": "donor.aarav@gmail.com",
        "password": "DonorPassword2026!",
        "name": "Aarav Sharma",
        "role": "REGISTERED_DONOR",
        "entity_id": "d1",
    },
    {
        "id": "usr-driver-01",
        "email": "driver.arun@gmail.com",
        "password": "DriverPassword2026!",
        "name": "Arun Kumar (Swift Rider #42)",
        "role": "DELIVERY_PARTNER",
        "entity_id": "rider-42",
    },
]


def seed_users():
    session = SessionLocal()
    created_count = 0
    updated_count = 0
    try:
        for u in DEFAULT_USERS:
            existing = session.scalar(select(User).where(User.email == u["email"]))
            if existing:
                existing.name = u["name"]
                existing.role = normalize_role(u["role"])
                existing.entity_id = u["entity_id"]
                existing.hashed_password = hash_password(u["password"])
                existing.is_active = True
                existing.synthetic = True
                updated_count += 1
            else:
                user = User(
                    id=u.get("id") or str(uuid4()),
                    email=u["email"],
                    hashed_password=hash_password(u["password"]),
                    name=u["name"],
                    role=normalize_role(u["role"]),
                    entity_id=u["entity_id"],
                    is_active=True,
                    synthetic=True,
                    source="seed",
                )
                session.add(user)
                created_count += 1
        session.commit()
        print(f"Seeded users successfully: {created_count} created, {updated_count} updated.")
    except Exception as exc:
        session.rollback()
        print(f"Failed to seed users: {exc}", file=sys.stderr)
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed_users()
