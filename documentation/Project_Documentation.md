# Lone Star Support: System Architecture, Data Pipeline, & Security Specification
**Document Classification:** Comprehensive Systems Architecture & Engineering Specification  
**Milestone Target:** Senior Capstone Project Complete Integrated Baseline  
**Branch / Version:** `kevin-br` (Integrated Baseline with Community Reports, POI Telemetry, & Automated Moderation)  
**Authors / Contributors:** Lone Star Support Engineering Team  

---

## 1. Executive Summary & Problem Scope

During regional climate crises and extreme weather emergencies in Texas—such as severe convective supercells, inland flash flooding, coastal hurricane landfalls, and winter freeze power interruptions—critical public safety information is severely fragmented across incompatible silos. Government entities (e.g., the National Weather Service [NWS] and the Texas Department of Transportation [TxDOT]) distribute authoritative data across disparate protocols and unstructured spatial formats. Simultaneously, civilian ground-truth observations propagate informally across social networks (e.g., the decentralized AT Protocol / Bluesky) and direct citizen emergency reports.

**Lone Star Support** is an open-source, high-reliability, zero-budget geospatial disaster telemetry and crisis response platform engineered to aggregate, normalize, validate, spatially index, and visualize multi-source disaster data across the State of Texas in real time. The platform provides:

1. **Authoritative Meteorological & Roadway Ingestion:** Automated continuous ingestion and geospatial polygon resolution of NWS severe weather warnings/watches and TxDOT road closures and hazards.
2. **Critical Infrastructure & POI Telemetry:** Spatially indexed catalog of over 21,000 Texas OpenStreetMap emergency facilities (shelters, food/water relief distribution, hospitals, clinics, pharmacies, and fire/police/EMS stations) with dynamic geodesic nearest-neighbor search and WebGL clustering.
3. **Social Crisis Telemetry Pipeline:** Real-time AT Protocol Jetstream firehose streaming, regex-based disaster triage, Google Gemini 1.5 structured natural language extraction with anti-hallucination verbatim quote validation, and Photon forward geocoding constrained to Texas geographic extents.
4. **Interactive Hardware-Accelerated Cartography:** MapLibre GL WebGL map interface featuring dynamic CARTO vector basemap theming (`next-themes`), orthographic 2D camera stabilization (`maxPitch: 0`), dynamic coordinate containment inspection (Turf.js), and telemetry data inspector feeds.
5. **Audited Community Incident Reporting & Moderation Subsystem:** Robust end-to-end citizen reporting pipeline with client-side coordinate validation, Census boundary verification, anti-DoS streaming body parsers, HMAC-SHA256 IP rate limiting, database-enforced state machines, and a dedicated, authenticated human moderation dashboard (`/moderation`) with cryptographic session controls and full audit logging.

---

## 2. Integrated System Architecture

The Lone Star Support ecosystem follows a decoupled, service-oriented multi-tier architecture designed for fault isolation, least-privilege credential separation, and spatial computing efficiency:

```
+---------------------------------------------------------------------------------------------------+
|                                        CLIENT BROWSER TIER                                        |
|   +-------------------------------------------------------------------------------------------+   |
|   |   Next.js 16 App Router (React 19, Tailwind CSS v4, Lucide Icons, next-themes)            |   |
|   |   - Interactive Crisis Map (/test-map): MapLibre GL WebGL Engine, POI Clustering, Drawer   |   |
|   |   - Community Incident Report Interface (/report): Client-Side Geometry & Field Validation|   |
|   |   - Moderator Review Queue (/moderation): Authenticated RBAC Workflow & Audit Logger      |   |
|   |   - Feed Diagnostics Console (/test-feed): Real-Time Telemetry & Upstream Health Probing  |   |
|   +-------------------------------------------------------------------------------------------+   |
+-------------------------------------------------+-------------------------------------------------+
                                                  | HTTP / JSON (Restricted API Contracts)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                APPLICATION & EDGE MEDIATION TIER                                  |
|   +-------------------------------------------------------------------------------------------+   |
|   |   Next.js Route Handlers (/src/app/api/)                                                  |   |
|   |   - /api/alerts: Proxies PostGIS stored NWS FeatureCollection                             |   |
|   |   - /api/road-conditions: Proxies PostGIS stored TxDOT roadway FeatureCollection          |   |
|   |   - /api/emergency-resources: Geodesic PostGIS radius query with parameter clamping      |   |
|   |   - /api/community-reports: Same-origin check, HMAC IP rate-limiting, PostGIS submission |   |
|   |   - /api/moderation/session: Supabase Auth exchange, HttpOnly/SameSite cookie issuing    |   |
|   |   - /api/moderation/reports: RBAC-verified report queue listing and optimistic PATCHing   |   |
|   |   - /api/weather-current: Real-time NWS point observation proxy                           |   |
|   |   - /api/geocode: Postal code sanitization and 30-day cached geocoding                    |   |
|   +-------------------------------------------------------------------------------------------+   |
+--------------------------+----------------------------------------------+-------------------------+
                           |                                              |
                           | Supabase Anon RPC / Cookie Bearer Auth       |
                           v                                              |
+-------------------------------------------------------------+           | Upstream HTTP/REST
|             PERSISTENCE & SPATIAL DATABASE TIER             |           |
|   +-----------------------------------------------------+   |           |
|   |   Supabase PostgreSQL 15+ with PostGIS Extension    |   |           |
|   |   - public_alerts (Geom, SRID 4326) [GiST]          |   |           |
|   |   - social_alerts (Point, SRID 4326) [GiST]         |   |           |
|   |   - emergency_resources (Point, SRID 4326) [GiST]   |   |           |
|   |   - community_reports (Point, SRID 4326) [GiST]     |   |           |
|   |   - community_report_config (Texas MultiPolygon)    |   |           |
|   |   - community_report_moderators (RBAC UUIDs)        |   |           |
|   |   - community_report_reviews (Immutable Audit Log)  |   |           |
|   |   - Row-Level Security (RLS) & Definer Stored Procs |   |           |
|   +-----------------------------------------------------+   |           |
+------------------------------^------------------------------+           |
                               |                                          |
                               | Asymmetric Service-Role Upsert           |
                               |                                          |
+------------------------------+------------------------------+           |
|              AUTONOMOUS INGESTION WORKER TIER               |           |
|   +-----------------------------------------------------+   |           |
|   |   Official Ingestion Daemon (Python 3.12)           |   |           |
|   |   - Scheduled NWS Polling & Zone Polygon Resolution |<--+-----------+ (api.weather.gov)
|   |   - TxDOT ArcGIS FeatureServer Roadway Extraction   |<--+-----------+ (TxDOT ArcGIS)
|   |   - Atomic Transaction Advisory Locks (pg_advisory) |   |
|   +-----------------------------------------------------+   |
|   +-----------------------------------------------------+   |
|   |   Bluesky Social Ingestion Daemon (Python 3.12)     |   |
|   |   - AT Protocol Jetstream WebSocket Firehose        |<--+-----------+ (Jetstream Firehose)
|   |   - Triage Filter & Gemini 1.5 NLP Structured Extr. |<--+-----------+ (Google Gemini API)
|   |   - Photon Nominatim Geocoder & Texas Bounding Check|<--+-----------+ (Photon Geocoder)
|   |   - SQLite Local Deduplication Queue                |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

---

## 3. Subsystem Breakdown & Operational Pipelines

### 3.1 Cartographic WebGL Engine (`src/app/test-map/`)
- **MapLibre GL Vector Pipeline:** Renders dynamic crisis layers on client GPUs without reliance on proprietary, paid tile APIs. Integrates CARTO vector basemap styles (Dark Matter and Positron) synced with application state through `next-themes`.
- **Orthographic Camera Constraint:** To prevent spatial disorientation during emergency management operations, camera pitch is programmatically constrained to zero (`maxPitch: 0`), maintaining an orthographic 2D nadir perspective. A persistent compass reset control recenters the viewport to the Texas centroid (`[-99.9018, 31.9686]`, zoom 6.0, bearing 0°).
- **Multi-Source Layer Integration:**
  - *NWS Polygon Geometries:* Rendered as GPU fills and borders dynamically styled according to urgency taxonomy (`#dc2626` Critical, `#ea580c` Severe, `#ca8a04` Medium).
  - *TxDOT Road Closure Linestrings:* Rendered as high-visibility dashed vector lines (`line-dasharray: [2, 2]`) with zoom-interpolated stroke widths.
  - *Emergency Resource POI Clustering:* Over 21,000 facilities rendered using WebGL circle clustering with cluster counts, expanding on zoom into individual category icons (Shelters, Food/Water, Medical, First Responders).
  - *Approved Community Reports:* Displayed on the map and side inspection panel, dynamically segregated from social demo fixtures.
  - *Null-Geometry Bulletin Preservation:* Meteorological watches and winter advisories lacking radar polygon coordinates are maintained in state, ensuring regional text warnings remain accessible via the slide-out inspection drawer and telemetry table.
