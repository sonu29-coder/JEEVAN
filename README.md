# JEEVAN --- Blood Availability & Donor Network

JEEVAN is a self-hosted blood availability website and API designed to
help users find blood availability, search for compatible donor records,
track hospital requests, reserve inventory, and manage donor alerts.

The project uses a Next.js frontend, a FastAPI backend, PostgreSQL for
persistent data, Redis for caching and event delivery, and Caddy as a
reverse proxy when run with Docker Compose.

> **Important:** JEEVAN currently includes demo data and demo
> identity-verification behavior. It must not be represented as a live
> blood-bank inventory service or a real government-ID verification
> service unless those integrations have been independently configured
> and verified. All transfusion decisions and matches must be checked by
> qualified medical staff.

## Deployment Link


## Features

-   Blood availability lookup with expiry-aware and reservation-adjusted
    stock.
-   Donor search using blood-group compatibility filters and optional
    distance radius.
-   Nearby blood-bank search for records that have coordinates.
-   Hospital directory and tracked blood requests.
-   Request status updates with transition checks.
-   Donor and stock match records for requests.
-   Reservation creation and release for compatible, unexpired
    inventory.
-   Donor alerts persisted in PostgreSQL and published to a Redis stream
    for delivery consumers.
-   Audit records for request and reservation changes.
-   API documentation through FastAPI's OpenAPI/Swagger interface.
-   Docker Compose setup for the frontend, backend, database, Redis, and
    reverse proxy.

Availability and matching results depend on the data loaded into the
database. Demo records are not a source of live clinical inventory.

## Technology stack

  -----------------------------------------------------------------------
  Layer                   Technology              Purpose
  ----------------------- ----------------------- -----------------------
  Frontend                Next.js                 Web interface

  Backend                 FastAPI, Python         REST API and
                                                  application logic

  Database                PostgreSQL              Persistent application
                                                  records

  Cache / event stream    Redis                   Availability caching
                                                  and donor-alert events

  Reverse proxy           Caddy                   Routes browser-facing
                                                  requests to services

  Local deployment        Docker Compose          Runs the application
                                                  services

  API schema              OpenAPI / Swagger UI    API exploration and
                                                  testing
  -----------------------------------------------------------------------

## Project components

The repository contains the following key components and paths:

  -------------------------------------------------------------------------
  Path / component                      Purpose
  ------------------------------------- -----------------------------------
  Frontend (Next.js application)        User interface and same-origin API
                                        requests

  `backend/`                            FastAPI application, import
                                        utilities, and tests

  `backend/main.py`                     FastAPI application entry point
                                        (`backend.main:app`)

  `backend/requirements.txt`            Backend runtime dependencies

  `backend/requirements-dev.txt`        Backend development/test
                                        dependencies

  `backend/tests/`                      Backend tests

  `data/synthetic/`                     Generated CSV records used for
                                        demos

  `data/raw/private_bloodbanks_0.csv`   Legacy blood-bank directory data

  `database/migrations/`                Versioned SQL migrations

  `.env.example`                        Example environment configuration;
                                        keep placeholders non-secret

  `compose.yaml` / Docker Compose       Service orchestration, if present
  configuration                         in the repository
  -------------------------------------------------------------------------

> Keep the repository's actual folder names as they exist in your
> checkout. This README does not assume that a separate frontend folder
> name or a public deployment URL has been confirmed.

## Architecture

``` text
Browser
  |
  v
Caddy reverse proxy (default local port 8080)
  |----------------------|
  v                      v
Next.js frontend      FastAPI backend
                         |
              |----------|-----------|
              v          v           v
          PostgreSQL    Redis    API/event logic
                                     |
                                     v
                         Redis donor-alert stream
                         (delivery consumer/provider
                          must be configured separately)
```

The Next.js development server proxies same-origin `/api/*` requests to
`http://localhost:8000`. In Docker Compose, Caddy routes API requests to
FastAPI.

## Prerequisites

