# Crisis Map (`/test-map`)

Interactive MapLibre GL map and telemetry inspector built with Next.js App Router, `react-map-gl/maplibre`, Tailwind CSS, and shadcn/ui.

## Data layers and sources

| Map feature / panel | Source | Details |
| --- | --- | --- |
| **Weather polygons & advisories** | `GET /api/alerts` | Stored statewide NWS GeoJSON from Supabase `public_alerts`. Missing polygons are resolved into county/marine zone boundaries by `workers/official/worker.py`; `hazardsToGeoJson` preserves null-geometry bulletins in the panel and table. |
| **Road conditions** | `GET /api/road-conditions` | Stored statewide TxDOT Roadway Status linestrings from Supabase `public_alerts`, excluding open-to-traffic, artificial-centerline, and proposed segments. |
| **Emergency resources (OSM)** | `GET /api/emergency-resources` | PostGIS nearest-neighbor query (`get_nearby_emergency_resources`) loaded automatically at zoom `>= 8`, clustered in WebGL with 5 procedural canvas badge icons (`shelters`, `food_water`, `medical`, `responders`, `community_aid`) and an unnamed water-tap/shelter toggle. |
| **Reviewed community reports** | `GET /api/community-reports` | Moderator-approved, unexpired citizen submissions from `/report`. Rendered on the map (`social-alerts-points`) and under **Reviewed submissions** in the Community panel. |
| **Bluesky demo fixtures** | `src/app/test-map/data/mockSocialAlerts.ts` | Static `MOCK_SOCIAL_ALERTS` fixtures passed through `normalizeSocialAlert`. Displayed under **Bluesky demo reports**, as **Community Aid** items in Shelters & Aid, and inside `HazardDrawer`'s Community tab (`@turf/boolean-point-in-polygon`). |
| **Ambient weather & geocoding** | `GET /api/weather-current`, `GET /api/geocode` | Current NWS station observations for the selected GPS, ZIP, or clicked map location. |

## Component layout

```text
src/app/test-map/
├── page.tsx                          # Client-only entrypoint (next/dynamic, ssr: false)
├── data/
│   └── mockSocialAlerts.ts           # Static Bluesky fixture dataset
└── components/
    ├── Map.tsx                       # MapLibre state, data polling, resource auto-fetch, click handling
    ├── SupportHeader.tsx             # Header with ZIP search and GPS reset
    ├── CompactWeatherOverlay.tsx     # Top-left floating current weather pill
    ├── MapControls.tsx               # Top-right theme toggle, refresh button, and "Show all of Texas" reset
    ├── LayerControlDock.tsx          # Bottom-left dock (Weather, Roads, Shelters & Aid, Community)
    ├── MapInformationPanel.tsx       # Slide-out panel for layer toggles, resource filters/search, and lists
    ├── MapLayers.ts                  # MapLibre layer styles and canvas icon registration
    ├── HazardDrawer.tsx              # Hazard details, Turf spatial chatter tab, and ResourceDetailDrawer
    └── AlertFeedTable.tsx            # Filterable record cards inside the "Technical Details" accordion
```

## Key behaviors

- **Orthographic 2D camera:** Tilt is locked (`maxPitch={0}`, `minPitch={0}`, `pitchWithRotate={false}`). The map button in `MapControls` (`Show all of Texas`) resets the camera to `[-99.9018, 31.5]`, zoom `6`, bearing `0`, pitch `0`.
- **Visible-tab refresh:** `Map.tsx` reloads `/api/alerts`, `/api/road-conditions`, and `/api/community-reports` every 60 seconds while the tab is visible and surfaces stale-feed warnings (`> 30` minutes old).
- **Theme-aware basemaps:** `next-themes` switches between CARTO Positron (light) and Dark Matter (dark) vector styles, re-registering procedural resource icons on `onStyleData`.
- **Viewport resource loading:** When zoomed in (`zoom >= 8`), panning >= 1.2 miles auto-fetches nearby OSM facilities (or shows a **Search this area** pill when a search query is active).

## Local usage

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000/test-map`. See [`documentation/API_Setup.md`](../../../documentation/API_Setup.md) for `.env.local` setup.
