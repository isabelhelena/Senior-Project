# Lone Star Support

A Texas disaster-information project with a Next.js map and diagnostics app,
Python workers for NWS, TxDOT, and Bluesky, and an offline classroom demo.

## Current status

- **Official alerts:** NWS and filtered TxDOT Roadway Status data are stored in Supabase, with opt-in 10-minute polling, polygon resolution, and expired/resolved record cleanup.
- **Social ingestion:** The Bluesky worker filters, extracts, geocodes, and saves reports. Shared category/urgency mappings and an offline demo are implemented.
- **Map:** `/test-map` displays stored official alerts, weather, layer controls, and an inspection drawer. Social and aid-resource markers still use fixtures.
- **Tests:** Python worker/demo tests and TypeScript classification/validation tests exist; browser and API security coverage remains unfinished.

## To do

Updated against the [milestone progress report](<Milestone Progress Report - Lone Star Support.pdf>) and current code. The report's NWS/TxDOT ingestion task and missing-polygon resolution are now complete.

### Connect the remaining data

- [ ] **Live social map:** Read `social_alerts` through a server endpoint, apply the shared mappings, and replace mock markers. Add freshness filtering and expired-report cleanup.
- [ ] **Emergency facilities:** Import hospitals, fire stations, and shelter locations from OSM Overpass into `emergency_resources`; query and display nearby facilities.
- [ ] **Community submissions:** Connect `/report` to validated server-side persistence in `community_reports`, then display accepted reports. The current form only validates locally.
- [ ] **Moderation:** Add content filtering, submission rate limits, and an authenticated review interface for community reports.

### Finish milestone verification

- [ ] **Integration and security tests:** Add the planned Playwright/Pytest coverage for browser flows, API validation, database access permissions, and ingestion failures. Keep existing unit tests.
- [ ] **Mobile polish:** Verify map gestures, navigation, drawers, and report forms on small touch screens; fix layout and usability gaps in the existing responsive UI.

## NWS and TxDOT ingestion

Python workers now store official alerts in Supabase, and the map reads that
stored data. NWS zone boundaries are resolved into polygons. TxDOT excludes
open-to-traffic, artificial-centerline, and proposed roads. Worker runs remove
expired/resolved alerts and avoid duplicates. Current weather observations are unchanged.

**Setup** (Python 3.12+, from the project root):

1. Apply [the migration](supabase/migrations/20261013000000_official_ingestion.sql)
   in Supabase SQL Editor if not already applied. The existing project is set up.
2. Install the worker dependencies:

   ```powershell
   python -m venv workers/official/.venv
   workers/official/.venv/Scripts/python.exe -m pip install -r workers/official/requirements.txt
   ```

3. Use the example files to configure:
   - `workers/official/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
     `NWS_USER_AGENT` with a contact email or project URL.
   - Root `.env.local`: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
     Keep the service-role key in the worker only. Restart Next.js after changes.

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
  - **Live WebGL Visualization**: GPU-rendered NWS weather polygons (colored by severity) and TxDOT road closures with dashed outlines.
  - **Theme-Aware Basemaps**: Dynamically switches between CARTO Dark Matter and Positron (Light) vector basemaps.
  - **Inspection Drawer**: Click any alert or road segment to inspect official instructions, affected counties, countdown timers, and spatially matched community reports.
  - **Telemetry Table**: A comprehensive inspector below the map displaying all Texas advisories (including non-polygon county bulletins) with full text search and click-to-fly navigation.
  - Full details: [src/app/test-map/README.md](src/app/test-map/README.md).
- **Diagnostics Feed (`/test-feed`)**:
  Open **http://localhost:3000/test-feed** to inspect statewide NWS and TxDOT snapshots stored in Supabase. Current weather observations still use the selected coordinates.
