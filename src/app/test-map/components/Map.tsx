"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  Map,
  Source,
  Layer,
  Marker,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import bbox from "@turf/bbox";
import Link from "next/link";
import { Loader2, AlertCircle, MapPin, TriangleAlert } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useLocation } from "@/context/LocationContext";
import { useCurrentWeather } from "@/hooks/use-current-weather";
import { cn } from "@/lib/utils";
import type { UnifiedHazard } from "@/types/hazard";
import type { SocialAlert } from "@/types/hazard";
import {
  distanceMiles,
  isAidResourceReport,
} from "@/lib/community-resources";
import {
  normalizeNwsAlert,
  normalizeTxDotRoad,
  hazardsToGeoJson,
} from "@/lib/normalizers";
import {
  nwsHazardFillLayer,
  nwsHazardOutlineLayer,
  txdotRoadLayer,
  socialAlertsPointLayer,
  aidResourcesPointLayer,
} from "./MapLayers";
import { HazardDrawer } from "./HazardDrawer";
import { AlertFeedTable } from "./AlertFeedTable";
import { MapControls } from "./MapControls";
import {
  LayerControlDock,
  type InformationSection,
  type LayerVisibility,
} from "./LayerControlDock";
import { CompactWeatherOverlay } from "./CompactWeatherOverlay";
import { MapInformationPanel } from "./MapInformationPanel";
import { SupportHeader } from "./SupportHeader";
import { MOCK_SOCIAL_ALERTS } from "../data/mockSocialAlerts";

if (typeof window !== "undefined") {
  setWorkerUrl("/maplibre-gl-worker.mjs");
}

const CARTO_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_LIGHT =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Default Texas center viewport
const TEXAS_VIEWPORT = {
  longitude: -99.9018,
  latitude: 31.5,
  zoom: 6,
};

const SELECTED_LOCATION_ZOOM = 10;

type NwsFeature = Parameters<typeof normalizeNwsAlert>[0];
type TxDotFeature = Parameters<typeof normalizeTxDotRoad>[0];

