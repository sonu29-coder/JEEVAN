"""
JEEVAN — CHENNAI SYNTHETIC DEMONSTRATION DATASET GENERATOR
Location: Chennai, Tamil Nadu, India
Synthetic Demo Generator for ICU, Donor, and Delivery Dashboards

Generates realistic synthetic datasets:
1. Chennai Hospital Dataset (~50 facilities)
2. Chennai Blood Bank Dataset (~20 facilities)
3. Synthetic Donor Dataset (~500 donor profiles)
4. Synthetic Delivery & Logistics Dataset (~150 records)
5. Synthetic ICU Blood-Request Dataset (~100 records)
6. Synthetic Inventory Dataset (~200 records)
7. Synthetic Matches, Reservations, Alerts, and Audit Logs

ALL RECORDS ARE SYNTHETIC DEMONSTRATION DATA FOR HACKATHON EVALUATION.
NOT FOR ACTUAL MEDICAL OR LOGISTICS DECISIONS.
"""

import os
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
from faker import Faker

fake = Faker("en_IN")
Faker.seed(20261016)
random.seed(20261016)

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR

# Chennai Metropolitan Center
CHENNAI_CENTER_LAT = 13.0827
CHENNAI_CENTER_LON = 80.2707

DATA_SOURCE_TAG = "SYNTHETIC_CHENNAI_DEMO"

CHENNAI_AREAS = [
    {"area": "T. Nagar", "pincode": "600017", "lat": 13.0418, "lon": 80.2341},
    {"area": "Anna Nagar", "pincode": "600040", "lat": 13.0850, "lon": 80.2101},
    {"area": "Adyar", "pincode": "600020", "lat": 13.0012, "lon": 80.2565},
    {"area": "Velachery", "pincode": "600042", "lat": 12.9750, "lon": 80.2206},
    {"area": "Guindy", "pincode": "600032", "lat": 13.0067, "lon": 80.2025},
    {"area": "Tambaram", "pincode": "600045", "lat": 12.9249, "lon": 80.1000},
    {"area": "Porur", "pincode": "600116", "lat": 13.0382, "lon": 80.1565},
    {"area": "Perungudi", "pincode": "600096", "lat": 12.9654, "lon": 80.2461},
    {"area": "Mylapore", "pincode": "600004", "lat": 13.0368, "lon": 80.2676},
    {"area": "Egmore", "pincode": "600008", "lat": 13.0827, "lon": 80.2607},
    {"area": "Royapuram", "pincode": "600013", "lat": 13.1137, "lon": 80.2954},
    {"area": "Sholinganallur", "pincode": "600119", "lat": 12.9010, "lon": 80.2279},
    {"area": "Ambattur", "pincode": "600053", "lat": 13.1143, "lon": 80.1548},
    {"area": "Kilpauk", "pincode": "600010", "lat": 13.0784, "lon": 80.2415},
    {"area": "Nungambakkam", "pincode": "600034", "lat": 13.0569, "lon": 80.2425},
    {"area": "Kodambakkam", "pincode": "600024", "lat": 13.0524, "lon": 80.2255},
    {"area": "Chromepet", "pincode": "600044", "lat": 12.9516, "lon": 80.1462},
    {"area": "Alwarpet", "pincode": "600018", "lat": 13.0334, "lon": 80.2519},
]

BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
COMPONENTS = ["Whole Blood", "PRBC", "Platelets", "Plasma"]
URGENCIES = ["normal", "urgent", "critical"]
DEPARTMENTS = [
    "Trauma Surgery",
    "Cardiac ICU",
    "Oncology",
    "Neonatal ICU",
    "Emergency Medicine",
    "Neurosurgery ICU",
    "Orthopedic Surgery",
    "Transplant ICU",
    "Maternal Emergency",
]

def offset_coord(lat: float, lon: float, max_radius_km: float = 2.0) -> tuple[float, float]:
    """Generates geographically plausible coordinates strictly clustered in Chennai area."""
    d_lat = random.uniform(-max_radius_km / 111.0, max_radius_km / 111.0)
    d_lon = random.uniform(-max_radius_km / 108.0, max_radius_km / 108.0)
    # Clip to Chennai bounding box (12.85 to 13.20, 80.05 to 80.32)
    clamped_lat = max(12.86, min(13.18, round(lat + d_lat, 6)))
    clamped_lon = max(80.08, min(80.30, round(lon + d_lon, 6)))
    return clamped_lat, clamped_lon

