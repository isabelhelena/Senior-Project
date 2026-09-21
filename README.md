# Lone Star Support

A Texas disaster-information project with a Next.js diagnostics app, a Python
Bluesky worker, and an offline classroom demo.

## Current status

The backend for collecting and storing posts is built, and its parts have been
tested separately. The offline demo is repeatable. Still to finish: showing live
alerts on a map, automatically expiring old alerts, and demonstrating one real
Bluesky post moving through the entire pipeline into Supabase.

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

| File in `workers/bluesky/` | Role |
| --- | --- |
| `core.py` | Keyword filtering, location validation, and a persistent SQLite queue. |
| `worker.py` | Bluesky listener, Gemini/Photon calls, retries, and Supabase writes. |
| `demo.py` + `demo.html` | Offline presentation server, page, and isolated storage. |
| `demo_scenarios.json` | Three synthetic posts and fixed service responses. |
| `verify_storage.py` | Live insert/readback, duplicate/update, and cleanup checks. |

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

## Next.js app

The Next.js app shows weather/road diagnostics: run `npm ci`, then `npm run dev`,
and open http://localhost:3000. It runs separately from the offline demo and does
not yet display live Bluesky alerts.