-   Git
-   Docker Desktop with Docker Compose (recommended)
-   PowerShell on Windows for the commands below
-   Python 3.11+ if running the backend outside Docker, matching the
    project's dependency requirements
-   PostgreSQL and Redis if running the backend locally without Docker

## Run JEEVAN with Docker

Run the following commands from the repository root in PowerShell.

### 1. Create your local environment file

Create `.env.local` in the repository root. It must remain untracked by
Git. Do not overwrite an existing `.env` directory.

Generate local secrets with PowerShell:

``` powershell
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
```

The final command should show that `.env.local` is ignored. If it is not
ignored, stop and fix `.gitignore` before committing.

### 2. Import data and seed demo users

``` powershell
docker compose --env-file .env.local run --build --rm api python -m backend.import_data
docker compose --env-file .env.local run --build --rm api python -m backend.seed_users
```

### 3. Build and start the application

``` powershell
docker compose --env-file .env.local up --build -d
docker compose --env-file .env.local ps
```

### 4. Open JEEVAN

-   Website: <http://localhost:8080>
-   API documentation: <http://localhost:8080/docs>
-   Health check: <http://localhost:8080/health>

These addresses are for a local deployment on the same machine. They are
not public hosting links.

To stop the services:

``` powershell
docker compose --env-file .env.local down
```

To stop the services and also delete the database volume, use
`docker compose down -v` only if you intentionally want to remove
persisted local data.

## Run the backend locally

Use this path if you already have PostgreSQL and Redis running locally.
Create an empty PostgreSQL database and start Redis first.

``` powershell
py -m venv backend\venv
.\backend\venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Set the connection settings in the same PowerShell session. Replace the
values with your local configuration; do not commit credentials.

``` powershell
$env:DATABASE_URL = "postgresql+psycopg://jeevan:<DATABASE_PASSWORD>@localhost:5432/jeevan"
$env:REDIS_URL = "redis://localhost:6379/0"
$env:JEEVAN_API_KEY = "<YOUR_LOCAL_API_KEY>"
python -m backend.import_data
python -m uvicorn backend.main:app --reload
```

The backend normally runs at `http://localhost:8000`; open
`http://localhost:8000/docs` for its API documentation. The frontend
development server and its exact start command should be taken from the
frontend package scripts in this repository.

## Environment variables and API keys

JEEVAN uses environment variables for secrets and service configuration.
Keep real values in a local environment file or deployment secret
manager.

  ---------------------------------------------------------------------------
  Variable                    Purpose                 Secret?
  --------------------------- ----------------------- -----------------------
  `JEEVAN_API_KEY`            Shared API key for      **Yes**
                              protected API routes    

  `POSTGRES_USER`             PostgreSQL username     Treat as configuration

  `POSTGRES_PASSWORD`         PostgreSQL password     **Yes**

  `POSTGRES_DB`               PostgreSQL database     No
                              name                    

  `JEEVAN_HOST_IP`            Host interface to bind  No
                              the published service   
                              to                      

  `JEEVAN_HOST_PORT`          Browser-facing port;    No
                              default shown here is   
                              `8080`                  

  `DATABASE_URL`              Backend PostgreSQL      **Contains
                              connection string for   credentials**
                              local runs              

  `REDIS_URL`                 Redis connection URL    May contain credentials
                                                      in some deployments

  `IDENTITY_PROVIDER_MODE`    Identity-verification   No
                              integration mode; the   
                              documented default is   
                              `demo`                  

  `IDENTITY_WEBHOOK_SECRET`   HMAC secret used to     **Yes**
                              validate signed         
                              identity webhooks       
  ---------------------------------------------------------------------------

### API key usage

Protected API routes require the `X-API-Key` header. In the same
PowerShell session where `$apiKey` was generated:

``` powershell
$headers = @{ "X-API-Key" = $apiKey }
Invoke-RestMethod -Uri "http://localhost:8080/api/availability" -Headers $headers
```

Alternatively, use Swagger UI at `/docs` and enter the key in the
**Authorize** dialog.