def random_fake_phone() -> str:
    # Clearly fake reserved demonstration numbers
    return f"91234{random.randint(10000, 99999)}"

def random_past_date(min_days_ago: int = 2, max_days_ago: int = 500) -> date:
    days = random.randint(min_days_ago, max_days_ago)
    return date.today() - timedelta(days=days)


# ============================================================
# 1. CHENNAI HOSPITALS DATASET (50 Facilities)
# ============================================================
hospital_facility_names = [
    ("Chennai Central Trauma Hospital [SYNTHETIC DEMO]", "Egmore", "Tertiary Trauma Care"),
    ("Kilpauk Medical & Critical Care [SYNTHETIC DEMO]", "Kilpauk", "Medical College Hospital"),
    ("Anna Nagar Multispecialty Hospital [SYNTHETIC DEMO]", "Anna Nagar", "Super Specialty Hospital"),
    ("Adyar Life Institute & Blood Centre [SYNTHETIC DEMO]", "Adyar", "Research & Cancer Care"),
    ("Velachery Emergency Care Centre [SYNTHETIC DEMO]", "Velachery", "Emergency & Trauma"),
    ("Guindy Apex Medical College [SYNTHETIC DEMO]", "Guindy", "Government Teaching Hospital"),
    ("Tambaram Suburban Health Centre [SYNTHETIC DEMO]", "Tambaram", "Suburban District Hospital"),
    ("Porur Surgical Institute [SYNTHETIC DEMO]", "Porur", "Surgical & Trauma Care"),
    ("Perungudi OMR Tech Hub Hospital [SYNTHETIC DEMO]", "Perungudi", "Acute Care Centre"),
    ("Mylapore Heritage Community Hospital [SYNTHETIC DEMO]", "Mylapore", "Community General Hospital"),
    ("Royapuram Coastal Emergency Hospital [SYNTHETIC DEMO]", "Royapuram", "Port & Coastal Hospital"),
    ("Sholinganallur Trauma Centre [SYNTHETIC DEMO]", "Sholinganallur", "Emergency Response Hub"),
    ("Ambattur Industrial Health Institute [SYNTHETIC DEMO]", "Ambattur", "Industrial Health Hospital"),
    ("Nungambakkam City Care Clinic [SYNTHETIC DEMO]", "Nungambakkam", "Day Surgery & ICU Hub"),
    ("Kodambakkam Heart & Lung Hospital [SYNTHETIC DEMO]", "Kodambakkam", "Cardiac Speciality Center"),
    ("Chromepet General Health Hospital [SYNTHETIC DEMO]", "Chromepet", "District Referral Hospital"),
    ("Alwarpet Specialty Critical Care [SYNTHETIC DEMO]", "Alwarpet", "Intensive Care Pavilion"),
    ("T. Nagar Metro Care Hospital [SYNTHETIC DEMO]", "T. Nagar", "Emergency Medical Center"),
    ("Greenways Road Children Hospital [SYNTHETIC DEMO]", "Adyar", "Pediatric & Neonatal ICU"),
    ("Poonamallee High Road Hospital [SYNTHETIC DEMO]", "Kilpauk", "Regional Emergency Care"),
    ("Madras Medical Mission Demo Hub [SYNTHETIC DEMO]", "Anna Nagar", "Cardiac Surgery Hospital"),
    ("Shenoy Nagar Maternity Hospital [SYNTHETIC DEMO]", "Anna Nagar", "Maternal Critical Care"),
    ("Besant Nagar Community Health Hub [SYNTHETIC DEMO]", "Adyar", "Urgent Care Centre"),
    ("Thiruvanmiyur Coastal Health Post [SYNTHETIC DEMO]", "Adyar", "Coastal Emergency Facility"),
    ("IIT Madras Campus Clinic [SYNTHETIC DEMO]", "Guindy", "Academic Medical Center"),
    ("Kathipara Rapid Care Hospital [SYNTHETIC DEMO]", "Guindy", "Corridor Trauma Hub"),
    ("Ekkattuthangal Industrial Clinic [SYNTHETIC DEMO]", "Guindy", "Workforce Health Hospital"),
    ("Pallavaram Regional Health Post [SYNTHETIC DEMO]", "Tambaram", "General Hospital"),
    ("Sanatorium Chest Clinic [SYNTHETIC DEMO]", "Tambaram", "Respiratory & ICU Hospital"),
    ("Ramapuram Critical Care Centre [SYNTHETIC DEMO]", "Porur", "Trauma Care Center"),
    ("Manapakkam Emergency Hub [SYNTHETIC DEMO]", "Porur", "Surgical Hospital"),
    ("Iyyappanthangal Healthcare Hub [SYNTHETIC DEMO]", "Porur", "Trauma Unit"),
    ("Kandanchavadi Specialty Care [SYNTHETIC DEMO]", "Perungudi", "OMR Emergency Post"),
    ("Thoraipakkam Tech Care Hospital [SYNTHETIC DEMO]", "Perungudi", "Acute Medical Hub"),
    ("Mandaveli General Hospital [SYNTHETIC DEMO]", "Mylapore", "Community Hospital"),
    ("Santhome Coastal Medical Center [SYNTHETIC DEMO]", "Mylapore", "Emergency Clinic"),
    ("Purasawalkam Urban Health Clinic [SYNTHETIC DEMO]", "Egmore", "Urban Health Centre"),
    ("Vepery Veterinary & Medical College [SYNTHETIC DEMO]", "Egmore", "Research Hospital"),
    ("Tondiarpet General Hospital [SYNTHETIC DEMO]", "Royapuram", "Port Area General Hospital"),
    ("Washermanpet Community Health Post [SYNTHETIC DEMO]", "Royapuram", "Suburban Hospital"),
    ("Navalur OMR South Clinic [SYNTHETIC DEMO]", "Sholinganallur", "Emergency Transit Hospital"),
    ("Karapakkam Life Care Hospital [SYNTHETIC DEMO]", "Sholinganallur", "Urgent Care Hub"),
    ("Padi Industrial Area Hospital [SYNTHETIC DEMO]", "Ambattur", "Industrial Care Center"),
    ("Korattur Suburban Hospital [SYNTHETIC DEMO]", "Ambattur", "Suburban Medical Hub"),
    ("Chetpet Lake Care Hospital [SYNTHETIC DEMO]", "Kilpauk", "Specialty Medical Hospital"),
    ("Ayanavaram Railway Hospital [SYNTHETIC DEMO]", "Kilpauk", "Regional Referral Hospital"),
    ("Valluvar Kottam City Hospital [SYNTHETIC DEMO]", "Nungambakkam", "Central Surgical Hospital"),
    ("Thousand Lights Multi-Care [SYNTHETIC DEMO]", "Nungambakkam", "Tertiary ICU Hub"),
    ("Vadapalani Surgical Institute [SYNTHETIC DEMO]", "Kodambakkam", "Trauma & Orthopedic Center"),
    ("Ashok Nagar General Hospital [SYNTHETIC DEMO]", "Kodambakkam", "Emergency & Critical Care"),
]

