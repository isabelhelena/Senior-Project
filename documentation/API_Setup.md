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
=======
### Upstream Sources
* **National Weather Service (NWS / NOAA):** Authoritative public-domain meteorological alerts and point observation telemetry.
* **Texas Department of Transportation (TxDOT):** Real-time roadway closures, flood blockages, and traffic restrictions.
* **Zippopotam.us:** Free, keyless postal code geocoding API to resolve 5-digit US ZIP codes to latitude and longitude.

### Next.js Internal Route Handlers
| Route Endpoint | Upstream Target | Query Parameters | Role / Output |
| :--- | :--- | :--- | :--- |
| `/api/alerts` | NWS `/alerts/active` | `lat`, `lng` | Fetches active meteorological warnings and watches impacting the coordinates. |
| `/api/road-conditions` | TxDOT ArcGIS FeatureServer | `lat`, `lng`, `radius` | Returns active road closures within an envelope bounding box as GeoJSON `LineString` features. |
| `/api/weather-current` | NWS `/points` & `/stations` | `lat`, `lng` | Resolves the nearest station to return ambient conditions (temp, wind, humidity, weather text). |
| `/api/geocode` | Zippopotam.us | `zip` | Resolves a 5-digit ZIP code to `{ lat, lng, city, state }` for map overrides. |

---

## 3. Key Architectural Decisions

* **Dropped OpenWeather:** Removed commercial APIs to eliminate rate limits, paid subscription tiers, and API key management, keeping the project within its mandatory $0.00 budget.
* **TxDOT Filter Hardening:** Restricted ArcGIS queries using:
  ```sql
  RDWAY_STAT <> 'Open to Traffic (All Data Input)' AND RDWAY_STAT NOT LIKE '%Proposed%'
  ```
  This prevents unbuilt or planned future highways (such as SH-68) from rendering as active road closures.
* **Handling NWS `geometry: null`:** NWS county advisories, heat alerts, and winter watches omit explicit polygon arrays. These are handled via text summary cards and sidebar drawers rather than breaking vector layer renderers.
* **Spatial Envelope Queries:** Replaced statewide downloads with localized bounding box checks (`esriSpatialRelIntersects`) to keep payload sizes under the 1.5MB project threshold.

---

## 4. State Management: `LocationContext`

The `LocationContext` (`src/context/LocationContext.tsx`) provides centralized coordinate tracking across the platform:

* **Auto-GPS Detection:** Requests browser coordinates via `navigator.geolocation` on mount.
* **Asynchronous Execution:** Defers fallback execution using `queueMicrotask` to avoid React cascading render warnings (`setState` inside synchronous effects).
* **Local Caching:** Caches the last verified coordinate set in `localStorage` under `lss_cached_loc`.
* **Manual Override:** Allows typing a 5-digit ZIP code to jump to any Texas city.
* **Fallback Anchor:** Defaults to San Antonio Downtown (`29.4241, -98.4936`) if permissions are rejected or unavailable.

---

## 5. UI Components Implemented

### `WeatherSummaryCard` (`src/components/WeatherSummaryCard.tsx`)
* Receives `lat` and `lng` props directly from `LocationContext`.
* Queries `/api/weather-current` to display:
  * Current temperature in Fahrenheit (°F).
  * Weather condition icon (Rain, Lightning, Sun, Clouds).
  * Wind speed (mph) and heading angle (°).
  * Relative humidity percentage (%).
  * Name of the reporting NWS observation station.

### Diagnostic Test Suite (`src/app/test-feeds/page.tsx`)
* Live coordinate bar displaying current location, source (`gps`, `zip`, or `fallback`), and manual ZIP input form.
* Direct probe buttons for testing NWS point alerts and TxDOT 25-mile roadway conditions.
* Real-time GeoJSON payload inspector tabs to inspect feature attributes and geometry before rendering to MapLibre GL.

---

## 6. Directory Layout

```text
src/
├── app/
│   ├── api/
│   │   ├── alerts/
│   │   │   └── route.ts             # Localized NWS alert proxy
│   │   ├── geocode-zip/
│   │   │   └── route.ts             # Zero-cost postal geocoder
│   │   ├── road-conditions/
│   │   │   └── route.ts             # TxDOT ArcGIS spatial proxy
│   │   └── weather-current/
│   │       └── route.ts             # NWS ambient observation station parser
│   ├── test-feeds/
│   │   └── page.tsx                 # Diagnostic telemetry test harness
│   └── layout.tsx                   # Global layout wrapped in LocationProvider
├── components/
│   ├── DisasterMap.tsx              # MapLibre GL vector canvas component
│   └── WeatherSummaryCard.tsx       # Live ambient weather card
└── context/
    └── LocationContext.tsx          # Geolocation state & storage
```