- **Topological Containment (Turf.js):** Employs `@turf/boolean-point-in-polygon` for in-memory topological point-in-polygon operations, dynamically cross-referencing citizen and social alerts situated within selected storm warning envelopes.

### 3.2 Community Reporting & Moderation Pipeline (`/report` & `/moderation`)
The community submission and moderation subsystem enforces a strict human-in-the-loop lifecycle for citizen-generated reports:

```
[Citizen Client] (/report)
       |
       | 1. Form Validation (Field types, coordinate parsing, 20-1000 chars)
       | 2. UUIDv4 submissionId generation (idempotency key)
       v
[POST /api/community-reports]
       |
       | 3. requireSameOrigin (Anti-CSRF origin header validation)
       | 4. Anti-DoS streaming parser (8 KiB max body abort)
       | 5. Census Texas boundary containment verification (Turf.js)
       | 6. Content triage flags: links, markup, PII, character repetition
       | 7. HMAC-SHA256 IP hashing via COMMUNITY_REPORT_SECRET
       v
[PostgreSQL RPC: submit_community_report]
       |
       | 8. Shared secret validation (submission_secret_hash)
       | 9. Rolling rate limit check: max 5 submissions/hour per hashed IP
       | 10. PostGIS spatial containment: ST_Contains(texas_geom, Point)
       | 11. Transactional insert: status='pending', expires_at = now() + 24h
       v
[Pending Queue Isolation]
       |
       v
[Moderator Client] (/moderation)
       |
       | 12. Supabase Auth sign-in -> POST /api/moderation/session
       | 13. Issues HttpOnly, SameSite=Strict, Secure cookie (1 hour maxAge)
       | 14. GET /api/moderation/reports (RBAC checked in Postgres against allowlist)
       | 15. Moderator reviews content flags, coordinates, and notes
       | 16. PATCH /api/moderation/reports (Optimistic locking via expectedStatus)
       v
[PostgreSQL RPC: moderate_community_report]
       |
       | 17. Update status ('approved' or 'rejected'), reviewed_at, reviewed_by
       | 18. Append immutable decision log to community_report_reviews
       v
[Public Telemetry Layer]
       |
       v
[GET /api/community-reports]
       |
       | 19. Invokes read_community_reports() RPC
       | 20. Returns ONLY status='approved' AND unexpired records within 15 deg bbox
       v
[Map Display on /test-map]
```

### 3.3 Authoritative Ingestion Workers (`workers/official/`)
- Polled on a 10-minute cron/PowerShell schedule or run on demand via `worker.py`.
- Ingests active NWS alerts (`https://api.weather.gov/alerts/active?area=TX`). Missing polygon geometries are asynchronously resolved by fetching corresponding county and marine zone boundaries (`/zones/county/*`) and combining them into MultiPolygons.
- Queries TxDOT ArcGIS FeatureServer REST endpoints, strictly excluding open-to-traffic centerlines and unbuilt proposed roadways (`RDWAY_STAT`).
- Synchronizes snapshots into Supabase using `sync_official_alerts()`, protected by Postgres advisory transaction locks (`pg_advisory_xact_lock`) to serialize concurrent runs and prune expired alerts atomically.

### 3.4 Social Telemetry Daemon (`workers/bluesky/`)
- Streams real-time posts from the Bluesky Jetstream firehose via persistent WebSockets.
- Executes multi-tier extraction:
  1. *Regex Filter:* Evaluates hazard terms and Texas geographical references.
  2. *Gemini 1.5 Structured NLP:* Extracts category, urgency, precision level, and location text.
  3. *Verbatim Quoted Substring Rule:* The extracted `location_text` MUST appear verbatim in the source post, completely eliminating generative address hallucination.
  4. *Photon Geocoding:* Resolves coordinates, demanding exactly one unambiguous match strictly within the Texas bounding box (`25.8 <= lat <= 36.6`, `-106.7 <= lon <= -93.5`).
  5. *Persistence:* Records to an isolated SQLite queue before PostGIS upsert into `social_alerts`.