area_lookup = {item["area"]: item for item in CHENNAI_AREAS}

hospitals = []
for i, (name, area_name, fac_type) in enumerate(hospital_facility_names, start=1):
    area_info = area_lookup.get(area_name, CHENNAI_AREAS[0])
    lat, lon = offset_coord(area_info["lat"], area_info["lon"], max_radius_km=1.2)
    hosp_id = f"HOSP{i:04d}"

    avail_units_map = {bg: random.randint(4, 35) for bg in BLOOD_GROUPS}
    total_units = sum(avail_units_map.values())
    avail_str = "; ".join(f"{bg}:{u}" for bg, u in avail_units_map.items())

    hospitals.append({
        "hospital_id": hosp_id,
        "synthetic_hospital_name": name,
        "facility_type": fac_type,
        "area": area_name,
        "city": "Chennai",
        "state": "Tamil Nadu",
        "pincode": area_info["pincode"],
        "latitude": lat,
        "longitude": lon,
        "available_blood_groups": ", ".join(BLOOD_GROUPS),
        "available_units_by_blood_group": avail_str,
        "emergency_contact_demo": f"+91 44 2{random.randint(1000000, 9999999)} [DEMO]",
        "operating_status": "24/7 Active Emergency",
        "last_inventory_update": (datetime.now(timezone.utc) - timedelta(minutes=random.randint(5, 120))).isoformat(),
        "data_source": DATA_SOURCE_TAG,
        # Schema compatibility fields
        "hospital_name": name,
        "phone": random_fake_phone(),
        "email": f"icu.demo{i}@synthetic-jeevan.demo",
        "synthetic": True,
        "source": DATA_SOURCE_TAG,
    })

