# JEEVAN (HEMO-GRID AI)

> **Decentralized Emergency Blood Availability, Predictive Expiry Radar & Rapid Transit Logistics Grid**

JEEVAN is a next-generation healthcare platform that unifies hospital ICUs, regional blood banks, voluntary donors, and emergency transit couriers into a coordinated, zero-wastage network. Powered by FastAPI, Next.js, PostgreSQL/PostGIS, Redis event streams, and real-time routing engines.

---

## 🌟 Key Innovations & Architecture

```
                          ┌────────────────────────┐
                          │   Hospital ICU Node    │
                          │ (Emergency Blood Req)  │
                          └───────────┬────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         ▼                         │
            │          ┌─────────────────────────────┐          │
            │          │    JEEVAN Core Engine       │          │
            │          │ - Two-Phase Lock Matrix     │          │
            │          │ - PostGIS Geospatial Engine │          │
            │          │ - ML Donor Response Model   │          │
            │          │ - FEFO Expiry Radar         │          │
            │          └──────────────┬──────────────┘          │
            │                         │                         │
            ▼                         ▼                         ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│  Regional Blood Bank  │ │    Rapid Courier      │ │    On-Call Donors     │
│  - Live Inventory     │ │  - Green Corridor     │ │  - PostGIS Proximity  │
│  - Atomic Lock Matrix │ │  - Cold-Chain Temp    │ │  - ML Cascaded Alerts │
│  - Expiry Prevention  │ │  - Handshake OTP      │ │  - Identity Verified  │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### 1. Centralized RBAC & Multi-Role Authentication
* **Universal Login:** Single entry portal supporting Google / Gmail Auth, phone OTP with Indian phone validation (`+91`), and role-based access.
* **Granular Role Isolation:** Strict access boundaries for ICU Physicians, Blood Bank Operators, Voluntary Donors, Rapid Transit Couriers, and Network Administrators.

### 2. Live Inventory & Predictive Blood Expiry Radar
* **FEFO / FIFO Engine:** Continuous tracking of shelf life across Packed Red Blood Cells (PRBC, 42 days), Platelets (5 days), and Frozen Plasma (FFP, 1 year).
* **Predictive Wastage Prevention:** Identifies near-expiry stock and triggers one-click reallocation or hospital emergency prioritization before spoilage occurs.
* **Sub-Millisecond Read Speeds:** Redis-cached inventory snapshots with automatic 30-second TTL invalidation on reservations.

### 3. ICU Emergency Blood Dispatch & Two-Phase Lock Matrix
* **Atomic Reservations:** Distributed concurrency locking prevents double-allocation of the same blood bag during simultaneous mass-casualty events.
* **Conflict Detection:** Automated lock matrix and resolution modal whenever concurrent requests contend for identical inventory.

### 4. ML Donor Response & PostGIS Spatial Cascade
* **Geospatial Proximity:** PostGIS spatial radius queries (default 50 km) locate compatible donors based on true coordinates.
* **ML Predictive Matching:** Weights distance, urgency, donor response rate, and historical donation frequency to cascade alerts to the highest-probability responders first.
* **Redis Event Streaming:** Dispatches real-time alerts through `jeevan:donor-alerts` stream with fallback delivery persistence.

### 5. Green Corridor Transit & Cold-Chain Telemetry
* **Optimized Routing:** OSRM-powered route calculation comparing Normal, Green Corridor, and Traffic-Aware logistics paths.
* **Cold-Chain Assurance:** Transit telemetry monitoring required temperature ranges (2°C – 6°C) throughout transport.
* **Cryptographic Handshake Verification:** Time-sensitive OTP exchange between the transit courier and receiving ICU nurse to verify bag handover and generate immutable audit logs.

---

## 🚀 Quick Start

### Option A: Unified Local Launcher (Recommended)

Run both the FastAPI backend and Next.js frontend with a single command:

```powershell
# Using the Python launcher
python run_all.py

# Or using the Windows batch script
.\start_app.bat
```

The launcher automatically:
1. Clears any lingering processes on ports `8000`, `3000`, and `3001`.
2. Starts the **FastAPI Backend** at `http://127.0.0.1:8000`.
3. Starts the **Next.js Frontend** at `http://localhost:3000`.
4. Waits for readiness health checks and automatically opens your browser.

---

### Option B: Docker Compose

```powershell
# 1. Create your environment secrets
docker compose run --build --rm api python -m backend.import_data
docker compose run --build --rm api python -m backend.seed_users
docker compose up --build -d

# Check service health
Invoke-RestMethod -Uri "http://localhost:8080/health"
```

