# Phase 2 Implementation & Telemetry Architecture

## 1. Overview & Purpose
Phase 2 establishes localized geospatial querying, upstream telemetry ingestion, and client-side coordinate synchronization for **Lone Star Support**. By filtering data to the user's immediate coordinates and surroundings, the platform eliminates bandwidth strain on degraded networks and surfaces actionable, local disaster intelligence.

---

## 2. Telemetry Endpoints & Providers

### Upstream Sources
* **National Weather Service (NWS / NOAA):** Authoritative public-domain meteorological alerts and point observation telemetry.
* **Texas Department of Transportation (TxDOT):** Real-time roadway closures, flood blockages, and traffic restrictions[cite: 1].
* **Zippopotam.us:** Free, keyless postal code geocoding API to resolve 5-digit US ZIP codes to latitude and longitude[cite: 1].

### Next.js Internal Route Handlers
| Route Endpoint | Upstream Target | Query Parameters | Role / Output |
| :--- | :--- | :--- | :--- |
| `/api/alerts` | NWS `/alerts/active` | `lat`, `lng` | Fetches active meteorological warnings and watches impacting the coordinates[cite: 1]. |
| `/api/road-conditions` | TxDOT ArcGIS FeatureServer | `lat`, `lng`, `radius` | Returns active road closures within an envelope bounding box as GeoJSON `LineString` features[cite: 1]. |
| `/api/weather-current` | NWS `/points` & `/stations` | `lat`, `lng` | Resolves the nearest station to return ambient conditions (temp, wind, humidity, weather text)[cite: 1]. |
| `/api/geocode` | Zippopotam.us | `zip` | Resolves a 5-digit ZIP code to `{ lat, lng, city, state }` for map overrides[cite: 1]. |

---

## 3. Key Architectural Decisions

* **Dropped OpenWeather:** Removed commercial APIs to eliminate rate limits, paid subscription tiers, and API key management, keeping the project within its mandatory $0.00 budget[cite: 1].
* **TxDOT Filter Hardening:** Restricted ArcGIS queries using:
  ```sql
  RDWAY_STAT <> 'Open to Traffic (All Data Input)' AND RDWAY_STAT NOT LIKE '%Proposed%'
  ```
  This prevents unbuilt or planned future highways (such as SH-68) from rendering as active road closures[cite: 1].
* **Handling NWS `geometry: null`:** NWS county advisories, heat alerts, and winter watches omit explicit polygon arrays[cite: 1]. These are handled via text summary cards and sidebar drawers rather than breaking vector layer renderers[cite: 1].
* **Spatial Envelope Queries:** Replaced statewide downloads with localized bounding box checks (`esriSpatialRelIntersects`) to keep payload sizes under the 1.5MB project threshold[cite: 1].

---

## 4. State Management: `LocationContext`

The `LocationContext` (`src/context/LocationContext.tsx`) provides centralized coordinate tracking across the platform[cite: 1]:

* **Auto-GPS Detection:** Requests browser coordinates via `navigator.geolocation` on mount[cite: 1].
* **Asynchronous Execution:** Defers fallback execution using `queueMicrotask` to avoid React cascading render warnings (`setState` inside synchronous effects)[cite: 1].
* **Local Caching:** Caches the last verified coordinate set in `localStorage` under `lss_cached_loc`[cite: 1].
* **Manual Override:** Allows typing a 5-digit ZIP code to jump to any Texas city[cite: 1].
* **Fallback Anchor:** Defaults to San Antonio Downtown (`29.4241, -98.4936`) if permissions are rejected or unavailable[cite: 1].

---

## 5. UI Components Implemented

### `WeatherSummaryCard` (`src/components/WeatherSummaryCard.tsx`)
* Receives `lat` and `lng` props directly from `LocationContext`[cite: 1].
* Queries `/api/weather-current` to display[cite: 1]:
  * Current temperature in Fahrenheit (°F)[cite: 1].
  * Weather condition icon (Rain, Lightning, Sun, Clouds)[cite: 1].
  * Wind speed (mph) and heading angle (°)[cite: 1].
  * Relative humidity percentage (%)[cite: 1].
  * Name of the reporting NWS observation station[cite: 1].

### Diagnostic Test Suite (`src/app/test-feeds/page.tsx`)
* Live coordinate bar displaying current location, source (`gps`, `zip`, or `fallback`), and manual ZIP input form[cite: 1].
* Direct probe buttons for testing NWS point alerts and TxDOT 25-mile roadway conditions[cite: 1].
* Real-time GeoJSON payload inspector tabs to inspect feature attributes and geometry before rendering to MapLibre GL[cite: 1].

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