hospitals_df = pd.DataFrame(hospitals)
hospitals_df.to_csv(OUTPUT_DIR / "hospitals.csv", index=False)


# ============================================================
# 2. CHENNAI BLOOD BANKS DATASET (20 Dedicated Facilities)
# ============================================================
blood_banks = []
bank_specs = [
    ("Red Cross Blood Centre Chennai [SYNTHETIC DEMO]", "Egmore", "600008"),
    ("Madras Govt Medical College Blood Centre [SYNTHETIC DEMO]", "Egmore", "600003"),
    ("Mylapore Rotary Blood Bank [SYNTHETIC DEMO]", "Mylapore", "600004"),
    ("Guindy Apex Regional Blood Bank [SYNTHETIC DEMO]", "Guindy", "600032"),
    ("Ambattur Lions Blood Centre [SYNTHETIC DEMO]", "Ambattur", "600053"),
    ("Anna Nagar Jeevan Blood Bank [SYNTHETIC DEMO]", "Anna Nagar", "600040"),
    ("Adyar Life Line Blood Centre [SYNTHETIC DEMO]", "Adyar", "600020"),
    ("Velachery Metropolis Blood Centre [SYNTHETIC DEMO]", "Velachery", "600042"),
    ("Tambaram Railway Blood Bank [SYNTHETIC DEMO]", "Tambaram", "600045"),
    ("Porur Voluntary Blood Centre [SYNTHETIC DEMO]", "Porur", "600116"),
    ("Perungudi Tech Corridor Blood Hub [SYNTHETIC DEMO]", "Perungudi", "600096"),
    ("Kilpauk Medical College Blood Centre [SYNTHETIC DEMO]", "Kilpauk", "600010"),
    ("Nungambakkam City Blood Centre [SYNTHETIC DEMO]", "Nungambakkam", "600034"),
    ("Royapuram Coastal Blood Reserve [SYNTHETIC DEMO]", "Royapuram", "600013"),
    ("Sholinganallur South Blood Centre [SYNTHETIC DEMO]", "Sholinganallur", "600119"),
    ("Kodambakkam Express Blood Centre [SYNTHETIC DEMO]", "Kodambakkam", "600024"),
    ("Chromepet Community Blood Bank [SYNTHETIC DEMO]", "Chromepet", "600044"),
    ("Alwarpet Emergency Blood Reserve [SYNTHETIC DEMO]", "Alwarpet", "600018"),
    ("T. Nagar Apex Blood Centre [SYNTHETIC DEMO]", "T. Nagar", "600017"),
    ("Central Metro Emergency Blood Bank [SYNTHETIC DEMO]", "Egmore", "600008"),
]

for i, (b_name, b_area, b_pin) in enumerate(bank_specs, start=1):
    area_info = area_lookup.get(b_area, CHENNAI_AREAS[0])
    lat, lon = offset_coord(area_info["lat"], area_info["lon"], max_radius_km=1.0)
    bank_id = f"BB{i:04d}"

    blood_banks.append({
        "blood_bank_id": bank_id,
        "blood_bank_name": b_name,
        "address": f"Plot {i * 12}, {b_area} Main Arterial Road, Chennai - {b_pin}",
        "area": b_area,
        "city": "Chennai",
        "state": "Tamil Nadu",
        "latitude": lat,
        "longitude": lon,
        "phone": random_fake_phone(),
        "email": f"bloodbank{i}@synthetic-jeevan.demo",
        "licence_number": f"TN-CHE-DL-{i:03d}/2026",
        "licence_issued": "2022-01-15",
        "licence_valid_until": "2028-12-31",
        "synthetic": True,
        "source": DATA_SOURCE_TAG,
        # Compatibility
        "name": b_name,
    })

