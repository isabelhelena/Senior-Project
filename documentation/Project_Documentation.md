# System Architecture, Database & Verification Reference

## Overview

Lone Star Support separates user-facing presentation (Next.js App Router) from external data ingestion (standalone Python workers) using Supabase PostgreSQL + PostGIS as the storage and spatial query layer.

```text
External Feeds                  Python Workers                  Supabase PostGIS             Next.js App
--------------                  --------------                  ----------------             -----------
NWS API (api.weather.gov)  -->  workers/official/worker.py  --> public_alerts            --> /api/alerts
TxDOT ArcGIS Roadway       -->  workers/official/worker.py  --> public_alerts            --> /api/road-conditions
OSM Overpass API           -->  workers/emergency_resources --> emergency_resources      --> /api/emergency-resources
Bluesky Jetstream + Gemini -->  workers/bluesky/worker.py   --> social_alerts            (future live feed; map uses fixtures)
                                                                community_reports        <-> /api/community-reports
                                                                community_report_reviews <-> /api/moderation/*
NWS Observations & Points  ----------------------------------------------------------------> /api/weather-current, /api/geocode
Zippopotam.us              ----------------------------------------------------------------> /api/geocode
```

## Application routes

- `/` ([`src/app/page.tsx`](../src/app/page.tsx)) and `/test-feed` ([`src/app/test-feed/page.tsx`](../src/app/test-feed/page.tsx)): Stored NWS/TxDOT snapshot inspector, local weather card, and navigation links to the map and report form.
- `/test-map` ([`src/app/test-map/page.tsx`](../src/app/test-map/page.tsx)): Primary MapLibre GL crisis map, shelters/aid search panel, inspection drawer, and technical feed table. See [`src/app/test-map/README.md`](../src/app/test-map/README.md).
- `/report` ([`src/app/report/page.tsx`](../src/app/report/page.tsx)): Citizen incident submission form validated locally and server-side against Texas boundaries.
- `/moderation` ([`src/app/moderation/page.tsx`](../src/app/moderation/page.tsx)): Authenticated moderator queue (`pending`, `approved`, `rejected`) backed by Supabase Auth and Postgres audit logging. See [`documentation/Community_Reports.md`](Community_Reports.md).

## Database schema and migrations

Base schema is defined in [`schema.sql`](../schema.sql), extended by migrations under [`supabase/migrations/`](../supabase/migrations):

1. [`20260922054845_remote_schema.sql`](../supabase/migrations/20260922054845_remote_schema.sql) (initial remote baseline placeholder).
2. [`20261012233500_upgrade_emergency_resources_rpc.sql`](../supabase/migrations/20261012233500_upgrade_emergency_resources_rpc.sql): Ensures public `SELECT` policy on `emergency_resources`, B-tree index on `resource_type`, and upgraded `get_nearby_emergency_resources` RPC (`filter_types`, `search_query`, `include_unnamed`, `result_limit` clamped `1`–`1000`).
3. [`20261013000000_official_ingestion.sql`](../supabase/migrations/20261013000000_official_ingestion.sql): Adds `properties` and `fetched_at` to `public_alerts`, spatial/expiry indexes, `official_ingestion_status`, and RPCs `sync_official_alerts`, `prune_official_alerts`, and `read_official_alerts`.
4. [`20261102000000_community_reports.sql`](../supabase/migrations/20261102000000_community_reports.sql): Adds moderation/audit columns to `community_reports`, creates `community_report_config` (with simplified Census ACS2024 Texas `MultiPolygon` and `submission_secret_hash`), `community_report_moderators` (`user_id`), and `community_report_reviews` (`id`, `report_id`, `moderator_id`, `previous_status`, `status`, `notes`, `created_at`), and replaces `get_incidents_in_bbox` with a wrapper around `read_community_reports`.

### Tables and spatial indexes