* **Web Portal:** `http://localhost:8080` (or `http://localhost:3000` via Next.js dev server)
* **REST API & Swagger Docs:** `http://127.0.0.1:8000/docs`
* **Health Endpoint:** `http://127.0.0.1:8000/health`

---

## 👥 Demo Accounts & Portals

Use any of these pre-configured accounts in the Centralized Authentication Portal:

| Role | Email | Password | Access & Responsibilities |
| :--- | :--- | :--- | :--- |
| **🏥 ICU Hospital** | `dr.rajesh@jubileemission.org` | `HospitalPassword2026!` | Emergency blood requests, lock matrix, expiry radar |
| **🩸 Voluntary Donor** | `sneha.donor@gmail.com` | `DonorPassword2026!` | Universal donor (O-), alert acknowledgement, donation stats |
| **🩸 Voluntary Donor** | `donor.aarav@gmail.com` | `DonorPassword2026!` | Active donor (B+), local emergency dispatch response |
| **🛵 Transit Courier** | `driver.arun@gmail.com` | `DriverPassword2026!` | Swift Rider #42, Green corridor route, OTP delivery handshake |

---

## 🛠️ API Reference

All protected endpoints require an `Authorization: Bearer <JWT_OR_TOKEN>` or `X-API-Key: <KEY>` header.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service readiness check (Database & Redis status) |
| `POST` | `/api/auth/login` | Unified authentication & JWT token generation |
| `POST` | `/api/auth/register` | Register new voluntary donor accounts |
| `POST` | `/api/auth/phone/send-otp` | Send Indian phone verification OTP |
| `POST` | `/api/auth/phone/verify-otp` | Verify OTP and issue phone verification token |
| `GET` | `/api/availability` | Expiry-aware, reservation-adjusted stock (Redis cached) |
| `GET` | `/api/inventory/expiry-radar` | FEFO/FIFO near-expiry items, summaries, and clinical warnings |
| `POST` | `/api/inventory/prioritize` | Flag near-expiry units for emergency trauma usage |
| `POST` | `/api/inventory/redistribute`| Reallocate vulnerable stock to high-demand trauma centers |
| `POST` | `/api/requests` | Create an emergency ICU blood request |
| `POST` | `/api/requests/{id}/matches` | Spatial + ML donor & blood bank inventory matching |
| `POST` | `/api/requests/{id}/reservations`| Atomically reserve compatible units with two-phase lock |
| `POST` | `/api/routing/optimize` | Calculate Green Corridor transit routes & ETAs |
| `POST` | `/api/dispatch/verify-otp` | Validate delivery OTP handshake between rider and ICU |
| `GET` | `/api/audit` | Comprehensive, filterable healthcare compliance audit trail |

---

## 🧪 Testing & Verification

Run the automated test suites to ensure full system integrity:

```powershell
# Run backend test suite
python -m pytest backend\tests

# Run frontend TypeScript & lint verification
cd frontend
npx tsc --noEmit
```

---

## 📁 Repository Structure

```
JEEVAN/
├── backend/               # FastAPI REST application, models, routing & ML engine
│   ├── main.py            # API routes, middleware & core lifecycle
│   ├── auth.py            # RBAC, JWT, Google OAuth & credential validation
│   ├── ml_donor_model.py  # Machine learning donor response scoring engine
│   ├── spatial_engine.py  # PostGIS & Haversine spatial calculations
│   ├── routing.py         # OSRM Green Corridor route optimizer
│   └── tests/             # Pytest test cases
├── frontend/              # Next.js App Router & Tailwind CSS UI
│   ├── app/               # Application routes (login, dashboards, layouts)
│   ├── components/hemo/   # JEEVAN UI components (Auth, Radar, Lock Matrix, Maps)
│   └── lib/               # Client API callers, auth state & type definitions
├── data/synthetic/        # Demonstration datasets (hospitals, banks, donors, stock)
├── database/              # Schema definitions & SQL migrations
├── scripts/               # Migration and end-to-end demonstration scripts
├── run_all.py             # Single-process unified development launcher
├── compose.yaml           # Production Docker Compose orchestration
└── README.md              # Project documentation
```

---

## 🔒 Security & Medical Disclaimer

* **Operational Aid:** JEEVAN provides operational decision support and logistical dispatch optimization. Qualified clinical staff must verify biological compatibility before every transfusion.
* **Production Deployment:** For public internet deployments, configure HTTPS/TLS, rotate private secrets, restrict network interfaces, and integrate verified SMS/Email notification gateways.