blood_banks_df = pd.DataFrame(blood_banks)
blood_banks_df.to_csv(OUTPUT_DIR / "blood_banks.csv", index=False)


# ============================================================
# 3. SYNTHETIC DONOR DATASET (500 Profiles)
# ============================================================
donors = []
for i in range(1, 501):
    area_info = random.choice(CHENNAI_AREAS)
    lat, lon = offset_coord(area_info["lat"], area_info["lon"], max_radius_km=2.2)

    bg = random.choice(BLOOD_GROUPS)
    age = random.randint(18, 62)
    gender = random.choice(["Male", "Female", "Female", "Male", "Other"])
    donation_history = random.randint(0, 15)

    last_donation = random_past_date(35, 600) if donation_history > 0 else None
    days_since_last = (date.today() - last_donation).days if last_donation else 999

    # Determine availability: 90-day cooldown for blood donation
    if days_since_last < 90:
        avail_status = "COOLDOWN"
        eligible = False
    elif random.random() < 0.15:
        avail_status = "UNAVAILABLE"
        eligible = False
    elif random.random() < 0.35:
        avail_status = "ON_CALL"
        eligible = True
    else:
        avail_status = "AVAILABLE"
        eligible = True

    donor_id = f"DON{i:05d}"
    donor_code = f"JEEVAN-CHE-D-{i:05d}"
    donor_name = f"{fake.first_name()} {fake.last_name()}"

    donors.append({
        "donor_id": donor_id,
        "donor_code": donor_code,
        "synthetic_full_name": donor_name,
        "name": donor_name,
        "blood_group": bg,
        "age": age,
        "gender": gender,
        "city": "Chennai",
        "area": area_info["area"],
        "approximate_latitude": lat,
        "approximate_longitude": lon,
        "latitude": lat,
        "longitude": lon,
        "donation_history_count": donation_history,
        "donation_count": donation_history,
        "last_donation_date": last_donation.isoformat() if last_donation else "",
        "availability_status": avail_status,
        "contact_verification_status": "VERIFIED" if random.random() < 0.85 else "PENDING",
        "consent_status": "EXPLICIT_CONSENT_GIVEN",
        "response_rate": round(random.uniform(45.0, 98.0), 2),
        "eligible": eligible,
        "phone": random_fake_phone(),
        "phone_verified": True,
        "email": f"donor{i}@example.com",
        "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(10, 400))).isoformat(),
        "data_source": DATA_SOURCE_TAG,
        "synthetic": True,
        "source": DATA_SOURCE_TAG,
    })

donors_df = pd.DataFrame(donors)
donors_df.to_csv(OUTPUT_DIR / "donors.csv", index=False)


# ============================================================
# 4. SYNTHETIC INVENTORY DATASET (~200 Records)
# ============================================================
inventory = []
inv_id = 1
for bank in blood_banks:
    # 8 blood groups * multiple components
    selected_groups = random.sample(BLOOD_GROUPS, k=random.randint(6, 8))
    for bg in selected_groups:
        comp = random.choice(COMPONENTS)
        days_valid = random.randint(3, 40) if comp != "Platelets" else random.randint(1, 5)

        inventory.append({
            "inventory_id": f"INV{inv_id:05d}",
            "blood_bank_id": bank["blood_bank_id"],
            "blood_group": bg,
            "component": comp,
            "units": random.randint(2, 28),
            "expiry_date": (date.today() + timedelta(days=days_valid)).isoformat(),
            "status": "available",
            "synthetic": True,
            "source": DATA_SOURCE_TAG,
        })
        inv_id += 1

inventory_df = pd.DataFrame(inventory)
inventory_df.to_csv(OUTPUT_DIR / "inventory.csv", index=False)


# ============================================================
# 5. SYNTHETIC ICU BLOOD-REQUEST DATASET (100 Records)
# ============================================================
blood_requests = []
req_statuses = ["pending", "pending", "matched", "fulfilled", "in_transit"]
priorities = ["CRITICAL", "URGENT", "ROUTINE"]

