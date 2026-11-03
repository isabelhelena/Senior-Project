# Lone Star Support

A Texas disaster-information project with a Next.js map and diagnostics app,
Python workers for NWS, TxDOT, and Bluesky, and an offline classroom demo.

## Current status

- **Official alerts:** NWS and filtered TxDOT Roadway Status data are stored in Supabase, with opt-in 10-minute polling, polygon resolution, and expired/resolved record cleanup.
- **Emergency resources:** Over 21,000 Texas OpenStreetMap facilities (shelters, food/water stations, hospitals/clinics/pharmacies, and fire/police/EMS stations) are seeded in Supabase `emergency_resources` and queried spatially via PostGIS (`get_nearby_emergency_resources`).
- **Social ingestion:** The Bluesky worker filters, extracts, geocodes, and saves reports. Shared category/urgency mappings and an offline demo are implemented.
- **Map:** `/test-map` displays stored official alerts, live nearby OpenStreetMap emergency resources (with WebGL clustering, 5 distinct category icons, keyword search, and viewport auto-fetching), weather, layer controls, and a unified inspection drawer. Bluesky reports intentionally use fixtures. Approved community submissions appear after the community-report migration and configuration are applied.
- **Community reports:** Submission, authenticated moderation, audit history, and approved-report map display are implemented. Supabase setup and live database verification remain required.
- **Tests:** Python worker/demo tests, TypeScript validation/API tests, and focused report/moderation/map browser tests exist. Live database regression and broader milestone coverage remain unfinished.

## To do

Updated against the [milestone progress report](<Milestone Progress Report - Lone Star Support.pdf>) and current code. The report's NWS/TxDOT ingestion task, missing-polygon resolution, and OpenStreetMap emergency resource integration are now complete.

### Connect the remaining data

- **Bluesky map reports intentionally use mocks.** Connecting `social_alerts` and adding freshness/cleanup is optional future scope, not a current completion requirement.
- [x] **Emergency facilities:** Import hospitals, fire stations, water stations, and shelter locations from OSM Overpass into `emergency_resources`; query and display nearby facilities with category filters, clustering, and search.
- [x] **Community submissions and moderation implementation:** `/report` saves pending reports through a validated server endpoint. `/moderation` provides authenticated review, content flags, audited decisions, and database-enforced submission limits. The map displays approved, unexpired submissions separately from the intentional Bluesky fixtures.
- [ ] **Community report deployment verification:** Apply the migration, configure the submission secret and trusted ingress IP header, authorize moderators, and verify database behavior. Follow [community report setup](documentation/Community_Reports.md).

### Finish milestone verification

- [ ] **Integration and security tests:** Extend existing browser/API coverage to the remaining milestone flows and ingestion failures. Run the community-report database regression script in a disposable Supabase/PostGIS environment.
- [ ] **Mobile polish:** Verify map gestures, navigation, drawers, and report forms on small touch screens; fix layout and usability gaps in the existing responsive UI.

## Community reports: Supabase setup

Flow: `/report` → server validation → pending database row → `/moderation` review
→ approved, unexpired report on `/test-map`. Content flags use simple text rules;
publication requires human review. Reports expire 24 hours after submission.

### 1. Apply the database migration

Open the existing project's **SQL Editor** in Supabase. Run the complete contents
of [20261102000000_community_reports.sql](supabase/migrations/20261102000000_community_reports.sql),
including its `begin` and `commit`. It requires the existing schema and earlier
migrations; do not rerun those on an already configured project. This migration
is a one-time operation, not a script to rerun on every startup.

It adds moderation fields, private configuration, moderator and review-history
tables, and restricted database functions. Existing community rows become pending;
Bluesky/social records are unaffected. Keep the permissions and RLS rules supplied
by the migration; the app accesses reports through its database functions.

### 2. Generate and configure the submission secret

Run locally in PowerShell:

```powershell
python -c "import secrets,hashlib; s=secrets.token_hex(32); print('COMMUNITY_REPORT_SECRET='+s); print('Database hash: '+hashlib.sha256(s.encode()).hexdigest())"
```

Keep the first value in root `.env.local`. In SQL Editor, replace the placeholder
below with the printed **Database hash** (the 64-character hash, not the secret):

```sql
update public.community_report_config
set submission_secret_hash = 'YOUR_DATABASE_HASH'
where singleton;
```

Use the same generated pair in both places. Do not commit the secret or paste it
into SQL. It lets Supabase recognize submissions from this app's server.

### 3. Configure the local app

