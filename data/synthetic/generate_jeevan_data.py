
import os
import random
from datetime import date, timedelta

import pandas as pd
from faker import Faker

# ============================================================
# JEEVAN - THRISSUR SYNTHETIC DEMO DATA GENERATOR
# ============================================================

fake = Faker("en_IN")
Faker.seed(20261001)
random.seed(20261001)

# Project paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = BASE_DIR

# Thrissur city center
CENTER_LAT = 10.5276
CENTER_LON = 76.2144

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

def random_location(radius_km=35):
    """
    Generate a synthetic location around Thrissur.
    These coordinates are DEMO/SYNTHETIC coordinates.
    """
    lat_offset = random.uniform(-radius_km / 111, radius_km / 111)
    lon_offset = random.uniform(
        -radius_km / (111 * 0.985),
        radius_km / (111 * 0.985)
    )

    return round(CENTER_LAT + lat_offset, 6), round(CENTER_LON + lon_offset, 6)


def random_phone():
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


def random_date(days_back=730):
    return date.today() - timedelta(days=random.randint(0, days_back))


blood_groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]

components = [
    "Whole Blood",
    "RBC",
    "Platelets",
    "Plasma"
]

urgencies = [
    "normal",
    "urgent",
    "critical"
]

# ============================================================
# 1. HOSPITALS
# ============================================================

hospital_names = [
    "Government Medical College Hospital Thrissur",
    "District Hospital Thrissur",
    "Jubilee Mission Medical College and Research Institute",
    "Amala Institute of Medical Sciences",
    "Westfort Hospital",
    "Elite Mission Hospital",
    "Mother Hospital",
    "Unity Hospital",
    "Daya General Hospital",
    "Aswini Hospital",
    "Saroja Hospital",
    "Royal Hospital",
    "Metropolitan Hospital",
    "St. James Hospital",
    "Holy Family Hospital",
    "Amala Cancer Hospital",
    "Government Hospital Kunnamkulam",
    "Government Hospital Kodungallur",
    "Government Hospital Irinjalakuda",
    "Government Hospital Chalakudy",
    "Government Hospital Wadakkanchery",
    "Government Hospital Chavakkad",
    "Government Hospital Ollur",
    "Government Hospital Mala",
    "Government Hospital Peringottukara",
    "Government Hospital Cherpu",
    "Government Hospital Kunnamkulam Taluk",
    "Government Hospital Chelakkara",
    "Government Hospital Pazhayannur",
    "Government Hospital Mathilakam"
]

hospitals = []

for i, name in enumerate(hospital_names, start=1):
    lat, lon = random_location(30)

    hospitals.append({
        "hospital_id": f"HOSP{i:04d}",
        "hospital_name": name,
        "city": "Thrissur",
        "state": "Kerala",
        "latitude": lat,
        "longitude": lon,
        "phone": random_phone(),
        "email": f"hospital{i}@jeevan-demo.local",
        "synthetic_location": True,
        "source": "synthetic_demo"
    })

hospitals_df = pd.DataFrame(hospitals)
hospitals_df.to_csv(
    os.path.join(OUTPUT_DIR, "hospitals.csv"),
    index=False
)

# ============================================================
# 2. BLOOD BANKS
# ============================================================

blood_banks = []

for i in range(1, 16):
    lat, lon = random_location(35)

    blood_banks.append({
        "blood_bank_id": f"BB{i:04d}",
        "blood_bank_name": f"JEEVAN Demo Blood Bank - Thrissur {i}",
        "address": f"Demo Address {i}, Thrissur",
        "city": "Thrissur",
        "state": "Kerala",
        "latitude": lat,
        "longitude": lon,
        "phone": random_phone(),
        "email": f"bloodbank{i}@jeevan-demo.local",
        "synthetic_location": True,
        "source": "synthetic_demo"
    })

blood_banks_df = pd.DataFrame(blood_banks)

blood_banks_df.to_csv(
    os.path.join(OUTPUT_DIR, "blood_banks.csv"),
    index=False
)

# ============================================================
# 3. DONORS
# ============================================================

donors = []

for i in range(1, 301):
    lat, lon = random_location(40)

    last_donation = random_date(500)

    donors.append({
        "donor_id": f"DON{i:05d}",
        "donor_code": f"JEEVAN-D-{i:05d}",
        "name": fake.name(),
        "blood_group": random.choice(blood_groups),
        "phone": random_phone(),
        "email": f"donor{i}@jeevan-demo.local",
        "latitude": lat,
        "longitude": lon,
        "last_donation_date": last_donation,
        "donation_count": random.randint(1, 12),
        "response_rate": round(random.uniform(35, 98), 2),
        "eligible": random.choice([True, True, True, False]),
        "synthetic": True,
        "source": "synthetic_demo"
    })

donors_df = pd.DataFrame(donors)

donors_df.to_csv(
    os.path.join(OUTPUT_DIR, "donors.csv"),
    index=False
)

# ============================================================
# 4. INVENTORY
# ============================================================

inventory = []

inventory_id = 1

for blood_bank in blood_banks:
    for blood_group in blood_groups:

        component = random.choice(components)

        inventory.append({
            "inventory_id": f"INV{inventory_id:05d}",
            "blood_bank_id": blood_bank["blood_bank_id"],
            "blood_group": blood_group,
            "component": component,
            "units": random.randint(0, 25),
            "expiry_date": date.today() + timedelta(
                days=random.randint(3, 35)
            ),
            "status": "available",
            "synthetic": True,
            "source": "synthetic_demo"
        })

        inventory_id += 1

