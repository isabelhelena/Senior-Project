# Lone Star Support

A Texas disaster-information dashboard built with Next.js, MapLibre GL, Supabase PostGIS, and standalone Python ingestion workers for NWS weather alerts, TxDOT roadway conditions, OpenStreetMap emergency facilities, Bluesky social triage, and moderated community reports.

> **Important notice:** Lone Star Support is an informational tool only and is **not** a replacement for 911 or official emergency alerts. Community-submitted and social reports are not independently verified.

## What's included

| Component | Path | Purpose |
| --- | --- | --- |
| **Crisis map** | `/test-map` | MapLibre GL map with NWS alert polygons, TxDOT road conditions, clustered OpenStreetMap shelters/aid, current weather, and reviewed community reports |
| **Community reporting** | `/report` | Citizen incident report form validated against Texas boundaries |
| **Moderation queue** | `/moderation` | Authenticated reviewer dashboard for pending, approved, and rejected reports |
| **Feed diagnostics** | `/`, `/test-feed` | Stored NWS/TxDOT snapshot inspector and ambient weather card |
| **Official alerts worker** | `workers/official/` | Fetches NWS alerts (with affected-zone polygon resolution) and TxDOT Roadway Status into Supabase |
| **Emergency resources seeder** | `workers/emergency_resources/` | Imports Texas OpenStreetMap shelters, food/water, medical, and responder POIs into Supabase |
| **Bluesky worker & demo** | `workers/bluesky/` | Jetstream listener with Gemini extraction, Photon geocoding, and a zero-credential offline demo (`demo.py`) |

## Quickstart

### 1. Run the web app (Node.js 20+)

```bash
npm ci
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
npm run dev
```

Open **http://localhost:3000/test-map**.

To load live database-backed alerts, emergency facilities, and community reports, apply [`schema.sql`](schema.sql) and the migrations in [`supabase/migrations/`](supabase/migrations/) to a Supabase/PostGIS project, then populate `.env.local` using the guides below.

### 2. Run the offline pipeline demo (Python 3.12+, no credentials)

```bash
python workers/bluesky/demo.py
```

Open **http://127.0.0.1:8766** to step through the synthetic Bluesky filter, extraction, and Texas geocoding examples in isolated local SQLite storage (`--port 8767` if `8766` is in use).

## Setup guides & architecture

- [Next.js API routes & `.env.local` setup](documentation/API_Setup.md)
- [System architecture, database & deployment](documentation/Project_Documentation.md)
- [Community reports & moderation setup](documentation/Community_Reports.md)
- [Official NWS/TxDOT ingestion worker](workers/official/README.md)
- [OpenStreetMap emergency resources seeder](workers/emergency_resources/README.md)
- [Bluesky ingestion worker](workers/bluesky/README.md) and [offline demo walkthrough](workers/bluesky/DEMO.md)
- [Crisis map details](src/app/test-map/README.md)
- [Alert classification rules](documentation/Alert_Classification.md)

## Tests

```bash
npm run lint
npm test
npm run test:e2e
python -m unittest discover -s workers/official -p "test_*.py" -v
python -m unittest discover -s workers/bluesky -p "test_*.py" -v
```

See the [Playwright testing guide](documentation/Playwright.md) for browser binary installation and Linux/WSL2 WebGL setup.

## Data attribution

- Weather alerts and observations: [National Weather Service (NWS / NOAA)](https://www.weather.gov/documentation/services-web-api)
- Roadway conditions: [Texas Department of Transportation (TxDOT)](https://www.txdot.gov/)
- Emergency resource POIs & geocoding: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL) via Overpass API and [Photon](https://github.com/komoot/photon)
- Vector basemaps: [CARTO](https://carto.com/basemaps/) (Positron & Dark Matter)
- Postal geocoding: [Zippopotam.us](https://www.zippopotam.us/)

## License

Licensed under the [MIT License](LICENSE).