- `public.public_alerts`: `geom` (`geometry(Geometry, 4326)`, GiST), `(source, expires_at)` index.
- `public.official_ingestion_status`: Tracks `source` (`'nws' | 'txdot'`), `fetched_at`, `completed_at`, `record_count`.
- `public.emergency_resources`: `geom` (`geometry(Point, 4326)`), GiST index on `geom::geography` (`emergency_resources_geog_gix`), B-tree index on `resource_type`.
- `public.community_reports`: `geom` (`geometry(Point, 4326)`, GiST), queue index `(status, created_at desc)`, rate-limit index `(ip_hash, created_at desc)`.
- `public.social_alerts`: `geom` (`geometry(Point, 4326)`), `bluesky_uri` unique constraint; populated by [`workers/bluesky/worker.py`](../workers/bluesky/worker.py) using `gemini-3.1-flash-lite` (default `GEMINI_MODEL`) and Photon geocoding.

## Security model

- **Credential isolation:** Next.js route handlers use [`src/lib/supabase-public.ts`](../src/lib/supabase-public.ts), which reads only `SUPABASE_URL` and a non-privileged key (`SUPABASE_PUBLISHABLE_KEY`, or legacy `anon` JWT) from `process.env`. `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_*` keys, and non-`anon` JWTs are rejected in Next.js and quarantined in worker `.env` files.
- **Database least privilege:** Core tables have Row Level Security enabled (`rls_auto_enable` DDL trigger in `schema.sql`), direct table mutations are revoked from `public`/`anon`/`authenticated`, and `SECURITY DEFINER` RPCs pin `SET search_path = public, pg_temp`.
- **Origin & input hardening:** Mutating endpoints enforce `requireSameOrigin` against `APP_ORIGIN` (or request origin in local dev), `readReportJson` aborts bodies over `8 KiB` (`413`), and client IPs are HMAC-SHA256 hashed with `COMMUNITY_REPORT_SECRET` before rate limiting (`5` submissions/hour via `pg_advisory_xact_lock`).
- **Moderator auth:** `/api/moderation/session` exchanges email/password with Supabase Auth, validates membership in `community_report_moderators` inside Postgres, and stores the access token in an `HttpOnly`, `SameSite=Strict`, `Secure` (production) cookie scoped to `/api/moderation` (max 1 hour).
- **Worker safeguards:** `workers/official/worker.py` validates `api.weather.gov` zone URLs against an HTTPS regex allowlist; `workers/bluesky/core.py` enforces verbatim substring containment (`location_text.casefold() in post.casefold()`) and single-match Texas bounds from Photon.

## Automation and deployment

- **Local Windows polling:** [`workers/official/polling.ps1`](../workers/official/polling.ps1) manages an opt-in 10-minute Windows Scheduled Task (`LoneStarSupport-OfficialAlerts`) running `worker.py --once`.
- **Linux VM CD:** [`.github/workflows/deploy-vm.yml`](../.github/workflows/deploy-vm.yml) triggers on pushes to `main` touching `workers/**` (using repository secrets `VM_HOST`, `VM_USER`, `VM_SSH_KEY`). It updates code in `~/Senior-Project`, installs Python requirements in `workers/official/.venv` and `workers/bluesky/.venv`, restarts the `bluesky-worker` `systemd` unit, and runs `workers/official/worker.py --check`.

## Verification suites

| Suite | Runner | Scope |
| --- | --- | --- |
| `npm run lint` | ESLint (`eslint-config-next`) | TypeScript & Next.js lint rules |
| `npm test` | Node test runner via `tsx` (`node --test src/lib/*.test.ts`) | Alert classification, report validation, community report API/auth handlers, `supabase-public` key validation |
| `npm run test:e2e` | Playwright (`tests/*.spec.ts`) | Map WebGL canvas, drawers, diagnostics, weather card, geolocation, `/report`, `/moderation` (network-mocked) |
| `python -m unittest discover -s workers/official -p "test_*.py" -v` | Python `unittest` | NWS pagination/zone cache, TxDOT filtering/batching, retry handling, URL/geometry validation |
| `python -m unittest discover -s workers/bluesky -p "test_*.py" -v` | Python `unittest` | Regex triage, verbatim location guard, Photon resolution, SQLite queue, offline demo (`test_demo.py`) |
| [`supabase/tests/community_reports.sql`](../supabase/tests/community_reports.sql) | Postgres (`psql` / SQL Editor) | Rolled-back DB regression test for RLS isolation, rate limiting, idempotency, expiry, and moderator audit trail |