Merge these values into root `.env.local`, preserving existing settings:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
COMMUNITY_REPORT_SECRET=YOUR_GENERATED_SECRET
```

Find the project URL in the project's **Connect** dialog and its publishable key
under **Settings → API Keys**. A legacy anon key is also supported. Do not use a
secret/service-role key here, and do not prefix the submission secret with
`NEXT_PUBLIC_`. See [Supabase's API key guide](https://supabase.com/docs/guides/getting-started/api-keys).

For local `npm run dev`, leave `APP_ORIGIN` and `REPORT_CLIENT_IP_HEADER` unset.
Local submissions share a five-per-hour quota. Production additionally requires
the exact public `APP_ORIGIN` (without a trailing slash) and a single-IP header
overwritten by trusted hosting/proxy infrastructure in `REPORT_CLIENT_IP_HEADER`.
The correct header depends on the deployment; do not choose an arbitrary header
or a comma-separated forwarded chain. Production submissions fail when this is
not configured. See [deployment details](documentation/Community_Reports.md).

### 4. Create and authorize a moderator

In **Authentication → Users**, use **Add user** to create an email/password user
with a confirmed email. The moderation screen requires a working password; an
invitation alone is not enough until password setup is complete. Copy that user's
UUID. Your Supabase dashboard login is separate from this application's Auth user.
See [Supabase user management](https://supabase.com/docs/guides/auth/users).

In SQL Editor, replace the placeholder with that UUID:

```sql
insert into public.community_report_moderators (user_id)
values ('MODERATOR_AUTH_USER_UUID')
on conflict do nothing;
```

Having an Auth account alone does not grant review access; this allowlist does.
To revoke access later, delete only that user's row from this table.

### 5. Verify the complete flow

Restart Next.js after changing `.env.local`:

```powershell
npm run dev
```

1. Open `http://localhost:3000/report` and submit a clearly labeled test report
   with a Texas location. Save the receipt. It should not appear on the public map yet.
2. Open `http://localhost:3000/moderation` and sign in with the moderator's Auth
   email/password. Find the pending report, enter a review note, and approve it.
3. Open `http://localhost:3000/test-map`, navigate to the report location, and allow
   up to one minute for refresh. It should appear as an approved community report.
4. Back in moderation, select the approved filter and reject the test report with
   a cleanup note. After refresh it should disappear from the public map.

In SQL Editor, these read-only checks confirm configuration and saved records:

```sql
select submission_secret_hash is not null as secret_configured
from public.community_report_config where singleton;

select user_id from public.community_report_moderators;

select id, status, created_at, expires_at, reviewed_at
from public.community_reports order by created_at desc limit 10;

select report_id, previous_status, status, notes
from public.community_report_reviews;
```

An invalid-credentials error points to the Auth account/password or email confirmation;
a moderator-access error points to the UUID allowlist. A submission-unavailable error
can indicate missing migration/configuration or a secret/hash mismatch. A rate-limit
error means the five-per-hour quota was reached, including the shared local quota.

Local automated checks cover validation, API behavior, form retries, reviewer flows,
and map display using mocked requests. They do not prove the live database setup.
Run [the SQL regression script](supabase/tests/community_reports.sql) only in a
disposable Supabase/PostGIS database after applying migrations; it rolls back its
test transaction. See [the full feature guide](documentation/Community_Reports.md)
for behavior, permissions, and code walkthrough.

## NWS, TxDOT, and OpenStreetMap ingestion

Python workers store official alerts and OpenStreetMap emergency infrastructure in
Supabase, and the map reads that stored data. NWS zone boundaries are resolved into
polygons. TxDOT excludes open-to-traffic, artificial-centerline, and proposed roads.
Worker runs remove expired/resolved alerts and avoid duplicates. OpenStreetMap
facilities are indexed in `emergency_resources` and queried by radius, category, and
search terms via the `get_nearby_emergency_resources` PostGIS RPC. Current weather
observations are unchanged.

**Setup** (Python 3.12+, from the project root):

1. Apply the Supabase migrations in the SQL Editor if not already applied:
   - [Official ingestion migration](supabase/migrations/20261013000000_official_ingestion.sql)
   - [Emergency resources RPC upgrade migration](supabase/migrations/20261012233500_upgrade_emergency_resources_rpc.sql)
2. Install the official worker dependencies:

   ```powershell
   python -m venv workers/official/.venv
   workers/official/.venv/Scripts/python.exe -m pip install -r workers/official/requirements.txt
   ```