for i in range(1, 101):
    hosp = random.choice(hospitals)
    bg = random.choice(BLOOD_GROUPS)
    comp = random.choice(COMPONENTS)
    dept = random.choice(DEPARTMENTS)
    prio = random.choice(priorities)
    st = random.choice(req_statuses)

    req_id = f"REQ{i:05d}"
    req_code = f"JEEVAN-CHE-REQ-{i:05d}"
    patient_ref = f"SYN-PT-CHE-{i:04d}"

    created_time = datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 72))
    approved_time = created_time + timedelta(minutes=random.randint(3, 25)) if st in ("matched", "fulfilled", "in_transit") else None
    delivery_id = f"DELIV{random.randint(1, 150):04d}" if st in ("fulfilled", "in_transit") else None

    blood_requests.append({
        "request_id": req_id,
        "request_code": req_code,
        "synthetic_hospital_id": hosp["hospital_id"],
        "hospital_id": hosp["hospital_id"],
        "hospital_name": hosp["synthetic_hospital_name"],
        "synthetic_patient_reference": patient_ref,
        "patient_identifier": patient_ref,
        "requesting_department": dept,
        "department": dept,
        "blood_group": bg,
        "patient_blood_group": bg,
        "component_type": comp,
        "component": comp,
        "requested_units": random.randint(1, 5),
        "units_required": random.randint(1, 5),
        "priority": prio,
        "urgency": prio.lower(),
        "request_status": st,
        "status": st,
        "hospital_latitude": hosp["latitude"],
        "hospital_longitude": hosp["longitude"],
        "created_at": created_time.isoformat(),
        "approved_at": approved_time.isoformat() if approved_time else "",
        "assigned_delivery_id": delivery_id or "",
        "data_source": DATA_SOURCE_TAG,
        "synthetic": True,
        "source": DATA_SOURCE_TAG,
    })

requests_df = pd.DataFrame(blood_requests)
requests_df.to_csv(OUTPUT_DIR / "requests.csv", index=False)


# ============================================================
# 6. SYNTHETIC DELIVERY DATASET (150 Records)
# ============================================================
deliveries = []
delivery_statuses = [
    "DELIVERED",
    "DELIVERED",
    "DELIVERED",
    "IN_TRANSIT",
    "PICKED_UP",
    "ASSIGNED",
    "CANCELLED",
]
vehicle_types = [
    "Refrigerated Bike",
    "Electric Rapid Transit",
    "Refrigerated Van",
    "Medical Courier Drone (Demo)",
]
courier_names = [
    ("DLVR-8821", "Arun Kumar (Swift Rider #42)", "Refrigerated Bike"),
    ("DLVR-8822", "Kavita Selvam (Green Corridor Pilot)", "Electric Rapid Transit"),
    ("DLVR-8823", "M. Vignesh (Rapid Transit)", "Refrigerated Bike"),
    ("DLVR-8824", "Deepak Sundaram (Cold-Chain Van #09)", "Refrigerated Van"),
    ("DLVR-8825", "S. Priya (Fast Courier #17)", "Refrigerated Bike"),
]