inventory_df = pd.DataFrame(inventory)

inventory_df.to_csv(
    os.path.join(OUTPUT_DIR, "inventory.csv"),
    index=False
)

# ============================================================
# 5. BLOOD REQUESTS
# ============================================================

requests = []

for i in range(1, 101):

    hospital = random.choice(hospitals)
    lat, lon = random_location(30)

    requests.append({
        "request_id": f"REQ{i:05d}",
        "request_code": f"JEEVAN-REQ-{i:05d}",
        "hospital_name": hospital["hospital_name"],
        "patient_blood_group": random.choice(blood_groups),
        "component": random.choice(components),
        "units_required": random.randint(1, 8),
        "urgency": random.choice(urgencies),
        "hospital_latitude": lat,
        "hospital_longitude": lon,
        "status": random.choice([
            "pending",
            "pending",
            "matched",
            "fulfilled"
        ]),
        "synthetic": True,
        "source": "synthetic_demo"
    })

requests_df = pd.DataFrame(requests)

requests_df.to_csv(
    os.path.join(OUTPUT_DIR, "requests.csv"),
    index=False
)

# ============================================================
# 6. MATCHES
# ============================================================

matches = []

for i in range(1, 151):

    request = random.choice(requests)
    blood_bank = random.choice(blood_banks)
    donor = random.choice(donors)

    matches.append({
        "match_id": f"MAT{i:05d}",
        "request_id": request["request_id"],
        "blood_bank_id": blood_bank["blood_bank_id"],
        "donor_id": donor["donor_id"],
        "score": round(random.uniform(45, 99), 4),
        "distance_km": round(random.uniform(0.5, 40), 2),
        "units_available": random.randint(1, 10),
        "status": random.choice([
            "suggested",
            "contacted",
            "accepted",
            "completed"
        ]),
        "synthetic": True,
        "source": "synthetic_demo"
    })

matches_df = pd.DataFrame(matches)

matches_df.to_csv(
    os.path.join(OUTPUT_DIR, "matches.csv"),
    index=False
)

# ============================================================
# 7. RESERVATIONS
# ============================================================

reservations = []

for i in range(1, 101):

    request = random.choice(requests)
    inventory_item = random.choice(inventory)

    reservations.append({
        "reservation_id": f"RES{i:05d}",
        "request_id": request["request_id"],
        "inventory_id": inventory_item["inventory_id"],
        "units_reserved": random.randint(1, 5),
        "expires_at": (
            date.today() + timedelta(days=random.randint(1, 5))
        ),
        "status": random.choice([
            "active",
            "confirmed",
            "completed",
            "expired"
        ]),
        "synthetic": True,
        "source": "synthetic_demo"
    })

reservations_df = pd.DataFrame(reservations)

reservations_df.to_csv(
    os.path.join(OUTPUT_DIR, "reservations.csv"),
    index=False
)

# ============================================================
# 8. DONOR ALERTS
# ============================================================

donor_alerts = []

for i in range(1, 201):

    donor = random.choice(donors)
    request = random.choice(requests)

    donor_alerts.append({
        "alert_id": f"ALERT{i:05d}",
        "donor_id": donor["donor_id"],
        "request_id": request["request_id"],
        "message": (
            f"Urgent {request['patient_blood_group']} blood "
            f"requirement near Thrissur."
        ),
        "status": random.choice([
            "pending",
            "sent",
            "acknowledged"
        ]),
        "sent_at": date.today(),
        "synthetic": True,
        "source": "synthetic_demo"
    })

donor_alerts_df = pd.DataFrame(donor_alerts)

donor_alerts_df.to_csv(
    os.path.join(OUTPUT_DIR, "donor_alerts.csv"),
    index=False
)

# ============================================================
# 9. AUDIT LOGS
# ============================================================

audit_logs = []

actions = [
    "CREATE_REQUEST",
    "UPDATE_INVENTORY",
    "MATCH_DONOR",
    "SEND_ALERT",
    "CREATE_RESERVATION",
    "FULFILL_REQUEST",
    "UPDATE_DONOR"
]

for i in range(1, 301):

    audit_logs.append({
        "audit_id": f"AUD{i:05d}",
        "user_id": random.randint(1, 20),
        "action": random.choice(actions),
        "entity_type": random.choice([
            "request",
            "donor",
            "inventory",
            "match",
            "reservation"
        ]),
        "entity_id": random.randint(1, 100),
        "details": "Synthetic JEEVAN demo activity",
        "created_at": str(date.today()),
        "synthetic": True,
        "source": "synthetic_demo"
    })

audit_logs_df = pd.DataFrame(audit_logs)

audit_logs_df.to_csv(
    os.path.join(OUTPUT_DIR, "audit_logs.csv"),
    index=False
)

# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 60)
print("JEEVAN SYNTHETIC DATA GENERATION COMPLETE")
print("=" * 60)
print()

print(f"Hospitals       : {len(hospitals_df)}")
print(f"Blood Banks     : {len(blood_banks_df)}")
print(f"Donors          : {len(donors_df)}")
print(f"Inventory       : {len(inventory_df)}")
print(f"Requests        : {len(requests_df)}")
print(f"Matches         : {len(matches_df)}")
print(f"Reservations    : {len(reservations_df)}")
print(f"Donor Alerts    : {len(donor_alerts_df)}")
print(f"Audit Logs      : {len(audit_logs_df)}")
print()

print("All operational data is SYNTHETIC DEMO DATA.")
print("Geographic center: Thrissur, Kerala")
print()
print(f"Files created in:")
print(OUTPUT_DIR)
print()
print("=" * 60)