**Never put `JEEVAN_API_KEY`, database passwords, webhook secrets, or
provider credentials in frontend JavaScript, public repository files,
screenshots, or client-side environment variables.** The shared API key
is suitable only for a trusted self-hosted demo; it is not a replacement
for individual user authentication and role-based authorization.

### External provider credentials

The documented configuration does not establish that production SMS OTP,
email delivery, push notifications, Google sign-in, or a real identity
provider is connected. Add provider-specific variables only after
choosing and configuring a provider; document their names without
publishing their values.

## API documentation and endpoints

Use `/docs` for complete request schemas, query parameters, and response
models. Protected routes require `X-API-Key: <JEEVAN_API_KEY>`.

  ------------------------------------------------------------------------------------
  Method                  Endpoint                            Purpose
  ----------------------- ----------------------------------- ------------------------
  `GET`                   `/health`                           Check PostgreSQL and
                                                              Redis readiness

  `GET`                   `/api/donors`                       Search eligible,
                                                              blood-group-compatible
                                                              donor records; optional
                                                              radius

  `GET`                   `/api/availability`                 Read expiry-aware,
                                                              reservation-adjusted
                                                              stock

  `GET`                   `/api/blood-banks/nearby`           Geographic search for
                                                              banks with coordinates

  `GET`                   `/api/hospitals`                    Read the hospital
                                                              directory

  `POST`                  `/api/requests`                     Create a tracked
                                                              hospital request

  `GET`                   `/api/requests`                     List requests

  `GET`                   `/api/requests/{id}`                Inspect a request and
                                                              its reservations

  `PATCH`                 `/api/requests/{id}/status`         Update request status
                                                              with transition checks

  `POST`                  `/api/requests/{id}/matches`        Persist scored donor and
                                                              stock matches

  `POST`                  `/api/requests/{id}/reservations`   Reserve compatible,
                                                              unexpired inventory

  `DELETE`                `/api/reservations/{id}`            Release an active
                                                              reservation

  `POST`                  `/api/requests/{id}/alerts`         Persist alerts and
                                                              publish Redis events

  `GET`                   `/api/donors/{id}/alerts`           Read donor alerts

  `POST`                  `/api/alerts/{id}/acknowledge`      Acknowledge a donor
                                                              alert

  `GET`                   `/api/audit`                        Read a filterable audit
                                                              trail
  ------------------------------------------------------------------------------------

Implementation notes:

-   Availability results are cached in Redis for 30 seconds.
-   Donor-alert events are written to the Redis stream
    `jeevan:donor-alerts`.
-   Alerts are stored in PostgreSQL first. If Redis is unavailable, an
    alert can remain pending delivery rather than being silently
    discarded.
-   A notification consumer and real SMS/email/push provider must be
    configured separately to deliver messages to people.
-   Geographic distance uses the Haversine formula. Match ranking
    considers distance, donor response rate, and request urgency; it is
    an operational heuristic, not a medical scoring model.
-   Reservations expire automatically in a background worker and expired
    reservations are excluded from availability.

## Donor identity verification

The documented default is `IDENTITY_PROVIDER_MODE=demo`. This is **not**
Aadhaar verification, government-ID verification, or proof of a person's
real-world identity. The demo flow does not collect identity numbers,
identity images, or OTPs. Demo requests remain pending until a valid
signed verification webhook is received.

For an existing database, the versioned SQL migration can be applied
from PowerShell:

