# Emergency resources seeder

Python 3.10+ script that fetches Texas emergency infrastructure from the OpenStreetMap Overpass API and upserts facilities into Supabase `public.emergency_resources`. This is a batch seeding script separate from Next.js.

## Setup

1. Apply [schema.sql](../../schema.sql) and [the emergency resources RPC migration](../../supabase/migrations/20261012233500_upgrade_emergency_resources_rpc.sql) in the Supabase SQL Editor if not already applied.
2. Create a Python virtual environment and install dependencies:

   **Windows (PowerShell):**
   ```powershell
   python -m venv workers/emergency_resources/.venv
   workers/emergency_resources/.venv/Scripts/python.exe -m pip install -r workers/emergency_resources/requirements.txt
   Copy-Item workers/emergency_resources/.env.example workers/emergency_resources/.env
   ```

   **Linux / macOS:**
   ```bash
   python3 -m venv workers/emergency_resources/.venv
   workers/emergency_resources/.venv/bin/python -m pip install -r workers/emergency_resources/requirements.txt
   cp workers/emergency_resources/.env.example workers/emergency_resources/.env
   ```

3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `workers/emergency_resources/.env`. Both `.env` and `.venv/` are ignored by Git. Keep the service-role key out of Next.js and `NEXT_PUBLIC_*` variables.

## Run

**Windows (PowerShell):**
```powershell
workers/emergency_resources/.venv/Scripts/python.exe workers/emergency_resources/seed_emergency_resources.py
```

**Linux / macOS:**
```bash
workers/emergency_resources/.venv/bin/python workers/emergency_resources/seed_emergency_resources.py
```

Alternatively, `seed_emergency_resources.py` includes PEP 723 inline dependency metadata (`requests`, `supabase`, `python-dotenv`) and can be run with `uv run workers/emergency_resources/seed_emergency_resources.py` when environment variables are exported.

## Data and processing

- **Upstream endpoints:** Queries `https://overpass-api.de/api/interpreter` and falls back to `https://maps.mail.ru/osm/tools/overpass/api/interpreter` (`timeout: 180` Overpass query, `200s` HTTP timeout) for `ISO3166-2="US-TX"` (`admin_level=4`).
- **Resource types mapped:** `hospital`, `clinic`, `pharmacy`, `doctor`, `ambulance_station`, `fire_station`, `police_station`, `shelter`, `disaster_response`, `assembly_point`, `food_bank`, `soup_kitchen`, `community_centre`, `drinking_water`, and `other`.
- **Unnamed nodes:** Facilities lacking both `name` and `operator` tags are labeled `Unnamed <Resource Type>` and hidden by default in `get_nearby_emergency_resources` unless `include_unnamed=true` is requested.
- **Upserts:** Records are written in batches of `400` with up to `3` attempts (`1s`, `2s` backoff) using `on_conflict="osm_id"` and `SRID=4326;POINT(lon lat)`.
- **Attribution:** OpenStreetMap data is © OpenStreetMap contributors (ODbL).