- Includes an offline, zero-credential presentation harness (`demo.py`) for deterministic evaluation.

---

## 4. Relational & PostGIS Database Schema

The persistence layer (`schema.sql` and `20261102000000_community_reports.sql`) is deployed on PostgreSQL 15+ with PostGIS. All spatial coordinates utilize EPSG:4326 (WGS 84).

```
                      +------------------------------------------+
                      |              public_alerts               |
                      +------------------------------------------+
                      | id: uuid (PK)                            |
                      | source: text ('nws' | 'txdot')           |
                      | external_id: text (UNIQUE)               |
                      | headline: text                           |
                      | description: text                        |
                      | geom: geometry(Geometry, 4326) [GiST]    |
                      | expires_at: timestamptz                  |
                      | fetched_at: timestamptz                  |
                      | properties: jsonb                        |
                      +------------------------------------------+
                                           |
                      +------------------------------------------+
                      |        official_ingestion_status         |
                      +------------------------------------------+
                      | source: text (PK)                        |
                      | fetched_at: timestamptz                  |
                      | completed_at: timestamptz                |
                      | record_count: integer                    |
                      +------------------------------------------+

+-------------------------------------+       +-------------------------------------+
|            social_alerts            |       |         emergency_resources         |
+-------------------------------------+       +-------------------------------------+
| id: uuid (PK)                       |       | id: uuid (PK)                       |
| bluesky_uri: text (UNIQUE)          |       | osm_id: text (UNIQUE)               |
| summary: text                       |       | name: text                          |
| category: text                      |       | resource_type: text [B-Tree]        |
| urgency: text                       |       | address: text                       |
| geom: geometry(Point, 4326) [GiST]  |       | phone: text                         |
| created_at: timestamptz             |       | geom: geometry(Point, 4326) [GiST]  |
+-------------------------------------+       | metadata: jsonb                     |
                                              | created_at: timestamptz             |
                                              +-------------------------------------+

                      +------------------------------------------+
                      |            community_reports             |
                      +------------------------------------------+
                      | id: uuid (PK)                            |
                      | submission_id: uuid (UNIQUE)             |
                      | request_hash: text                       |
                      | category: text                           |
                      | urgency: text                            |
                      | description: text                        |
                      | geom: geometry(Point, 4326) [GiST]       |
                      | ip_hash: text [B-Tree rate index]        |
                      | status: text ('pending','approved',...)  |
                      | flags: text[]                            |
                      | source_classification: jsonb             |
                      | location_source: text                    |
                      | location_status: text                    |
                      | created_at: timestamptz                  |
                      | expires_at: timestamptz                  |
                      | reviewed_at: timestamptz                 |
                      | reviewed_by: uuid (FK auth.users)        |
                      | review_notes: text                       |
                      +------------------------------------------+
                                     |                    |
                                     v                    v
+--------------------------------------+   +---------------------------------------+
|     community_report_moderators      |   |       community_report_reviews        |
+--------------------------------------+   +---------------------------------------+
| user_id: uuid (PK -> auth.users)     |   | id: bigint (PK, GENERATED ALWAYS)     |
| added_at: timestamptz                |   | report_id: uuid (FK community_reports)|
+--------------------------------------+   | moderator_id: uuid (FK auth.users)    |
                                           | previous_status: text                 |
                                           | status: text                          |
                                           | notes: text                           |
                                           | reviewed_at: timestamptz              |
                                           +---------------------------------------+
```

### Spatial Query Optimization
1. **Spherical Geodesic Calculations:** To provide accurate proximity measurements without introducing planar UTM projection distortions across Texas's massive longitudinal breadth, `emergency_resources` queries cast geometries to PostGIS `geography`:
   ```sql
   CREATE INDEX emergency_resources_geog_gix ON public.emergency_resources USING gist (((geom)::public.geography));
   ```
   Distance calculations use `ST_Distance(er.geom::geography, search_point.point)` on the WGS 84 ellipsoid, filtered by `ST_DWithin`.
2. **Automated Bounding Box Filtering:** Spatial RPCs (`read_community_reports`, `get_incidents_in_bbox`) enforce envelope index checks (`geom && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)`), ensuring sub-millisecond query execution.

---

## 5. Security Architecture & Threat Mitigations