``` powershell
Get-Content -Raw database\migrations\001_donor_identity_verifications.sql |
  docker compose --env-file .env.local exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

The webhook uses `IDENTITY_WEBHOOK_SECRET` to validate the exact raw
JSON body with HMAC-SHA256 and the Unix timestamp. It expects
`X-Identity-Signature: sha256=<digest>` and `X-Identity-Timestamp`;
signatures older than five minutes are rejected. This is an integration
boundary for a demo, not a connection to a real identity provider. A
production integration requires an authorized provider and proper
callback validation.

## Data and demo records

-   `data/synthetic/*.csv` contains generated demo records around
    Thrissur.
-   `data/raw/private_bloodbanks_0.csv` is a historical 199-record
    blood-bank directory. It includes old licence dates and does not
    provide verified coordinates or live inventory.
-   Synthetic records are marked with their provenance in API responses
    and the database.
-   Missing coordinates are left empty rather than guessed.
-   Do not present generated records or the historical directory as
    verified, current blood availability.

Import commands:

``` powershell
python -m backend.import_data
python -m backend.import_data --skip-raw-banks
python -m backend.import_data --synthetic-dir "C:\path\to\csvs"
```

The importer processes generated CSV files and the legacy directory. The
import command is idempotent for matching CSV IDs and can be run again
to update records.

## Tests

Install the development dependencies:

``` powershell
python -m pip install -r backend\requirements-dev.txt
```

Run all backend tests:

``` powershell
python -m pytest backend\tests
```

Run the focused donor identity verification tests:

``` powershell
python -m pytest backend\tests\test_identity_verification.py
```

## Deployment links

Add your actual public URLs here after deploying and testing the
application. Do not use localhost URLs as public deployment links.

-   **Live website:** `ADD_YOUR_DEPLOYED_FRONTEND_URL`
-   **Public API base URL:** `ADD_YOUR_DEPLOYED_API_URL`
-   **API documentation:** `ADD_YOUR_DEPLOYED_API_URL/docs`
-   **Health check:** `ADD_YOUR_DEPLOYED_API_URL/health`
-   **GitHub repository:** `ADD_YOUR_GITHUB_REPOSITORY_URL`
-   **Demo video (optional):** `ADD_YOUR_DEMO_VIDEO_URL`

If the frontend and API are served behind one domain, document that
domain and its relevant `/docs` and `/health` paths. Replace every
placeholder above before describing the app as publicly deployed.

## Security and production readiness

Before exposing JEEVAN to the public internet:

1.  Replace the shared demo API key with individual authentication,
    authorization, and role-based access controls.
2.  Use HTTPS and secure cookie/session handling where applicable.
3.  Store credentials in deployment secrets, rotate them, and restrict
    access to them.
4.  Configure request throttling, network restrictions, logging,
    monitoring, backups, and database migrations.
5.  Connect and test a real notification provider and delivery consumer
    before claiming SMS, email, or push notifications are working.
6.  Verify donor consent, data access permissions, inventory freshness,
    blood-bank licence status, and location data.
7.  Keep demo and synthetic records clearly separated from verified
    operational data.
8.  Have qualified medical personnel validate all clinical workflows;
    software matching is not a substitute for clinical compatibility
    checks.

Do not commit `.env.local`, real API keys, database passwords, webhook
secrets, access tokens, or provider credentials. Keep `.env.example`
limited to placeholders.

## Troubleshooting

**The website does not open**

``` powershell
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs --tail=100
```

Check that Docker Desktop is running and that the configured host port
is not already in use.

**The API returns an authorization error**

Check that the `X-API-Key` header contains the same value as
`JEEVAN_API_KEY` in the backend environment. Do not expose the key in
frontend code.

**The API health check fails**

Check the API, PostgreSQL, and Redis container logs and confirm the
configured database and Redis URLs are correct.

**Donor alerts are created but no SMS arrives**

The API persists alert events and writes them to Redis; delivery
requires a consumer and a configured real SMS/email/push provider.
Creating an alert does not by itself guarantee that a message has been
sent.

**The data looks unrealistic or outdated**

The included CSV files are demo and historical sources. Import verified,
authorized data before using the app for operational decisions.

## Contributing

1.  Create a branch for your change.
2.  Keep credentials and personal data out of commits.
3.  Run the relevant tests.
4.  Describe the change and any configuration or migration requirements
    in your pull request.

## License

Add the project's chosen license before distributing or reusing this
code. Until a license is added to the repository, do not assume that the
code is available under an open-source license.
