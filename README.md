# Lone Star Support

A Texas disaster-information project with a Next.js diagnostics app, a Python
Bluesky worker, and an offline classroom demo.

## Current status

- **Backend Ingestion**: Standalone Python workers under `workers/bluesky/` ingest, filter, geocode, and persist live Bluesky posts into Supabase PostGIS. The offline presentation demo is complete and repeatable.
- **Geospatial Map Frontend**: The interactive MapLibre WebGL interface under `/test-map` is actively in progress (Phases 1–3 implemented). It renders live NWS weather alert polygons, TxDOT road closures, light/dark vector basemaps, and an inspection drawer with spatial point-in-polygon social filtering. See [test-map documentation](src/app/test-map/README.md).
- **In Progress / Next Steps**: Hooking the live Supabase `social_alerts` table into the map (Phase 4), importing OpenStreetMap shelter POIs, and automated freshness expiry.

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
  Open **http://localhost:3000/test-feed** to test raw NWS and TxDOT feed responses against local coordinates.
