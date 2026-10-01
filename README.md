# JEEVAN backend

FastAPI, PostgreSQL, and Redis services for blood-bank inventory, donor discovery,
hospital requests, geographic/urgency-based matching, reservations, donor-alert
events, and an audit trail.

> **Demo-data warning:** `data/synthetic/*.csv` contains generated demo records
> around Thrissur. The historic `data/raw/private_bloodbanks_0.csv` file is
> imported as a blood-bank directory only: it has old licence dates and no
> verified coordinates or live inventory, so it is never treated as nearby
> stock. Synthetic records are marked in API responses and in the database.
> Matching is an operational aid, not clinical compatibility advice; have
> qualified staff verify every match before transfusion.

## Run with Docker Compose (recommended)

Install Docker Desktop, then from the repository root create your own ignored
`.env.local` file. This project already has an `.env` directory, so use the
separate `.env.local` file rather than renaming or overwriting that directory.
Generate URL-safe random secrets locally in PowerShell (32 random bytes per
secret); they are never printed or sent to this chat:

```powershell
function New-JeevanSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
$apiKey = New-JeevanSecret
$databasePassword = New-JeevanSecret
@(
    "JEEVAN_API_KEY=$apiKey"
    "POSTGRES_USER=jeevan"
    "POSTGRES_PASSWORD=$databasePassword"
    "POSTGRES_DB=jeevan"
) | Set-Content -Encoding ascii .env.local
git check-ignore .env.local

docker compose --env-file .env.local run --build --rm api python -m backend.import_data
docker compose --env-file .env.local up --build -d
```

Keep `$apiKey` in the same PowerShell session to call protected endpoints:

```powershell
$headers = @{ "X-API-Key" = $apiKey }
Invoke-RestMethod -Uri "http://localhost:8000/api/availability" -Headers $headers
```

Open <http://localhost:8000/docs>. `GET /` and `GET /health` are public; all
`/api/*` routes require the `X-API-Key` header set to `JEEVAN_API_KEY`. Use the
same header in Swagger's **Authorize** dialog. Never put this shared key into
frontend JavaScript, a browser app, source control, screenshots, or support
messages; anyone who gets it can use every protected endpoint. Never commit
`.env.local` or replace the placeholders in `.env.example` with real credentials.
PostgreSQL tables are created automatically at API startup. The import command
is idempotent and can be run again to update records with matching CSV IDs.

## Run against local PostgreSQL and Redis

Create an empty PostgreSQL database and start Redis. Generate the secret file as
above, then use the same `$apiKey` and `$databasePassword` variables in that
PowerShell session:

```powershell
py -m venv backend\venv
.\backend\venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
$env:DATABASE_URL = "postgresql+psycopg://jeevan:$databasePassword@localhost:5432/jeevan"
$env:REDIS_URL = "redis://localhost:6379/0"
$env:JEEVAN_API_KEY = $apiKey
python -m backend.import_data
python -m uvicorn backend.main:app --reload
```

The application also reads environment settings from a project-root `.env` file
or `backend/.env` file if present; Compose reads `.env.local` using the explicit
`--env-file` option above. `.gitignore` excludes local `.env` files and the
backend virtual environment. For a **real/public deployment**, this single
shared API key is only suitable for a trusted local demo: replace it with
individual user/service authentication and role-based authorization, add key
rotation/revocation, HTTPS, request throttling, restricted network access,
managed PostgreSQL/Redis credentials, backups, monitoring, and versioned
database migrations. Do not load the generated Thrissur demo records or
historical licence directory as live data. Real donor data needs consent and
access controls; current inventory, bank licence status, and coordinates must
come from verified sources. Configure a real SMS/email notification provider;
the current service only queues events to Redis for a consumer to deliver.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | PostgreSQL and Redis readiness |
| `GET` | `/api/donors` | Eligible, blood-group-compatible donor search; optional radius |
| `GET` | `/api/availability` | Expiry-aware, reservation-adjusted stock; Redis cached for 30 seconds |
| `GET` | `/api/blood-banks/nearby` | Geographic search of banks with coordinates |
| `GET` | `/api/hospitals` | Hospital directory |
| `POST` | `/api/requests` | Create a tracked hospital request |
| `GET` | `/api/requests` and `/api/requests/{id}` | Track and inspect requests and reservations |
| `PATCH` | `/api/requests/{id}/status` | Advance request status with transition checks |
| `POST` | `/api/requests/{id}/matches` | Persist scored donor and stock matches (50 km default radius) |
| `POST` | `/api/requests/{id}/reservations` | Atomically reserve compatible, unexpired units |
| `DELETE` | `/api/reservations/{id}` | Release an active reservation |
| `POST` | `/api/requests/{id}/alerts` | Persist alerts and publish events to the Redis stream |
| `GET` | `/api/donors/{id}/alerts` | Read donor alerts |
| `POST` | `/api/alerts/{id}/acknowledge` | Acknowledge a donor alert |
| `GET` | `/api/audit` | Filterable audit trail |

Use the OpenAPI documentation at `/docs` for query parameters and request
schemas. Include `X-API-Key: <JEEVAN_API_KEY>` in API requests. Donor-alert
events are written to the Redis stream `jeevan:donor-alerts`; a notification
provider/consumer can read that stream and deliver SMS, email, or push messages.
Alerts are committed to PostgreSQL first, so a Redis outage leaves them in
`pending` delivery state instead of silently dropping them.

Geographic distances use the Haversine formula. Match ranking combines distance,
donor response rate, and request urgency; it is a transparent heuristic and not
a medical scoring model. Reservations expire automatically in a background
worker and are also excluded from availability as soon as their expiry time
passes. Reservation and request changes are written to the audit log.

## Data import

The importer reads all nine generated CSV files in `data/synthetic/`, then
imports the 199-record legacy directory from
`data/raw/private_bloodbanks_0.csv` using Windows-1252 decoding. It converts
typed fields, stores synthetic/source provenance, keeps legacy licence dates,
and leaves absent coordinates empty rather than inventing locations.

```powershell
python -m backend.import_data
python -m backend.import_data --skip-raw-banks
python -m backend.import_data --synthetic-dir "C:\path\to\csvs"
```

The schema includes hospitals, blood banks, donors, inventory, requests,
matches, reservations, alerts, and audit logs. `create_all` initializes new
databases; use a versioned migration tool before evolving an existing
production schema.

## Tests

```powershell
python -m pip install -r backend\requirements-dev.txt
python -m pytest backend\tests
```
