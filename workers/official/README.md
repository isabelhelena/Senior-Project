# Official alert ingestion

Python 3.12+ fetches statewide NWS alerts and TxDOT Roadway Status into Supabase.
Polling is **opt-in**. Next.js only reads stored alerts; current weather observations
remain separate.

## Controls (from the project root)

```powershell
.\workers\official\polling.ps1 on      # Refresh now, then every 10 minutes
.\workers\official\polling.ps1 off     # Disable the schedule and stop its current run
.\workers\official\polling.ps1 status  # Show on/off and last task result
.\workers\official\polling.ps1 once    # Refresh once without enabling polling
```

`on` stays enabled until `off`. Windows must be awake, online, and signed in.
There is no login trigger. Background runs use `pythonw.exe` without console
windows. Logs rotate in `data/worker.log`; task exit code 0 means success.
Stopping polling does not stop Next.js or delete stored data.

## Setup

1. Run [the migration](../../supabase/migrations/20261013000000_official_ingestion.sql)
   in the existing Supabase project's SQL Editor. It adds official-alert fields
   and functions; it does not touch social/community/resource tables.
2. Create the isolated Python environment:

   ```powershell
   python -m venv workers/official/.venv
   workers/official/.venv/Scripts/python.exe -m pip install -r workers/official/requirements.txt
   ```

3. Create `workers/official/.env` from its `.env.example`. Set `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `NWS_USER_AGENT` with your project/contact.
4. Create root `.env.local` from root `.env.example`. Use `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` (publishable or legacy anon key). Never use the
   service-role key in Next.js. Restart Next.js after changing these values.
5. Run `polling.ps1 once` to verify ingestion. Enable polling only when wanted.

```powershell
# Read-only database check / upstream validation without database writes:
workers/official/.venv/Scripts/python.exe workers/official/worker.py --check
workers/official/.venv/Scripts/python.exe workers/official/worker.py --dry-run
# Optional foreground polling; Ctrl+C stops this process:
workers/official/.venv/Scripts/python.exe workers/official/worker.py --poll
# Offline regression tests:
workers/official/.venv/Scripts/python.exe -m unittest discover -s workers/official -v
```

Running `worker.py` without arguments fetches once. `--source nws` or `--source
txdot` limits a run to one provider. `polling.ps1 off` controls the Windows task;
use Ctrl+C for a separately started foreground `--poll` process.

## Storage guarantees

- NWS follows every page and resolves missing geometry through all affected-zone
  boundaries, cached for seven days. These boundaries represent affected areas,
  not inferred storm footprints. Unresolved geometry fails that source's refresh.
- TxDOT fetches all matching IDs in verified batches. Open-to-traffic, artificial
  centerline, and proposed records are excluded case-insensitively, both in the
  upstream query and before persistence. This uses the existing Roadway Status
  layer, not the DriveTexas incident feed.
- Each source commits atomically. Stable IDs make replay safe; failed or partial
  downloads retain the previous snapshot. Retries back off; a local file lock
  prevents overlapping workers.
- A complete refresh deletes records absent from that source. Each run also
  deletes expired official alerts. NWS uses the earlier of `ends` and `expires`;
  TxDOT records persist until a complete poll no longer includes them.
- While polling is off, reads still hide expired alerts and mark snapshots older
  than 30 minutes stale. Physical cleanup resumes on the next run.
- `/api/alerts` and `/api/road-conditions` return statewide stored GeoJSON.
  The visible map rereads storage every minute; it never starts ingestion.
  Unconfigured/uninitialized feeds return 503. Only the worker can sync/prune;
  the publishable key can read official alerts through a restricted RPC.

`schema.sql` is the original snapshot; apply migrations after restoring it.

References: [NWS API](https://www.weather.gov/documentation/services-web-api),
[ArcGIS queries](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/).
