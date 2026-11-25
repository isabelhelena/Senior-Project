# Next.js API Routes & Environment Setup

Next.js serves read-only stored telemetry, PostGIS spatial queries, NWS point observations, geocoding, and community report submission/moderation routes under `src/app/api/`. Data ingestion into Supabase runs in separate Python workers under `workers/`.

## Route handlers

| Route | Method(s) | Data source | Parameters / payload | Response & caching |
| --- | --- | --- | --- | --- |
| `/api/alerts` | `GET` | Supabase RPC `read_official_alerts('nws')` | None | Statewide NWS GeoJSON `FeatureCollection`, `fetchedAt`, `stale` (`Cache-Control: no-store`) |
| `/api/road-conditions` | `GET` | Supabase RPC `read_official_alerts('txdot')` | None | Statewide TxDOT GeoJSON `FeatureCollection`, `fetchedAt`, `stale` (`Cache-Control: no-store`) |
| `/api/emergency-resources` | `GET` | Supabase RPC `get_nearby_emergency_resources` | Required: `lat`, `lng`. Optional: `radiusMeters` (`3000`–`65000`, default `25000`), `types` (comma-separated), `q`, `includeUnnamed` (`true`/`false`), `limit` (`10`–`500`, default `250`) | Deduplicated nearby OpenStreetMap `EmergencyResource[]` (`next: { revalidate: 120 }`) |
| `/api/community-reports` | `GET` | Supabase RPC `read_community_reports` | Optional: `bbox=west,south,east,north` (default Texas box, max `15` degrees per axis) | Approved, unexpired community reports from the last 24 hours (`Cache-Control: no-store`) |
| `/api/community-reports` | `POST` | Supabase RPC `submit_community_report` | JSON (max 8 KiB): `category`, `severity`, `description`, `latitude`, `longitude`, `locationSource`, `locationStatus`, `submissionId` (UUID v4) | Pending report receipt (`201`) with `Cache-Control: no-store` |
| `/api/moderation/session` | `POST`, `DELETE` | Supabase Auth `/auth/v1/token` + `list_community_report_queue` | `POST`: `{ email, password }`; `DELETE`: clears cookie | Sets/clears `HttpOnly`, `SameSite=Strict`, `Secure` (prod) `lss_moderator` cookie scoped to `/api/moderation` |
| `/api/moderation/reports` | `GET`, `PATCH` | Supabase RPCs `list_community_report_queue`, `moderate_community_report` | `GET`: `status`, `page` (50/page); `PATCH`: `{ id, status, expectedStatus, notes }` | Queue listing or decision receipt (`Cache-Control: no-store`) |
| `/api/weather-current` | `GET` | NWS `/points`, `/stations`, `/observations/latest` | `lat`, `lng` (defaults to San Antonio `29.4241`, `-98.4936`) | Ambient temperature (`tempF`), `condition`, `windMph`, `windDirection`, `humidity`, `stationName` |
| `/api/geocode` | `GET` | Zippopotam.us (forward) or NWS `/points` + `/county` (reverse) | Either `zip` (5 digits) or `lat` + `lng` | `{ city, state, lat, lng }` (`revalidate: 2592000` for ZIP, `86400` for NWS reverse geocode) |

## Environment configuration (`.env.local`)

Copy root [`.env.example`](../.env.example) to `.env.local` for local development. Next.js loads `.env.local` and `.env` automatically.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | For alerts, resources, reports | Supabase project URL (`https://...`, or loopback `http://` for local dev). `NEXT_PUBLIC_SUPABASE_URL` is also accepted by the public helper. |
| `SUPABASE_PUBLISHABLE_KEY` | For alerts, resources, reports | Non-privileged Supabase publishable key (legacy `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` with JWT `role: "anon"` is also accepted). |
| `NWS_USER_AGENT` | Optional | Custom `User-Agent` sent to `api.weather.gov` by `/api/weather-current` and `/api/geocode` (defaults to `LoneStarSupport/1.0`). |
| `COMMUNITY_REPORT_SECRET` | For `/report` submissions | Secret shared with `community_report_config.submission_secret_hash` (min 32 chars) for HMAC-SHA256 IP hashing and RPC authorization. |
| `REPORT_CLIENT_IP_HEADER` | Production `/report` | Single trusted proxy IP header (e.g. `cf-connecting-ip`). Leave unset in local dev; production submissions fail closed (`503`) if missing. |
| `APP_ORIGIN` | Production `/report` & `/moderation` | Exact canonical public origin without trailing slash (e.g. `https://example.org`) checked by `requireSameOrigin`. |

### Key safety rules

- [`src/lib/supabase-public.ts`](../src/lib/supabase-public.ts) resolves Supabase credentials exclusively from `process.env` and never reads worker `.env` files or `SUPABASE_SERVICE_ROLE_KEY`.
- Any key starting with `sb_secret_`, containing `service_role`, matching `SUPABASE_SERVICE_ROLE_KEY`, or using a JWT whose `role` claim is not `"anon"` is rejected (`503`).
- `sb_publishable_*` keys are sent via `apikey` only (never `Authorization: Bearer`) unless a user session token or legacy JWT anon key is supplied.

## Error & staleness behavior

- Official alert endpoints (`/api/alerts`, `/api/road-conditions`) do not accept location parameters and never contact NWS/TxDOT directly; if Supabase is unconfigured or the initial worker run has not completed (`fetchedAt` is null), they return `503`.
- Stored snapshots older than 30 minutes are flagged `stale: true` by `read_official_alerts`, while expired rows (`expires_at <= now()`) are filtered out on read and deleted on the next worker run.
- Community report endpoints hide internal database errors behind sanitized `503` responses, except mapped domain errors (`400` validation/Texas bounds, `401`/`403` auth & origin, `409` idempotency or optimistic lock conflict, `413` > 8 KiB body, `415` non-JSON, `429` 5/hour rate limit with `Retry-After: 3600`).