for i in range(1, 151):
    src_bank = random.choice(blood_banks)
    dest_hosp = random.choice(hospitals)

    # Calculate distance approx
    lat_diff = abs(src_bank["latitude"] - dest_hosp["latitude"]) * 111.0
    lon_diff = abs(src_bank["longitude"] - dest_hosp["longitude"]) * 108.0
    dist_km = max(0.8, round((lat_diff ** 2 + lon_diff ** 2) ** 0.5, 2))
    est_mins = max(8, round(dist_km * 2.8 + random.uniform(3, 10), 1))

    deliv_status = random.choice(delivery_statuses)
    courier = random.choice(courier_names)
    v_type = courier[2]
    prio = random.choice(priorities)
    bg = random.choice(BLOOD_GROUPS)
    comp = random.choice(COMPONENTS)

    req = random.choice(blood_requests)

    # Ensure chronologically sound timestamps
    created_dt = datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 48))
    pickup_dt = created_dt + timedelta(minutes=random.randint(4, 15))
    dispatch_dt = pickup_dt + timedelta(minutes=random.randint(2, 6))

    if deliv_status in ("ARRIVED", "DELIVERED"):
        arrival_dt = dispatch_dt + timedelta(minutes=int(est_mins))
        delivered_dt = arrival_dt + timedelta(minutes=random.randint(2, 8))
        proof_status = "VERIFIED"
    elif deliv_status == "IN_TRANSIT":
        arrival_dt = None
        delivered_dt = None
        proof_status = "PENDING"
    elif deliv_status == "PICKED_UP":
        dispatch_dt = None
        arrival_dt = None
        delivered_dt = None
        proof_status = "PENDING"
    elif deliv_status == "ASSIGNED":
        pickup_dt = None
        dispatch_dt = None
        arrival_dt = None
        delivered_dt = None
        proof_status = "PENDING"
    else:  # CANCELLED
        arrival_dt = None
        delivered_dt = None
        proof_status = "CANCELLED"

    deliv_id = f"DELIV{i:04d}"
    disp_code = f"DSP-CHE-{i:04d}"
    pickup_otp = str(random.randint(1000, 9999))
    delivery_otp = str(random.randint(1000, 9999))

    deliveries.append({
        "delivery_id": deliv_id,
        "id": deliv_id,
        "blood_request_id": req["request_id"],
        "request_id": req["request_id"],
        "source_facility_id": src_bank["blood_bank_id"],
        "destination_facility_id": dest_hosp["hospital_id"],
        "blood_group": bg,
        "component_type": comp,
        "component": comp,
        "units": random.randint(1, 4),
        "priority": prio,
        "pickup_area": src_bank["area"],
        "destination_area": dest_hosp["area"],
        "estimated_distance_km": dist_km,
        "estimated_delivery_minutes": est_mins,
        "assigned_driver_id": courier[0],
        "courier_id": courier[0],
        "courier_name": courier[1],
        "vehicle_type": v_type,
        "delivery_status": deliv_status,
        "status": deliv_status.lower(),
        "dispatch_code": disp_code,
        "pickup_name": src_bank["blood_bank_name"],
        "pickup_address": src_bank["address"],
        "destination_name": dest_hosp["synthetic_hospital_name"],
        "destination_department": req["department"],
        "cold_chain_temp": round(random.uniform(2.8, 5.2), 1),
        "pickup_otp": pickup_otp,
        "delivery_otp": delivery_otp,
        "created_at": created_dt.isoformat(),
        "pickup_timestamp": pickup_dt.isoformat() if pickup_dt else "",
        "picked_up_at": pickup_dt.isoformat() if pickup_dt else "",
        "dispatch_timestamp": dispatch_dt.isoformat() if dispatch_dt else "",
        "arrival_timestamp": arrival_dt.isoformat() if arrival_dt else "",
        "delivered_at": delivered_dt.isoformat() if delivered_dt else "",
        "proof_of_handover_status": proof_status,
        "exception_notes": "Simulation: None. Cold-chain within 2°C-6°C." if deliv_status != "CANCELLED" else "Simulated cancellation: Alternate supply acquired",
        "data_source": DATA_SOURCE_TAG,
        "synthetic": True,
    })

deliveries_df = pd.DataFrame(deliveries)
deliveries_df.to_csv(OUTPUT_DIR / "deliveries.csv", index=False)


# ============================================================
# 7. SYNTHETIC MATCHES DATASET (150 Records)
# ============================================================
matches = []
for i in range(1, 151):
    req = random.choice(blood_requests)
    bank = random.choice(blood_banks)
    donor = random.choice(donors)

    lat_diff = abs(req["hospital_latitude"] - bank["latitude"]) * 111.0
    lon_diff = abs(req["hospital_longitude"] - bank["longitude"]) * 108.0
    dist_km = max(0.5, round((lat_diff ** 2 + lon_diff ** 2) ** 0.5, 2))

    matches.append({
        "match_id": f"MAT{i:05d}",
        "request_id": req["request_id"],
        "blood_bank_id": bank["blood_bank_id"],
        "donor_id": donor["donor_id"],
        "score": round(random.uniform(65.0, 99.4), 4),
        "distance_km": dist_km,
        "units_available": random.randint(1, 10),
        "status": random.choice(["suggested", "contacted", "accepted", "completed"]),
        "synthetic": True,
        "source": DATA_SOURCE_TAG,
    })

matches_df = pd.DataFrame(matches)
matches_df.to_csv(OUTPUT_DIR / "matches.csv", index=False)


