# Data routes and ingestion

Official alerts follow `NWS / TxDOT ? Python worker ? Supabase ? Next.js ? map`.
The worker runs once by default, with optional ten-minute polling controlled by
`workers/official/polling.ps1`. See [setup and controls](../workers/official/README.md).

| Route | Data source | Parameters | Output |
| --- | --- | --- | --- |
| `/api/alerts` | Supabase `public_alerts` | None | Statewide stored NWS GeoJSON, fetch time, stale flag |
| `/api/road-conditions` | Supabase `public_alerts` | None | Statewide stored TxDOT GeoJSON, fetch time, stale flag |
| `/api/weather-current` | NWS points/stations | `lat`, `lng` | Latest observation near the selected location |
| `/api/geocode` | Zippopotam.us | `zip` | City/state and coordinates |

Official alert routes do not apply location/radius parameters or contact the
providers. Source failures retain the previous database snapshot. Missing setup
or an unavailable database returns 503; stale snapshots are explicitly labeled.

The worker resolves missing NWS polygons using affected-zone boundaries. TxDOT
open-to-traffic, artificial-centerline, and proposed records are excluded.
Expired official alerts are hidden on read and deleted during worker runs.

The map normalizes stored GeoJSON into `UnifiedHazard` for MapLibre. Its refresh
button and visible-tab timer reread storage without starting a worker. Location
selection affects map navigation and current weather, not ingestion coverage.
`/test-feed` inspects these stored statewide feeds.

Credentials belong in ignored environment files: the service-role key only in
`workers/official/.env`, and the publishable key in root `.env.local`. The existing
Bluesky worker and its demo retain their separate configuration and storage flow.