3. Use the example files to configure:
   - `workers/official/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
     `NWS_USER_AGENT` with a contact email or project URL.
   - `workers/emergency_resources/.env`: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
     (used when running `python workers/emergency_resources/seed_emergency_resources.py`).
   - Root `.env.local`: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
     Keep the service-role key in worker environments only. Restart Next.js after changes.

**Polling controls** (PowerShell):

```powershell
.\workers\official\polling.ps1 on      # Refresh now, then every 10 minutes
.\workers\official\polling.ps1 off     # Stop polling
.\workers\official\polling.ps1 status  # Check polling state
.\workers\official\polling.ps1 once    # Refresh once without enabling polling
```

Polling is opt-in; Windows must be awake, online, and signed in. While polling
is off, stored data remains available, expired alerts are hidden, and stale
snapshots are labeled. See [worker documentation](workers/official/README.md)
for checks, logs, and troubleshooting.

Category and urgency conversions are documented in
[alert classification](documentation/Alert_Classification.md). Run `npm test`
to verify the shared mappings and report validation.

## Run the demo

Requires **Python 3.12+**. From the project root:

```powershell
python workers/bluesky/demo.py
```

Open **http://127.0.0.1:8766**. Keep the terminal open; **Ctrl+C** stops it.
No API keys, internet, Node setup, or extra Python packages are needed.

- **Run all three scenarios** shows an accepted Texas report, an irrelevant
  post rejected by filtering, and an ambiguous location rejected before storage.
- Expand the details to inspect extraction, coordinates, and the saved row.
- Rerun the accepted scenario: it keeps one row instead of creating duplicates.
- **Reset demo** clears only demo alerts and history.
- If the port is busy, use `python workers/bluesky/demo.py --port 8767`
  and open http://127.0.0.1:8767.

**Posts and Gemini/Photon responses are fixed examples.** The demo uses real
filtering and validation functions, with separate local SQLite storage.
It never writes to live Supabase. See [presentation steps](workers/bluesky/DEMO.md).

## Major code components

Live flow: `Bluesky → keyword filter → Gemini → Photon → validation → Supabase`.

| File in `workers/bluesky/` | Role                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| `core.py`                  | Keyword filtering, location validation, and a persistent SQLite queue. |
| `worker.py`                | Bluesky listener, Gemini/Photon calls, retries, and Supabase writes.   |
| `demo.py` + `demo.html`    | Offline presentation server, page, and isolated storage.               |
| `demo_scenarios.json`      | Three synthetic posts and fixed service responses.                     |
| `verify_storage.py`        | Live insert/readback, duplicate/update, and cleanup checks.            |

Gemini extracts summary, category, urgency, and **location text**. Photon supplies
coordinates. The location must appear in the post, and there must be one valid
Texas match. City coordinates are labeled approximate. In the demo:

```python
# After the keyword filter passes:
extraction = validate_extraction(scenario["extraction"], scenario["post"])
if extraction:
    coords = resolve_feature(scenario["geocoder"], extraction)
```

Supabase uses the unique post URI to update existing alerts. Coordinates are
stored in longitude/latitude order:

```python
params = {"on_conflict": "bluesky_uri"}
geom = f"SRID=4326;POINT({coords[0]} {coords[1]})"
```

## Live worker and checks

The live worker requires dependencies and local credentials. Follow
[worker setup](workers/bluesky/README.md) to create the virtual environment and
set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` in its
Git-ignored `.env`. After setup:

```powershell
# Check services, then start the live worker:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py --check
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py

# Verify live storage using one temporary record that is removed afterward:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/verify_storage.py

# Test the offline demo without external services:
python -m unittest discover -s workers/bluesky -p test_demo.py -v
```

Service access and Supabase storage checks passed. Demo checks covered scenarios,
replay, reset, and browser controls. The keyword filter can miss some Texas posts;
uncertain locations are skipped.

## Next.js frontend

The Next.js frontend (App Router) provides diagnostic views and the primary geospatial disaster map:

- **Setup**: Run `npm install` (or `npm ci`), then start the development server:
  ```powershell
  npm run dev
  ```
- **Disaster Map Interface (`/test-map`)**:
  Open **http://localhost:3000/test-map**.
  - **Live WebGL Visualization**: GPU-rendered NWS weather polygons (colored by severity), TxDOT road closures with dashed outlines, and clustered OpenStreetMap emergency resource pins with 5 custom category icons.
  - **Shelters & Aid Panel**: Combines verified OpenStreetMap infrastructure (**Shelters & Relief**, **Food & Water**, **Medical**, **Responders**) with unverified **Community Aid** reports, featuring keyword search, **"Search this area"** on map pan, and a toggle for unnamed water taps & park shelters.
  - **Theme-Aware Basemaps**: Dynamically switches between CARTO Dark Matter and Positron (Light) vector basemaps.
  - **Unified Inspection Drawer**: Click any alert, road segment, or aid resource POI to inspect verification status, copyable street addresses, clickable phone numbers, Google Maps directions, official instructions, and spatially matched community reports.
  - **Telemetry Table**: A comprehensive inspector below the map displaying all Texas advisories and loaded aid resources with full text search and click-to-fly navigation.
  - Full details: [src/app/test-map/README.md](src/app/test-map/README.md).
- **Diagnostics Feed (`/test-feed`)**:
  Open **http://localhost:3000/test-feed** to test raw NWS and TxDOT feed responses against local coordinates.
- **E2E Testing (Playwright)**:
  Run end-to-end tests across Chromium, Firefox, and WebKit:
  ```powershell
  npm run test:e2e
  ```
  See [Playwright Testing Guide](documentation/Playwright.md) for full setup instructions on Windows and Linux (including WSL2), headless WebGL requirements, UI mode, and troubleshooting.