Lone Star Support implements a defense-in-depth model across network transport, credential isolation, database access controls, input sanitization, and upstream integrations:

```
+---------------------------------------------------------------------------------------------------+
|                                  SECURITY DEFENSE MATRIX                                          |
+---------------------------------------------------------------------------------------------------+
| 1. Network Boundary & Transport Hardening                                                        |
|    - Loopback Origin Binding (allowedDevOrigins: ["127.0.0.1", "localhost"])                      |
|    - Same-Origin Verification (requireSameOrigin checking Origin against APP_ORIGIN)             |
|    - Zero-Budget Keyless Design (Elimination of commercial billing exposure and quota drains)     |
+---------------------------------------------------------------------------------------------------+
| 2. Cryptographic Isolation & Credential Hierarchy                                                |
|    - Asymmetric Key Tiers: Anonymous/Publishable vs. Secret Worker Service-Role                   |
|    - Shared Submission Secret Salt: Server-side HMAC-SHA256 IP hashing (No raw IPs stored)       |
|    - Stored Secret Hash Verification: Database validates submission_secret_hash (SHA-256)        |
|    - Session Isolation: HttpOnly, SameSite=Strict, Secure cookie scoped exclusively to /api/mod   |
+---------------------------------------------------------------------------------------------------+
| 3. Database Security, RLS, & PostgreSQL Hardening                                                |
|    - Automated RLS Enforcement: DDL Event Trigger (rls_auto_enable) on all new public tables       |
|    - Search-Path Hijacking Immunity: All SECURITY DEFINER functions set search_path = public, pg_temp|
|    - Table Access Quarantining: Direct mutation revoked from public/anon/authenticated on core db |
|    - Parameterized PostGIS Invocation: Spatial SQL injection neutralization                       |
|    - Optimistic Concurrency Locking: p_expected_status check prevents moderator overwrite races   |
+---------------------------------------------------------------------------------------------------+
| 4. Input Validation, Anti-DoS, & Boundary Clamping                                               |
|    - Streaming Body Size Limit: Early chunk abort at 8 KiB (HTTP 413)                             |
|    - Rate Limiting: Max 5 submissions/rolling hour per HMAC-hashed IP (fails closed in prod)      |
|    - Dual Texas Boundary Enforcement: Turf.js 500K Census check + PostGIS ST_Contains check       |
|    - Idempotency Locking: UUIDv4 submissionId prevents double-submission duplicate records        |
|    - Clamped Geodesic Radii: [3000m, 65000m] radius and [10, 500] limit bounds prevent table scan |
|    - Automated Content Triage: Regex flags for markup (XSS), external links, PII, and spam floods|
+---------------------------------------------------------------------------------------------------+
| 5. Upstream Integrity, Anti-SSRF, & Anti-Hallucination Controls                                   |
|    - Upstream URL Regex Whitelist (nws_url) prevents SSRF and loopback port scanning              |
|    - LLM Verbatim Quoted Substring Rule enforces that extracted locations exist in raw posts     |
|    - Strict Single-Candidate Ambiguity Pruning in Photon Geocoding                                |
+---------------------------------------------------------------------------------------------------+
| 6. Concurrency Control & Fault Resilience                                                         |
|    - PostgreSQL Advisory Transaction Locks (pg_advisory_xact_lock) prevent race conditions        |
|    - Upstream AbortSignal Timeouts (15s - 20s) prevent thread starvation                          |
|    - HTTP 429 Retry-After Backoff with 60s execution deferral cap                                |
|    - Error Masking: Sanitized HTTP 503 responses prevent internal stack trace leakage             |
+---------------------------------------------------------------------------------------------------+
```

