# Local Bluesky ingestion

Python 3.12+ worker: Bluesky Jetstream → disaster/Texas keyword filter → Gemini structured extraction → Photon geocoding → existing Supabase `public.social_alerts` table. This runs separately from Next.js; keep the terminal open while collecting posts. No Bluesky login is needed. No database migration is required.

For a repeatable classroom presentation, run `python workers/bluesky/demo.py` and open
http://127.0.0.1:8766. See [the offline demo walkthrough](DEMO.md). It uses synthetic
examples and isolated local storage, with no external requests or credentials.

## Setup (PowerShell, from the repository root)

```powershell
python -m venv workers/bluesky/.venv
workers/bluesky/.venv/Scripts/python.exe -m pip install -r workers/bluesky/requirements.txt
# Only for new installations; do not overwrite an existing credentials file:
Copy-Item workers/bluesky/.env.example workers/bluesky/.env
```

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY` in `workers/bluesky/.env`. The file, virtual environment, and runtime data are ignored by Git. The service-role key belongs only in this local worker, never a browser or `NEXT_PUBLIC_` variable. The table must be exposed through Supabase's Data API with service-role read/write access and its existing PostGIS `geom` column.

## Verify and run

```powershell
# Table read access, model availability, geocoding, and Jetstream reception:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py --check

# Live storage test: inserts/updates one labeled temporary row, then deletes it:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/verify_storage.py

# Uses one Gemini request and may geocode, but NEVER writes a sample to Supabase:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py --sample "Flooding has closed roads across San Antonio, Texas. Residents report stranded vehicles."

# Run until Ctrl+C; real qualifying posts are written to Supabase:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py

# Alternatively, run for a bounded interval:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py --seconds 60

# Inspect local processing counts in another terminal:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py --status

# After resolving a transient problem, requeue failed work:
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py --retry-failed

# Offline tests; no credentials, network calls, or real database writes:
workers/bluesky/.venv/Scripts/python.exe -m unittest discover -s workers/bluesky -v
```

`--check` doesn't prove Gemini inference quota or database write permission. `--sample` verifies inference separately. Successful real inserts appear as `stored` in the log. `skipped` means the post wasn't actionable or its location couldn't be resolved safely. Inspect `social_alerts` in Supabase's Table Editor to view results.

`verify_storage.py` uses the worker's actual persistence method to verify a live insert, field and PostGIS coordinate readback, duplicate upsert, and content update preserving the row ID and creation time. It deletes only its randomly generated test URI and confirms the row is gone. A successful run saves a local receipt in `data/storage-verification.json`. It does not call Gemini or publish anything to Bluesky. If interrupted or cleanup fails, inspect the reported test URI in Supabase before retrying.

## Storage and processing

- `bluesky_uri`: canonical `at://did/.../record-key`, also the upsert conflict key.
- `summary`: model summary, with an explicit approximate-location suffix for city centroids.
- `category`: `flood`, `severe_weather`, `wildfire`, `power_outage`, `road_hazard`, `shelter`, or `mutual_aid`.
- `urgency`: `low`, `moderate`, or `critical`.
- `geom`: `SRID=4326;POINT(longitude latitude)`; coordinates come from Photon, never Gemini.
- `id` and `created_at`: existing database defaults. Updates preserve insertion time.

SQLite in `data/state.sqlite3` stores candidates and the Jetstream cursor together. Reconnects rewind two seconds and deduplicate by URI/event timestamp. Supabase upserts make retries idempotent. Successful extraction is cached before geocoding/storage retries. Processed raw post text is cleared; pending and failed jobs retain it locally. Updates and deletions of tracked posts replace or remove their stored alerts. Account takedowns are not currently handled.

One worker per state directory is enforced by a file lock. The default Gemini budget is **5 requests/minute and 100 attempts/UTC day**, persisted across restarts. These are local caps, not a promise about your account's quota or charges; adjust them to your AI Studio limits. HTTP 429 pauses processing, transient failures back off, and authentication/schema failures stop the worker with pending work retained. Eight unsuccessful transient attempts mark a job failed for explicit retry.

The queue admits at most 1,000 new pending URIs by default. On overflow it pauses intake and requests replay. Jetstream retains only a limited replay window, so extended downtime or sustained overload can miss events; this is not an archival collector. Existing tracked updates/deletions may exceed that soft cap. Keep the `data` directory for restart continuity. Stored URI records and the geocoder cache currently require manual retention planning for long-running deployments.

## Texas coverage and location quality

The pipeline accepts locations across Texas. The default inexpensive prefilter requires a disaster term plus `Texas`, `TX`, a Texas hashtag, or one of the included regional/city names. It does not know every Texas town and can miss implicit locations, image-only reports, or unfamiliar phrasing. Add names through `EXTRA_TEXAS_TERMS`, or set `REQUIRE_TEXAS_KEYWORD=false` to send disaster candidates from any region to Gemini (substantially increases demand; final results must still be Texas).

Gemini must copy a location phrase from the post. Photon results must have US/Texas address metadata, valid coordinates in the Texas bounding rectangle, the required specificity, and one distinct acceptable match. Named places/cities must match the extracted phrase; numbered addresses must match street and house number. Ambiguous or unresolved locations are skipped, not assigned a guessed coordinate. This is conservative geocoding, not independent verification of the social report; incorrect upstream place metadata or mistaken reports remain possible.

Photon's public demo is suitable only for modest use and has no availability guarantee. This worker caches geocoding results for 30 days and spaces uncached requests 15 seconds apart by default. Use `PHOTON_URL` to switch to another HTTPS Photon deployment for larger workloads. Any map or display using these coordinates should include **© OpenStreetMap contributors** with a link to https://www.openstreetmap.org/copyright.

New posts older than 24 hours are rejected by default (`MAX_POST_AGE_HOURS`). Existing stored alerts are **not automatically expired** because the supplied schema has no expiry/source timestamp; consumers should use a freshness policy and label these as unverified community reports. This change provides the ingestion worker and CLI diagnostics, not a map layer or Next.js feed endpoint.

## References

The geocoder sends `countrycode=US` as a filter instead of appending `USA` to the search text, which can match business names. City reports use `layer=city`; numbered addresses use `layer=house`. Cached results are keyed by query settings so older misses do not override corrected lookups.

- [Jetstream JSON protocol and public endpoints](https://github.com/bluesky-social/jetstream-legacy)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini models](https://ai.google.dev/gemini-api/docs/models)
- [Photon API and public-server usage](https://github.com/komoot/photon)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
