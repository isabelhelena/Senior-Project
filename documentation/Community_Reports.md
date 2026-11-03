# Community reports and moderation

`/report` now submits to `POST /api/community-reports`. Every report is stored as
`pending`; only a moderator can approve publication. Bluesky fixtures are intentionally
unchanged. This feature uses Next.js route handlers and restricted PostGIS RPCs,
not a separate web service or a service-role key in Next.js.

## Reading the code

Follow one report through these files:

1. `IncidentReportForm.tsx` sends the form fields and a random submission ID. It
   reuses that ID on a retry so a lost response does not create another report.
2. `api/community-reports/route.ts` accepts the request. The validation helper
   checks the fields and Texas location, converts category/urgency labels, and
   flags content that needs attention. The server helper handles request limits,
   IP hashing, and calls to Supabase. An RPC is just a named database function
   called over HTTP.
3. `submit_community_report` in the migration saves a **pending** row. The database
   owns the five-per-hour rule, duplicate check, and permissions so these rules
   still work when several requests arrive together.
4. `ModerationQueue.tsx` lets an authorized moderator approve or reject a report.
   One React effect loads the current page and cancels its request when the page
   or filter changes. Saving a decision triggers a refresh. The database saves
   both the decision and a review-history entry.
5. `read_community_reports` returns only approved reports that have not expired.
   `community-report-feed.ts` converts them to the existing map format.

The content flags are simple text rules, not Gemini calls. Human review decides
publication. The shared submission secret is necessary because the public
Supabase key alone would let callers invoke the submission RPC directly and
invent their own rate-limit identity. The secret authorizes the server endpoint;
Supabase Auth and the moderator allowlist authorize reviewers.

## Setup

1. Apply `supabase/migrations/20261102000000_community_reports.sql` after the existing
   migrations in Supabase SQL Editor. It quarantines existing community rows as
   pending, adds moderation/audit fields and spatial/rate indexes, and restricts
   direct table access. It does not modify Bluesky/social records.
2. Generate a random secret locally:

   ```powershell
   python -c "import secrets,hashlib; s=secrets.token_hex(32); print('COMMUNITY_REPORT_SECRET='+s); print('Database hash: '+hashlib.sha256(s.encode()).hexdigest())"
   ```

   Set it as `COMMUNITY_REPORT_SECRET` in root `.env.local`. Use existing
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`; keep worker service-role keys in
   worker environments. In SQL Editor configure the printed database hash (do
   not paste the plaintext secret into SQL or commit it):

   ```sql
   update public.community_report_config
   set submission_secret_hash = 'YOUR_DATABASE_HASH'
   where singleton;
   ```

3. Create a moderator email/password user using Supabase Authentication. Confirm
   the email/account as appropriate. Allowlist its **user UUID**, not its email or
   user-editable metadata, through SQL Editor:

   ```sql
   insert into public.community_report_moderators(user_id)
   values ('MODERATOR_AUTH_USER_UUID') on conflict do nothing;
   ```

   Revoke access by deleting that UUID from the allowlist. Authorization is checked
   in Postgres on every queue read and decision, including existing sessions.
4. For production set `APP_ORIGIN` to the exact public origin (no trailing slash).
   Set `REPORT_CLIENT_IP_HEADER` to a **single IP header overwritten by your trusted
   ingress**, and prevent direct access that bypasses that ingress. Do not trust
   a caller-supplied header or a comma-separated forwarded chain. With no trusted
   header configured, production submissions fail closed. Development without a
   configured header shares a localhost rate bucket (five reports/hour).
5. Restart Next.js. Submit at `/report`, sign in at `/moderation`, enter a review
   note, and approve/reject. The map refreshes accepted submissions every minute.

## Behavior and contracts

- POST accepts raw form options: `category`, `severity`, `description`, numeric
  `latitude`/`longitude`, `locationSource`, `locationStatus`, and UUID-v4
  `submissionId`. The server revalidates and normalizes all fields; callers cannot
  set approval or reviewer identity. Bodies over 8 KiB are rejected.
- Locations must fall inside the bundled Census Texas boundary, checked locally
  with Turf and independently by PostGIS. This generalized 500K boundary was
  simplified at 0.002 degrees; it is a coverage check rather than parcel-level
  boundary adjudication. Source:
  [Census Generalized ACS2024 States 500K](https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2024/State_County/MapServer/7),
  queried with `STATE='48'`, WGS84, and `maxAllowableOffset=0.002`.
- Links, markup, personal contact details, and excessive repeated characters are
  flagged for review. All reports are held for human review, including reports
  without flags. These rules are a basic review aid, not an AI truth detector.
  Reviewers should reject personal information, spam, harmful instructions, and
  reports that cannot responsibly be published; request a new report if editing
  is needed. Report text renders as text, never HTML.
- Five successful submissions per rolling hour per HMAC-hashed IP are allowed.
  Postgres advisory locks serialize concurrent requests across app instances.
  Raw IPs are not stored. The secret-gated RPC prevents bypassing this IP identity
  through the public Data API. Same-origin checks protect browser mutations.
- Reusing a `submissionId` with the same canonical payload and hashed IP returns
  the original receipt without consuming quota. Reuse with different content
  returns 409. The form retains the key for network retries, clearing it on edits.
  A page reload starts a new submission. Users behind a shared NAT share quota.
- `GET /api/community-reports?bbox=west,south,east,north` returns at most 500 approved,
  unexpired reports from the last 24 hours, newest first. Default coverage is Texas;
  boxes are capped at 15 degrees per axis. Neither pending/rejected reports nor
  IP hashes, flags, moderator identities, or private review notes are public.
  The legacy `get_incidents_in_bbox` RPC uses the same approved-only read function.
- Moderator sessions use Supabase Auth access tokens in HttpOnly, SameSite=Strict
  cookies scoped to `/api/moderation`, Secure in production. Tokens are not stored
  in localStorage or returned to the browser's JavaScript. Sessions last at most
  one hour with no automatic refresh; sign in again after expiry. Sign-out removes
  the local cookie. Supabase manages password authentication and its auth limits.
- `/api/moderation/reports` supports GET with `status` and zero-based `page`, 50 rows
  per page. PATCH accepts `id`, `status` (`approved`/`rejected`), `expectedStatus`,
  and required `notes` (3–500 characters). Optimistic status checking prevents
  concurrent reviewers silently overwriting each other. Decisions are audited.
  Approved reports can subsequently be rejected; rejected reports can be approved.
- Reports expire 24 hours after submission regardless of review time. Approval
  means reviewed for publication, **not independently verified**. The map labels
  these separately from the intentional Bluesky demo reports. Physical deletion
  of reports/audit history requires a separately agreed retention policy; no
  automatic destructive deletion is enabled by this change.

## Verification

`npm test` covers payload validation, Texas boundary checks, content flags, request
limits, API authentication/error paths, normalization, and existing classification
tests. `npm run test:e2e -- tests/incident-report.spec.ts --project=chromium`
checks form validation, server errors, saved receipts, and retry idempotency with
mocked network responses. `tests/community-moderation.spec.ts` checks the reviewer UI;
`tests/community-report-map.spec.ts` checks the map and drawer handoff while retaining
the intentional Bluesky fixtures.

The database regression script `supabase/tests/community_reports.sql` is intended
for a disposable Supabase/PostGIS database **after applying migrations**. It runs
in a rolled-back transaction and checks permissions, moderation isolation, rate
limits, idempotency, expiry, and audited decisions. Do not mistake mocked API tests
for a live database verification. Production setup is incomplete until the
migration, shared-secret hash, ingress header, and moderator account are configured.