# ============================================================
# 8. SYNTHETIC RESERVATIONS DATASET (100 Records)
# ============================================================
reservations = []
for i in range(1, 101):
    req = random.choice(blood_requests)
    inv = random.choice(inventory)

    reservations.append({
        "reservation_id": f"RES{i:05d}",
        "request_id": req["request_id"],
        "inventory_id": inv["inventory_id"],
        "units_reserved": random.randint(1, 3),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=random.randint(15, 60))).isoformat(),
        "status": random.choice(["active", "confirmed", "completed", "expired"]),
        "created_at": (datetime.now(timezone.utc) - timedelta(minutes=random.randint(1, 300))).isoformat(),
        "synthetic": True,
        "source": DATA_SOURCE_TAG,
    })

reservations_df = pd.DataFrame(reservations)
reservations_df.to_csv(OUTPUT_DIR / "reservations.csv", index=False)


# ============================================================
# 9. SYNTHETIC DONOR ALERTS DATASET (200 Records)
# ============================================================
donor_alerts = []
for i in range(1, 201):
    donor = random.choice(donors)
    req = random.choice(blood_requests)
    st = random.choice(["sent", "acknowledged", "pending"])

    donor_alerts.append({
        "alert_id": f"ALERT{i:05d}",
        "donor_id": donor["donor_id"],
        "request_id": req["request_id"],
        "message": f"Emergency requisition: {req['patient_blood_group']} blood needed near {donor['area']}, Chennai.",
        "status": st,
        "delivery_status": "published" if st in ("sent", "acknowledged") else "pending",
        "sent_at": (datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 36))).isoformat(),
        "synthetic": True,
        "source": DATA_SOURCE_TAG,
    })

donor_alerts_df = pd.DataFrame(donor_alerts)
donor_alerts_df.to_csv(OUTPUT_DIR / "donor_alerts.csv", index=False)


# ============================================================
# 10. SYNTHETIC AUDIT LOGS DATASET (300 Records)
# ============================================================
audit_logs = []
actions = [
    "CREATE_CHENNAI_REQUEST",
    "RESERVE_CHENNAI_INVENTORY",
    "DISPATCH_GREEN_CORRIDOR",
    "VERIFY_HANDSHAKE_OTP",
    "MATCH_CHENNAI_DONOR",
    "NOTIFY_DONOR_ALERT",
    "UPDATE_COLD_CHAIN_TEMP",
]

for i in range(1, 301):
    audit_logs.append({
        "audit_id": f"AUD{i:05d}",
        "user_id": f"usr-demo-{random.randint(1, 10):02d}",
        "action": random.choice(actions),
        "entity_type": random.choice(["request", "donor", "delivery", "inventory", "match"]),
        "entity_id": f"ENT-{random.randint(100, 999)}",
        "details": "Synthetic JEEVAN Chennai demonstration operation. Handshake and cold-chain logging verified.",
        "created_at": (datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 120))).isoformat(),
        "synthetic": True,
        "source": DATA_SOURCE_TAG,
    })

audit_logs_df = pd.DataFrame(audit_logs)
audit_logs_df.to_csv(OUTPUT_DIR / "audit_logs.csv", index=False)


# ============================================================
# SUMMARY REPORT
# ============================================================
print("=" * 65)
print("JEEVAN — CHENNAI SYNTHETIC DEMONSTRATION DATA GENERATION COMPLETE")
print("=" * 65)
print(f"Hospitals & Facilities : {len(hospitals_df)}")
print(f"Blood Banks            : {len(blood_banks_df)}")
print(f"Synthetic Donors       : {len(donors_df)}")
print(f"Inventory Items        : {len(inventory_df)}")
print(f"ICU Blood Requests     : {len(requests_df)}")
print(f"Delivery & Logistics   : {len(deliveries_df)}")
print(f"Matches                : {len(matches_df)}")
print(f"Reservations           : {len(reservations_df)}")
print(f"Donor Alerts           : {len(donor_alerts_df)}")
print(f"Audit Logs             : {len(audit_logs_df)}")
print("=" * 65)
print("Notice: ALL records marked SYNTHETIC_CHENNAI_DEMO.")
print("Geographic Center: Chennai, Tamil Nadu (Lat 13.0827, Lon 80.2707)")
print("=" * 65)