### 5.1 Network Boundary & Origin Hardening
- **Local Origin Lockdown:** In [`next.config.ts`](file:///home/alke/Documents/repository/senior_project/next.config.ts), `allowedDevOrigins: ["127.0.0.1", "localhost"]` restricts dev WebSocket sockets and Next.js HMR endpoints from cross-site hijacking and DNS rebinding attacks.
- **Same-Origin Mutation Defense:** In [`src/lib/community-report-server.ts`](file:///home/alke/Documents/repository/senior_project/src/lib/community-report-server.ts#L26-L31), `requireSameOrigin()` validates the incoming `Origin` header against `APP_ORIGIN` on all mutating routes (`/api/community-reports`, `/api/moderation/session`, `/api/moderation/reports`).
- **Zero-Budget Keyless Architecture:** External paid commercial APIs (such as OpenWeatherMap) were completely eliminated. The entire platform relies on public-domain authoritative services (NWS, TxDOT Open Data, Zippopotam.us, OpenStreetMap), preventing denial-of-wallet and quota exhaustion attacks.

### 5.2 Cryptographic Isolation & Credential Hierarchy
- **Asymmetric Key Separation:** Public browser environments possess strictly read-only anonymous credentials (`SUPABASE_PUBLISHABLE_KEY`). The administrative `SUPABASE_SERVICE_ROLE_KEY` is quarantined exclusively in Python worker `.env` files, completely omitted from Next.js server runtime.
- **Shared Submission Secret Salt:** To prevent public users from bypassing API rate-limits by calling PostGIS stored procedures directly via Supabase's public HTTP API, `submit_community_report()` requires a `p_secret`. The database verifies this secret against a pre-configured SHA-256 hash (`submission_secret_hash` in `community_report_config`).
- **HMAC-SHA256 IP Anonymization:** Raw citizen IP addresses are never committed to storage. In `submissionIdentity()`, the client IP is extracted from a trusted deployment ingress header (`REPORT_CLIENT_IP_HEADER`) and hashed:
  ```typescript
  ipHash = createHmac("sha256", secret).update(ip).digest("hex");
  ```
  In production without a trusted header, submissions fail closed.
- **Hardened Moderator Sessions:** Moderator authentication tokens issued by Supabase Auth are encapsulated inside `HttpOnly`, `SameSite=Strict`, `Secure` (production) cookies scoped strictly to `path: "/api/moderation"` with a 1-hour expiration ceiling. Tokens are never stored in `localStorage` or exposed to browser JavaScript, mitigating XSS token theft.

### 5.3 Database Security, PostGIS Spatial Hardening, & Row-Level Security
- **Automated RLS DDL Trigger:** In `schema.sql`, an event trigger (`rls_auto_enable`) intercepts table creation events (`CREATE TABLE`, `SELECT INTO`) within the `public` schema and automatically executes `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, preventing accidental public table exposure.
- **Search-Path Hijacking Neutralization:** Every `SECURITY DEFINER` function in PostgreSQL explicitly defines:
  ```sql
  SET search_path = public, pg_temp;
  ```
  This eliminates search-path manipulation attacks where unprivileged users create shadow functions in custom schemas to hijack administrative execution.
- **Table Mutation Revocation:** Direct INSERT, UPDATE, and DELETE privileges on `community_reports`, `public_alerts`, and `emergency_resources` are revoked from `public`, `anon`, and `authenticated` roles. All mutations must pass through vetted, rate-limited stored procedures.
- **Optimistic Concurrency Locking:** In `moderate_community_report()`, updating a report's status requires passing `p_expected_status` alongside an exclusive row lock (`FOR UPDATE`). If another moderator reviewed the report concurrently, the transaction rolls back with SQLSTATE `PT409`, preventing silent overwrites.
- **Spatial Injection Immunity:** Spatial geometries are constructed via parameterized PostGIS geometry builders (`ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)` and `ST_MakeEnvelope(...)`), preventing spatial SQL injection.

### 5.4 Input Validation, Anti-DoS, & Boundary Clamping
- **Streaming Body Size Limit:** In `readReportJson()`, requests are evaluated incrementally using a stream reader. If incoming chunk bytes exceed 8 KiB (`8192` bytes), the stream cancels immediately with HTTP 413, protecting server memory against large payload denial-of-service attacks.
- **Dual Texas Boundary Verification:**
  1. *Edge Layer (Turf.js):* Evaluates incoming coordinates against the U.S. Census Generalized ACS2024 Texas 500K MultiPolygon boundary (`src/lib/data/texas-boundary.json`).
  2. *Database Layer (PostGIS):* Evaluates coordinates inside `submit_community_report()` via `ST_Contains(c.texas_geom, shape)`. Submissions outside Texas are rejected immediately.
- **Idempotency Locking:** Clients generate a UUIDv4 `submissionId`. Reusing the ID with an identical payload returns the existing receipt without consuming quota; modifying fields returns HTTP 409 Conflict.
- **Automated Content Triage:** The `contentFlags()` parser inspects citizen descriptions and tags:
  - `markup`: Detects HTML/XML tags (`/<\/?[a-z][^>]*>/i`) to flag XSS attempts.
  - `external_link`: Detects hyperlinks and domains to flag phishing and spam.
  - `personal_contact`: Detects phone numbers and emails to prevent PII publication.
  - `repeated_content`: Detects single-character flooding (`/(.)\1{14,}/u`).
- **Geodesic Query Parameter Clamping:** In `/api/emergency-resources/route.ts`:
  - `radiusMeters = Math.max(3000, Math.min(65000, rawRadius))`
  - `resultLimit = Math.max(10, Math.min(500, rawLimit))`
  This prevents malicious queries spanning the globe from triggering expensive spatial table scans.

### 5.5 Upstream SSRF Neutralization & LLM Anti-Hallucination Controls
- **SSRF Prevention:** In `workers/official/worker.py`, URLs passed to fetch workers are validated against strict regex schemes (`r'/zones/(county|forecast|fire|marine)/[A-Z]{2}[CZ]\d{3}'`) and verified to originate exclusively from `api.weather.gov` over HTTPS.
- **LLM Anti-Hallucination Quote Enforcement:** In `workers/bluesky/core.py`, any location extracted by Gemini 1.5 must satisfy `location_text.casefold() in post.casefold()`. The extraction must be an exact quote from the author, preventing synthetic or imagined locations.
- **Ambiguity Pruning:** The Photon forward geocoder requires candidate coordinates to reside within the Texas bounding box (`25.8 <= lat <= 36.6`, `-106.7 <= lon <= -93.5`) and demands exactly one spatial candidate; ambiguous multi-city matches are discarded.

### 5.6 Concurrency Control & Fault Resilience
- **Postgres Advisory Locks:** Ingestion and rate-limiting routines employ transactional advisory locks (`pg_advisory_xact_lock(hashtext(...))`), synchronizing concurrent processes across distributed server instances.
- **Timeout Caps:** All outbound HTTP requests utilize explicit timeouts (`AbortSignal.timeout(15_000)` on Next.js routes, 20s on workers), preventing thread starvation.
- **Graceful Error Masking:** Upstream database failures or initialization states return sanitized HTTP 503 responses, preventing internal connection strings or stack traces from reaching clients.

---

## 6. Comprehensive Verification & Quality Assurance Suite

The system maintains a comprehensive test suite across unit, integration, browser E2E, and database regression layers:

| Test Suite File | Framework / Engine | Subsystem & Verification Scope |
| :--- | :--- | :--- |
| [`tests/incident-report.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/incident-report.spec.ts) | Playwright Browser E2E | Citizen report form validation, Texas coordinate bounds, character limits, idempotency retries, server error handling |
| [`tests/community-moderation.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/community-moderation.spec.ts) | Playwright Browser E2E | Moderator sign-in, queue status filtering (`pending`/`approved`/`rejected`), content flag inspection, optimistic review decisions, sign-out |
| [`tests/community-report-map.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/community-report-map.spec.ts) | Playwright Browser E2E | Verified community report rendering on `/test-map`, layer dock toggling, slide-out drawer integration |
| [`tests/map.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/map.spec.ts) | Playwright Browser E2E | WebGL map container attachment, MapLibre canvas readiness, Texas overview reset, refresh controls |
| [`tests/hazard-drawer.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/hazard-drawer.spec.ts) | Playwright Browser E2E | Alert inspection drawer, official instruction cards, countdown timers, telemetry feed table filtering and click-to-fly |
| [`tests/weather.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/weather.spec.ts) | Playwright Browser E2E | WeatherSummaryCard rendering, NWS observation telemetry, loading and error fallback states |
| [`tests/location-context.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/location-context.spec.ts) | Playwright Browser E2E | ZIP code geocoding overrides, coordinate state updates, geolocation error handling |
| [`tests/diagnostics.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/diagnostics.spec.ts) | Playwright Browser E2E | `/test-feed` diagnostics console, raw NWS and TxDOT feed probing, offline mocking |
| [`tests/theme.spec.ts`](file:///home/alke/Documents/repository/senior_project/tests/theme.spec.ts) | Playwright Browser E2E | Next-themes dark/light toggling, CARTO Dark Matter vs. Positron basemap style synchronization |
| [`src/lib/community-reports.test.ts`](file:///home/alke/Documents/repository/senior_project/src/lib/community-reports.test.ts) | Vitest / Jest Unit | Server validation, Census Texas boundary checking, content flags, HMAC rate-limit hashing, body streaming limits, bounds parsing |
| [`src/lib/alert-classification.test.ts`](file:///home/alke/Documents/repository/senior_project/src/lib/alert-classification.test.ts) | Vitest / Jest Unit | Normalization rules between NWS severity, TxDOT hazards, and Bluesky/community categories |
| [`supabase/tests/community_reports.sql`](file:///home/alke/Documents/repository/senior_project/supabase/tests/community_reports.sql) | PostgreSQL / PostGIS SQL | Live database regression: permission boundaries, RLS isolation, rate limit enforcement, 24h expiry, optimistic locking, audit history (rolled-back transaction) |
| [`workers/official/test_worker.py`](file:///home/alke/Documents/repository/senior_project/workers/official/test_worker.py) | Python `unittest` | NWS zone boundary resolution, TxDOT status exclusion, retry backoff, advisory locking |
| [`workers/bluesky/test_worker.py`](file:///home/alke/Documents/repository/senior_project/workers/bluesky/test_worker.py) | Python `unittest` | Jetstream post parsing, keyword filters, Gemini response parsing, geocoder bounding |
| [`workers/bluesky/test_demo.py`](file:///home/alke/Documents/repository/senior_project/workers/bluesky/test_demo.py) | Python `unittest` | Offline classroom demonstration harness, scenario execution, SQLite queue reset |

### Headless WebGL & CI Environment Configuration
Hardware-accelerated MapLibre GL WebGL rendering inside headless Linux containers requires specific browser launch arguments. In [`playwright.config.ts`](file:///home/alke/Documents/repository/senior_project/playwright.config.ts):
- `--use-gl=angle` and `--use-angle=swiftshader`: Directs Chromium to use Google's SwiftShader software rasterizer, eliminating GPU hardware dependency.
- Dynamic Next.js Imports: Map components are loaded via `next/dynamic(..., { ssr: false })` to prevent server-side Node.js rendering panics on missing `window` or WebGL contexts.
- Non-Blocking Test Reporting: Configured with `reporter: [['list'], ['html', { open: 'never' }]]` to prevent test execution from hanging terminal processes.

---

## 7. Production Deployment & Configuration Checklist

To transition this integrated baseline into a live production deployment, follow the configuration steps documented in [`documentation/Community_Reports.md`](file:///home/alke/Documents/repository/senior_project/documentation/Community_Reports.md):

1. **Database Migration Execution:**
   - Run [`supabase/migrations/20261102000000_community_reports.sql`](file:///home/alke/Documents/repository/senior_project/supabase/migrations/20261102000000_community_reports.sql) in the Supabase SQL Editor.
2. **Submission Secret Configuration:**
   - Generate a 32-byte hexadecimal secret locally:
     ```powershell
     python -c "import secrets,hashlib; s=secrets.token_hex(32); print('COMMUNITY_REPORT_SECRET='+s); print('Database hash: '+hashlib.sha256(s.encode()).hexdigest())"
     ```
   - Set `COMMUNITY_REPORT_SECRET` in root `.env.local`.
   - Update `community_report_config` in Supabase with the generated SHA-256 database hash:
     ```sql
     UPDATE public.community_report_config
     SET submission_secret_hash = '<GENERATED_64_CHAR_HASH>'
     WHERE singleton;
     ```
3. **Moderator Authorization:**
   - Create moderator user accounts via Supabase Authentication.
   - Authorize their UUIDs in `community_report_moderators`:
     ```sql
     INSERT INTO public.community_report_moderators (user_id)
     VALUES ('<MODERATOR_USER_UUID>') ON CONFLICT DO NOTHING;
     ```
4. **Ingress Rate Limit Header:**
   - In production, set `APP_ORIGIN` to the public domain (e.g., `https://lonestarsupport.org`).
   - Configure `REPORT_CLIENT_IP_HEADER` to the single trusted reverse proxy header (e.g., `CF-Connecting-IP` or `X-Real-IP`) overwritten by your ingress load balancer.
5. **Continuous Deployment Workflow:**
   - Verified automated VM deployment pipeline configured in [`.github/workflows/deploy-vm.yml`](file:///home/alke/Documents/repository/senior_project/.github/workflows/deploy-vm.yml).
