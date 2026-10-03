# JEEVAN

Self-hosted blood availability website and API. Docker Compose runs the Next.js
frontend, FastAPI backend, PostgreSQL, Redis, and a Caddy reverse proxy behind a
single browser-facing address.

> **Demo-data warning:** `data/synthetic/*.csv` contains generated demo records
> around Thrissur. The historic `data/raw/private_bloodbanks_0.csv` file is
> imported as a blood-bank directory only: it has old licence dates and no
> verified coordinates or live inventory, so it is never treated as nearby
> stock. Synthetic records are marked in API responses and in the database.
> Matching is an operational aid, not clinical compatibility advice; have
> qualified staff verify every match before transfusion.

## Run the whole website and API on one host

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
$identityWebhookSecret = New-JeevanSecret
@(
    "JEEVAN_API_KEY=$apiKey"
    "POSTGRES_USER=jeevan"
    "POSTGRES_PASSWORD=$databasePassword"
    "POSTGRES_DB=jeevan"
    "JEEVAN_HOST_IP=127.0.0.1"
    "JEEVAN_HOST_PORT=8080"
    "IDENTITY_PROVIDER_MODE=demo"
    "IDENTITY_WEBHOOK_SECRET=$identityWebhookSecret"
) | Set-Content -Encoding ascii .env.local
git check-ignore .env.local

docker compose --env-file .env.local run --build --rm api python -m backend.import_data
docker compose --env-file .env.local run --build --rm api python -m backend.seed_users
docker compose --env-file .env.local up --build -d
```

Open the website at <http://localhost:8080>. The API documentation is at
<http://localhost:8080/docs>, and the public service health check is at
<http://localhost:8080/health>. By default the site binds only to this
machine. Change `JEEVAN_HOST_PORT` to choose another port. To allow access from
other machines, set `JEEVAN_HOST_IP` to the host's network interface address;
do not expose the demo API over an untrusted network.

The API docs' **Authorize** dialog accepts the API key generated above. The
protected API routes require `X-API-Key`; the key stays in the backend
environment and must never be put in browser JavaScript. For example, in the
same PowerShell session:

```powershell
$headers = @{ "X-API-Key" = $apiKey }
Invoke-RestMethod -Uri "http://localhost:8080/api/availability" -Headers $headers
```

The website is a demo UI with local sample state and demo role switching; those
demo roles are not API accounts. Use the protected API and its docs for persisted
backend operations. The shared API key is suitable only for a trusted,
self-hosted demo. Do not expose this stack to the public internet without
individual user authentication, authorization, HTTPS, and other production
controls. Never commit `.env.local` or replace the placeholders in
`.env.example` with real credentials. PostgreSQL tables are created
automatically at API startup. The import command is idempotent and can be run
again to update records with matching CSV IDs.

### Donor identity verification

The donor dashboard includes identity verification, with statuses scoped to the
signed-in, active donor account. A registered donor account must exist in
PostgreSQL; seed the local demo users with the command above or register an
account through `/api/auth/register`. The default `IDENTITY_PROVIDER_MODE=demo`
is explicitly **not** Aadhaar or government-ID verification: it does not
collect identity numbers, images, or OTPs. Demo requests remain pending until a
valid signed verification webhook is received. Do not present demo results as
real-world identity proof.

`IDENTITY_WEBHOOK_SECRET` must be a private random secret of at least 32
characters for signed webhooks; it is never sent to the browser. To apply the
explicit PostgreSQL migration to an existing database before deployment:

```powershell
Get-Content -Raw database\migrations\001_donor_identity_verifications.sql |
  docker compose --env-file .env.local exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

The API's existing `create_all` startup also creates this new table for local
databases; the SQL file is the versioned migration for controlled deployments.
The table contains only `user_id`, `verification_status`, `provider`,
`provider_reference`, and `verified_at`. Its primary key prevents duplicate
verification rows per account; the existing unique user email constraint
prevents duplicate email accounts.

The webhook accepts only `provider_reference` and `status` (`verified` or
`failed`). Sign its exact raw JSON body with
`HMAC-SHA256(IDENTITY_WEBHOOK_SECRET, "<unix-timestamp>.<raw-body>")`, send the
hex digest as `X-Identity-Signature: sha256=<digest>`, and send the timestamp in
`X-Identity-Timestamp`. Signatures older than five minutes are rejected. This
endpoint is a DEMO integration boundary, not a real provider connection; select
and contract with an authorized provider before implementing production
redirects, credentials, callback validation, or claiming real verification.

The Next.js dev server proxies same-origin `/api/*` requests to
`http://localhost:8000`; Docker Compose's Caddy routes them directly to FastAPI.
Run the focused feature tests with:

```powershell
python -m pytest backend\tests\test_identity_verification.py
```

After setting `.env.local`, launch and check the full stack with:

```powershell
docker compose --env-file .env.local up --build -d
docker compose --env-file .env.local ps
Invoke-RestMethod -Uri "http://localhost:8080/health"
```

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