export default function CrisisMap() {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const { location, setFromMap } = useLocation();
  const weather = useCurrentWeather(
    location.loading ? undefined : location.lat,
    location.loading ? undefined : location.lng,
  );

  // State
  const [hazards, setHazards] = useState<UnifiedHazard[]>([]);
  const [selectedHazard, setSelectedHazard] = useState<UnifiedHazard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] =
    useState<InformationSection | null>(null);

  // Layer visibility toggles
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    nws: true,
    txdot: true,
    social: true,
    resources: true,
  });

  const mapStyle = resolvedTheme === "light" ? CARTO_LIGHT : CARTO_DARK;

  const fetchTelemetry = useCallback(async () => {
    setError(null);
    try {
      const [nwsRes, txdotRes] = await Promise.allSettled([
        fetch("/api/alerts"),
        fetch("/api/road-conditions"),
      ]);

      const loadedHazards: UnifiedHazard[] = [];

      if (nwsRes.status === "fulfilled" && nwsRes.value.ok) {
        const nwsData = (await nwsRes.value.json()) as { features?: NwsFeature[] };
        if (Array.isArray(nwsData.features)) {
          nwsData.features.forEach((feat) => {
            loadedHazards.push(normalizeNwsAlert(feat));
          });
        }
      }

      if (txdotRes.status === "fulfilled" && txdotRes.value.ok) {
        const txdotData = (await txdotRes.value.json()) as { features?: TxDotFeature[] };
        if (Array.isArray(txdotData.features)) {
          txdotData.features.forEach((feat, idx) => {
            loadedHazards.push(normalizeTxDotRoad(feat, idx));
          });
        }
      }

      setHazards(loadedHazards);
    } catch (err) {
      console.error("Telemetry fetch error:", err);
      setError("We could not load the latest map information. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchTelemetry();
    });
  }, [fetchTelemetry]);

  const moveToSelectedLocation = useCallback(() => {
    if (location.loading) return;

    mapRef.current?.flyTo({
      center: [location.lng, location.lat],
      zoom: SELECTED_LOCATION_ZOOM,
      bearing: 0,
      pitch: 0,
      duration: 1200,
    });
  }, [location.lat, location.lng, location.loading]);

  useEffect(() => {
    moveToSelectedLocation();
  }, [moveToSelectedLocation]);

  const nwsGeoJson = useMemo(() => {
    return hazardsToGeoJson(hazards.filter((h) => h.source === "nws"));
  }, [hazards]);

  const txdotGeoJson = useMemo(() => {
    return hazardsToGeoJson(hazards.filter((h) => h.source === "txdot"));
  }, [hazards]);

  const resourceReports = useMemo(
    () => MOCK_SOCIAL_ALERTS.filter(isAidResourceReport),
    [],
  );

  const communityReports = useMemo(
    () =>
      layerVisibility.resources
        ? MOCK_SOCIAL_ALERTS.filter((report) => !isAidResourceReport(report))
        : MOCK_SOCIAL_ALERTS,
    [layerVisibility.resources],
  );

  const communityGeoJson = useMemo(
    () => socialReportsToGeoJson(communityReports),
    [communityReports],
  );
  const resourceGeoJson = useMemo(
    () => socialReportsToGeoJson(resourceReports),
    [resourceReports],
  );
  const nearbyResourceReports = useMemo(
    () =>
      resourceReports.filter(
        (report) =>
          distanceMiles([location.lng, location.lat], report.coordinates) <= 100,
      ),
    [location.lat, location.lng, resourceReports],
  );

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature && feature.properties) {
      const clickedId = feature.properties.id || feature.id;
      const match = hazards.find((h) => h.id === clickedId);
      if (match) {
        setActiveSection(null);
        setSelectedHazard(match);
      } else {
        const isSocial = MOCK_SOCIAL_ALERTS.find((s) => s.id === clickedId);
        if (isSocial) {
          setActiveSection(null);
          setSelectedHazard({
            id: isSocial.id,
            source: "bluesky",
            externalId: isSocial.blueskyUri,
            headline: isSocial.summary,
            category: isSocial.category,
            urgency: isSocial.urgency,
            hasGeometry: true,
            geometry: { type: "Point", coordinates: isSocial.coordinates },
            createdAt: isSocial.createdAt,
          });
        }
      }
    } else {
      setSelectedHazard(null);
      setFromMap(e.lngLat.lat, e.lngLat.lng);
    }
  };

  const flyToHazard = (hazard: UnifiedHazard) => {
    setActiveSection(null);
    setSelectedHazard(hazard);

    if (hazard.hasGeometry && hazard.geometry) {
      containerRef.current?.scrollIntoView({ behavior: "smooth" });

      try {
        const bounds = bbox(hazard.geometry);
        const [minX, minY, maxX, maxY] = bounds;

        if (minX === maxX && minY === maxY) {
          mapRef.current?.flyTo({
            center: [minX, minY],
            zoom: 12,
            bearing: 0,
            duration: 1400,
          });
        } else {
          mapRef.current?.fitBounds(
            [
              [minX, minY],
              [maxX, maxY],
            ],
            {
              padding: 90,
              maxZoom: 13,
              bearing: 0,
              duration: 1400,
            },
          );
        }
      } catch (err) {
        console.error("FlyTo error:", err);
      }
    }
  };

  const resetToTexas = () => {
    mapRef.current?.flyTo({
      center: [TEXAS_VIEWPORT.longitude, TEXAS_VIEWPORT.latitude],
      zoom: TEXAS_VIEWPORT.zoom,
      bearing: 0,
      pitch: 0,
      duration: 1200,
    });
  };

  const locateSocialReport = (report: SocialAlert) => {
    flyToHazard(socialReportToHazard(report));
  };

  const closeInformationPanel = useCallback(() => {
    setActiveSection(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-screen w-full flex-col bg-background text-foreground"
    >
      <SupportHeader />

      <section aria-label="Disaster information map" className="relative h-[calc(100svh-4rem)] min-h-[34rem] w-full overflow-hidden bg-muted">
        {/* Modular Top Floating Dock */}
        <MapControls
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchTelemetry();
          }}
          onResetView={resetToTexas}
        />

        <CompactWeatherOverlay
          locationLabel={location.loading ? "Finding your location…" : location.city}
          data={weather.data}
          loading={location.loading || weather.loading}
          error={weather.error}
        />

        <LayerControlDock
          activeSection={activeSection}
          onSelect={(section) => {
            setSelectedHazard(null);
            setActiveSection((current) => current === section ? null : section);
          }}
        />

        <Link
          href="/report"
          className={cn(buttonVariants(), "absolute bottom-24 right-3 z-10 min-h-12 gap-2 rounded-full px-5 shadow-xl sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2")}
        >
          <TriangleAlert aria-hidden="true" />
          Report
        </Link>

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/50 backdrop-blur-xs">
            <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl shadow-xl">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-sm font-medium">
                Loading the latest map information…
              </span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div role="alert" className="absolute left-3 right-3 top-16 z-30 flex items-center gap-2 rounded-xl border border-destructive/30 bg-card p-3 text-sm text-destructive shadow-lg sm:left-auto sm:right-4 sm:max-w-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* MapLibre Engine with Tilt Disabled */}
        <Map
          ref={mapRef}
          initialViewState={TEXAS_VIEWPORT}
          mapStyle={mapStyle}
          onLoad={moveToSelectedLocation}
          maxPitch={0}
          minPitch={0}
          pitchWithRotate={false}
          interactiveLayerIds={[
            ...(layerVisibility.nws ? ["nws-hazard-fill"] : []),
            ...(layerVisibility.txdot ? ["txdot-road-line"] : []),
            ...(layerVisibility.social ? ["social-alerts-points"] : []),
            ...(layerVisibility.resources ? ["aid-resource-points"] : []),
          ]}
          onClick={handleMapClick}
          cursor={selectedHazard ? "pointer" : "grab"}
        >
          {layerVisibility.nws && nwsGeoJson.features.length > 0 && (
            <Source id="nws-hazards" type="geojson" data={nwsGeoJson}>
              <Layer {...nwsHazardFillLayer} />
              <Layer {...nwsHazardOutlineLayer} />
            </Source>
          )}

          {layerVisibility.txdot && txdotGeoJson.features.length > 0 && (
            <Source id="txdot-roads" type="geojson" data={txdotGeoJson}>
              <Layer {...txdotRoadLayer} />
            </Source>
          )}

          {layerVisibility.social && communityGeoJson.features.length > 0 && (
            <Source id="social-alerts" type="geojson" data={communityGeoJson}>
              <Layer {...socialAlertsPointLayer} />
            </Source>
          )}

          {layerVisibility.resources && resourceGeoJson.features.length > 0 && (
            <Source id="aid-resources" type="geojson" data={resourceGeoJson}>
              <Layer {...aidResourcesPointLayer} />
            </Source>
          )}

          {!location.loading && (
            <Marker
              longitude={location.lng}
              latitude={location.lat}
              anchor="bottom"
            >
              <div
                role="img"
                aria-label={`Selected weather location: ${location.city}`}
                className="flex size-10 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg"
              >
                <MapPin className="size-5" aria-hidden="true" />
              </div>
            </Marker>
          )}
        </Map>

        {/* Slide-out Hazard Inspection Drawer */}
        <HazardDrawer
          hazard={selectedHazard}
          socialAlerts={MOCK_SOCIAL_ALERTS}
          onClose={() => setSelectedHazard(null)}
          onLocate={flyToHazard}
        />

        <MapInformationPanel
          section={activeSection}
          visibility={layerVisibility}
          weather={weather}
          locationLabel={location.city}
          hazards={hazards}
          communityReports={MOCK_SOCIAL_ALERTS}
          resourceReports={nearbyResourceReports}
          mapDataLoading={loading}
          onClose={closeInformationPanel}
          onToggleLayer={(layerKey) =>
            setLayerVisibility((previous) => ({
              ...previous,
              [layerKey]: !previous[layerKey],
            }))
          }
          onLocateHazard={flyToHazard}
          onLocateReport={locateSocialReport}
        />
      </section>

      <main className="mx-auto w-full max-w-screen-2xl px-4 py-3 sm:px-6">
        <details className="group overflow-hidden rounded-xl border border-border/60 bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-semibold outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-6 [&::-webkit-details-marker]:hidden">
            <span>
              Technical Details
              <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
                Detailed source records and map data for developers
              </span>
            </span>
            <span className="text-sm font-normal text-muted-foreground group-open:hidden">Show</span>
            <span className="hidden text-sm font-normal text-muted-foreground group-open:inline">Hide</span>
          </summary>

          <AlertFeedTable
            hazards={hazards}
            selectedHazardId={selectedHazard?.id}
            onSelectHazard={(h) => setSelectedHazard(h)}
            onLocate={flyToHazard}
          />
        </details>
      </main>
    </div>
  );
}

function socialReportsToGeoJson(reports: SocialAlert[]) {
  return {
    type: "FeatureCollection" as const,
    features: reports.map((post) => ({
      type: "Feature" as const,
      id: post.id,
      geometry: {
        type: "Point" as const,
        coordinates: post.coordinates,
      },
      properties: {
        id: post.id,
        summary: post.summary,
        category: post.category,
        urgency: post.urgency,
        author: post.authorHandle,
      },
    })),
  };
}

function socialReportToHazard(report: SocialAlert): UnifiedHazard {
  return {
    id: report.id,
    source: "bluesky",
    externalId: report.blueskyUri,
    headline: report.summary,
    category: report.category,
    urgency: report.urgency,
    hasGeometry: true,
    geometry: { type: "Point", coordinates: report.coordinates },
    createdAt: report.createdAt,
  };
}
