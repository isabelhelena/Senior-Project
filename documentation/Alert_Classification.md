# Alert categories and urgency

`src/types/hazard.ts` defines the shared application vocabulary. Its categories
match `disaster_category` in `schema.sql`; stored urgency levels match
`urgency_level`. `unknown` is an additional display-only urgency fallback.

`src/lib/alert-classification.ts` converts incoming labels:

| Source value | Application value |
| --- | --- |
| Existing canonical category or urgency | Unchanged |
| `moderate` urgency (Bluesky, report form, NWS severity) | `medium` |
| `high` report severity | `severe` |
| NWS `minor` / `extreme` severity | `low` / `critical` |
| `severe_weather`, `wildfire`, `mutual_aid` | `other` |
| `medical`, `water_relief_resource`, `other_disaster_hazard` | `other` |
| Unrecognized/missing category | `other` |
| Unrecognized/missing urgency | `unknown` |

Broad categories are not guessed into narrower ones: mutual aid does not imply
a shelter, and general water/relief does not imply a water station. Source labels
are preserved in `sourceClassification` on normalized social alerts and report
payloads. NWS retains its original properties in `rawProperties` and uses
`severity`, not its separate CAP `urgency` field, for this conversion.

Use `normalizeSocialAlert` after decoding a social record's field names and
coordinates, before giving it to map components. Map fixtures already use this
adapter. A future live social endpoint must use it too; live social fetching is
not added by this change. The report validator returns canonical `category` and
`urgency`, with original choices retained in `sourceClassification`; the report
form still does not persist submissions.

Bluesky extraction rules, stored source records, and database enums are unchanged.
If more specific application categories are needed later, extend the vocabulary
and database enum together rather than silently treating unlike categories as
equivalent.

Run `npm test` to check mappings, database/worker vocabulary alignment, source
preservation, NWS conversion, and report validation.
