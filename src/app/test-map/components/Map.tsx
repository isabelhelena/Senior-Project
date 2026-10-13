"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  Map,
  Source,
  Layer,
  Marker,
  type MapRef,
  type MapLayerMouseEvent,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import { setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import bbox from "@turf/bbox";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  MapPin,
  TriangleAlert,
  Search,
  ZoomIn,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useLocation } from "@/context/LocationContext";
import { useCurrentWeather } from "@/hooks/use-current-weather";
import { cn } from "@/lib/utils";
import type {
  EmergencyResource,
  ResourceGroupKey,
  SocialAlert,
  UnifiedHazard,
} from "@/types/hazard";
import {
  DEFAULT_ACTIVE_RESOURCE_GROUPS,
  distanceMiles,
  emergencyResourceToHazard,
  getActiveOsmTypesForGroups,
  isAidResourceReport,
  socialAidReportToHazard,
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
  aidResourcesClusterLayer,
  aidResourcesClusterCountLayer,
  aidResourcesPointLayer,
  registerResourceIconsOnMap,
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
const MIN_RESOURCE_ZOOM = 8;

type NwsFeature = Parameters<typeof normalizeNwsAlert>[0];
type TxDotFeature = Parameters<typeof normalizeTxDotRoad>[0];

function computeRadiusMetersForZoom(zoom: number): number {
  if (zoom >= 13) return 12000;
  if (zoom >= 11) return 22000;
  if (zoom >= 9.5) return 32000;
  return 45000;
}

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
  const [openedResourceFromPanel, setOpenedResourceFromPanel] = useState(false);
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

  // Emergency resources state
  const [verifiedResources, setVerifiedResources] = useState<
    EmergencyResource[]
  >([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [activeResourceGroups, setActiveResourceGroups] = useState<
    ResourceGroupKey[]
  >(DEFAULT_ACTIVE_RESOURCE_GROUPS);
  const [resourceSearchQuery, setResourceSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [includeUnnamedResources, setIncludeUnnamedResources] = useState(false);

  // Viewport tracking for auto-fetch on pan & "Search this area"
  const [pannedCenter, setPannedCenter] = useState<[number, number] | null>(
    null,
  );
  const [viewportZoom, setViewportZoom] = useState<number>(
    SELECTED_LOCATION_ZOOM,
  );
  const [lastQueriedCenter, setLastQueriedCenter] = useState<
    [number, number] | null
  >(null);

  const viewportCenter = useMemo<[number, number]>(
    () => pannedCenter ?? [location.lng, location.lat],
    [location.lat, location.lng, pannedCenter],
  );

  const mapStyle = resolvedTheme === "light" ? CARTO_LIGHT : CARTO_DARK;
  const zoomedOutForResources = viewportZoom < MIN_RESOURCE_ZOOM;

  const hasPendingAreaSearch = useMemo(() => {
    if (
      zoomedOutForResources ||
      !debouncedSearchQuery ||
      !lastQueriedCenter
    ) {
      return false;
    }
    return distanceMiles(lastQueriedCenter, viewportCenter) >= 1.2;
  }, [
    debouncedSearchQuery,
    lastQueriedCenter,
    viewportCenter,
    zoomedOutForResources,
  ]);

  // Debounce search input
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(resourceSearchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [resourceSearchQuery]);

  const fetchTelemetry = useCallback(async () => {
    setError(null);
    try {
      const [nwsRes, txdotRes] = await Promise.allSettled([
        fetch("/api/alerts"),
        fetch("/api/road-conditions"),
      ]);

      const loadedHazards: UnifiedHazard[] = [];

      if (nwsRes.status === "fulfilled" && nwsRes.value.ok) {
        const nwsData = (await nwsRes.value.json()) as {
          features?: NwsFeature[];
        };
        if (Array.isArray(nwsData.features)) {
          nwsData.features.forEach((feat) => {
            loadedHazards.push(normalizeNwsAlert(feat));
          });
        }
      }

      if (txdotRes.status === "fulfilled" && txdotRes.value.ok) {
        const txdotData = (await txdotRes.value.json()) as {
          features?: TxDotFeature[];
        };
        if (Array.isArray(txdotData.features)) {
          txdotData.features.forEach((feat, idx) => {
            loadedHazards.push(normalizeTxDotRoad(feat, idx));
          });
        }
      }

      setHazards(loadedHazards);
    } catch (err) {
      console.error("Telemetry fetch error:", err);
      setError(
        "We could not load the latest map information. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchEmergencyResources = useCallback(
    async (
      targetCenter: [number, number],
      targetZoom: number,
      signal?: AbortSignal,
    ) => {
      const osmTypes = getActiveOsmTypesForGroups(activeResourceGroups);
      if (osmTypes.length === 0) {
        setVerifiedResources([]);
        setResourcesLoading(false);
        return;
      }

      setResourcesLoading(true);
      setResourcesError(null);

      try {
        const radiusMeters = computeRadiusMetersForZoom(targetZoom);
        const params = new URLSearchParams({
          lat: targetCenter[1].toFixed(4),
          lng: targetCenter[0].toFixed(4),
          radiusMeters: String(radiusMeters),
          types: osmTypes.join(","),
          includeUnnamed: String(includeUnnamedResources),
          limit: "250",
        });

        if (debouncedSearchQuery) {
          params.set("q", debouncedSearchQuery);
        }

        const res = await fetch(
          `/api/emergency-resources?${params.toString()}`,
          { signal },
        );
        const data = (await res.json()) as {
          resources?: EmergencyResource[];
          error?: string;
        };

        if (!res.ok) {
          throw new Error(
            data.error || "Could not load nearby emergency resources",
          );
        }

        setVerifiedResources(data.resources ?? []);
        setLastQueriedCenter(targetCenter);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        console.error("Emergency resources fetch error:", err);
        setResourcesError(
          err instanceof Error
            ? err.message
            : "Could not load local emergency resources.",
        );
      } finally {
        if (!signal?.aborted) {
          setResourcesLoading(false);
        }
      }
    },
    [activeResourceGroups, debouncedSearchQuery, includeUnnamedResources],
  );

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

  // Fetch resources automatically when filters/search change or when panning (if no active search text)
  const viewportCenterRef = useRef<[number, number]>(viewportCenter);
  const viewportZoomRef = useRef<number>(viewportZoom);
  useEffect(() => {
    viewportCenterRef.current = viewportCenter;
    viewportZoomRef.current = viewportZoom;
  }, [viewportCenter, viewportZoom]);

  // 1. Re-fetch immediately when category chips, search query, or unnamed toggle changes
  useEffect(() => {
    if (location.loading) return;
    if (viewportZoomRef.current < MIN_RESOURCE_ZOOM) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void fetchEmergencyResources(
        viewportCenterRef.current,
        viewportZoomRef.current,
        controller.signal,
      );
    });
    return () => controller.abort();
  }, [fetchEmergencyResources, location.loading]);

  // 2. When panning/zooming on the map: auto-fetch if no search query
  useEffect(() => {
    if (location.loading) return;
    if (viewportZoom < MIN_RESOURCE_ZOOM) return;
    if (debouncedSearchQuery) return;

    const movedDistance = lastQueriedCenter
      ? distanceMiles(lastQueriedCenter, viewportCenter)
      : Infinity;

    if (movedDistance < 1.2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchEmergencyResources(
        viewportCenter,
        viewportZoom,
        controller.signal,
      );
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    debouncedSearchQuery,
    fetchEmergencyResources,
    lastQueriedCenter,
    location.loading,
    viewportCenter,
    viewportZoom,
  ]);

  const handleSearchCurrentArea = useCallback(() => {
    void fetchEmergencyResources(viewportCenter, viewportZoom);
  }, [fetchEmergencyResources, viewportCenter, viewportZoom]);

  const handleMapMoveEnd = useCallback((evt: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom } = evt.viewState;
    setPannedCenter([
      Number(longitude.toFixed(4)),
      Number(latitude.toFixed(4)),
    ]);
    setViewportZoom(Number(zoom.toFixed(2)));
  }, []);

  const ensureMapIcons = useCallback(() => {
    const rawMap = mapRef.current?.getMap();
    registerResourceIconsOnMap(rawMap);
  }, []);

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

  const nearbyResourceReports = useMemo(
    () =>
      resourceReports.filter(
        (report) =>
          distanceMiles(viewportCenter, report.coordinates) <= 100,
      ),
    [resourceReports, viewportCenter],
  );

  const showCommunityAidOnMap = useMemo(
    () => activeResourceGroups.includes("community_aid"),
    [activeResourceGroups],
  );

  const filteredCommunityAidForMap = useMemo(() => {
    if (!showCommunityAidOnMap) return [];
    if (!debouncedSearchQuery) return nearbyResourceReports;
    const q = debouncedSearchQuery.toLowerCase();
    return nearbyResourceReports.filter(
      (r) =>
        r.summary.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.authorHandle?.toLowerCase().includes(q) ?? false),
    );
  }, [debouncedSearchQuery, nearbyResourceReports, showCommunityAidOnMap]);

  const resourceGeoJson = useMemo(
    () =>
      combinedAidResourcesToGeoJson(
        zoomedOutForResources ? [] : verifiedResources,
        filteredCommunityAidForMap,
      ),
    [filteredCommunityAidForMap, verifiedResources, zoomedOutForResources],
  );

  const allHazardsAndResources = useMemo(() => {
    const resourceHazards = verifiedResources.map(emergencyResourceToHazard);
    const communityAidHazards = filteredCommunityAidForMap.map((r) =>
      socialAidReportToHazard(r, viewportCenter),
    );
    return [...hazards, ...communityAidHazards, ...resourceHazards];
  }, [filteredCommunityAidForMap, hazards, verifiedResources, viewportCenter]);

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature) {
      // 1. If user clicked a resource cluster bubble, smoothly zoom in to expand it
      if (
        feature.layer?.id === "aid-resource-clusters" &&
        feature.properties?.cluster_id !== undefined
      ) {
        const clusterId = Number(feature.properties.cluster_id);
        const coords: [number, number] =
          feature.geometry.type === "Point"
            ? (feature.geometry.coordinates as [number, number])
            : [e.lngLat.lng, e.lngLat.lat];
        const rawMap = mapRef.current?.getMap();
        const source = rawMap?.getSource("aid-resources") as
          | GeoJSONSource
          | undefined;

        if (source && typeof source.getClusterExpansionZoom === "function") {
          void source
            .getClusterExpansionZoom(clusterId)
            .then((expansionZoom) => {
              mapRef.current?.flyTo({
                center: coords,
                zoom: Math.min(expansionZoom, 15),
                duration: 700,
              });
            })
            .catch(() => {
              mapRef.current?.flyTo({
                center: coords,
                zoom: Math.min(viewportZoom + 2.5, 14),
                duration: 700,
              });
            });
        } else {
          mapRef.current?.flyTo({
            center: coords,
            zoom: Math.min(viewportZoom + 2.5, 14),
            duration: 700,
          });
        }
        return;
      }

      if (feature.properties) {
        const clickedId = String(feature.properties.id || feature.id || "");

        // 2. Check if clicked an OSM verified emergency resource
        if (clickedId.startsWith("osm-")) {
          const rawId = clickedId.slice(4);
          const matchedResource = verifiedResources.find(
            (r) => r.id === rawId,
          );
          if (matchedResource) {
            setOpenedResourceFromPanel(activeSection === "resources");
            setActiveSection(null);
            setSelectedHazard(emergencyResourceToHazard(matchedResource));
            return;
          }
        }

        // 3. Check if clicked an NWS or TxDOT hazard
        const match = hazards.find((h) => h.id === clickedId);
        if (match) {
          setOpenedResourceFromPanel(false);
          setActiveSection(null);
          setSelectedHazard(match);
          return;
        }

        // 4. Check if clicked a community report / community aid point
        const isSocial = MOCK_SOCIAL_ALERTS.find((s) => s.id === clickedId);
        if (isSocial) {
          const isAid = isAidResourceReport(isSocial);
          setOpenedResourceFromPanel(isAid && activeSection === "resources");
          setActiveSection(null);
          setSelectedHazard(
            isAid
              ? socialAidReportToHazard(isSocial, viewportCenter)
              : socialReportToHazard(isSocial),
          );
          return;
        }
      }
    }

    setSelectedHazard(null);
    setOpenedResourceFromPanel(false);
    setFromMap(e.lngLat.lat, e.lngLat.lng);
  };

  const flyToHazard = (hazard: UnifiedHazard, fromResourcesPanel = false) => {
    setOpenedResourceFromPanel(
      fromResourcesPanel || activeSection === "resources",
    );
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
            zoom: Math.max(viewportZoom, 13),
            bearing: 0,
            duration: 1200,
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
              duration: 1200,
            },
          );
        }
      } catch (err) {
        console.error("FlyTo error:", err);
      }
    }
  };

  const resetToTexas = () => {
    setPannedCenter([TEXAS_VIEWPORT.longitude, TEXAS_VIEWPORT.latitude]);
    setViewportZoom(TEXAS_VIEWPORT.zoom);
    mapRef.current?.flyTo({
      center: [TEXAS_VIEWPORT.longitude, TEXAS_VIEWPORT.latitude],
      zoom: TEXAS_VIEWPORT.zoom,
      bearing: 0,
      pitch: 0,
      duration: 1200,
    });
  };

  const locateSocialReport = (report: SocialAlert) => {
    const isAid = isAidResourceReport(report);
    flyToHazard(
      isAid
        ? socialAidReportToHazard(report, viewportCenter)
        : socialReportToHazard(report),
      isAid,
    );
  };

  const locateVerifiedResource = (resource: EmergencyResource) => {
    flyToHazard(emergencyResourceToHazard(resource), true);
  };

  const toggleResourceGroup = useCallback((group: ResourceGroupKey) => {
    setActiveResourceGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group],
    );
  }, []);

  const closeInformationPanel = useCallback(() => {
    setActiveSection(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-screen w-full flex-col bg-background text-foreground"
    >
      <SupportHeader />

      <section
        aria-label="Disaster information map"
        className="relative h-[calc(100svh-4rem)] min-h-[34rem] w-full overflow-hidden bg-muted"
      >
        {/* Modular Top Floating Dock */}
        <MapControls
          refreshing={refreshing || resourcesLoading}
          onRefresh={() => {
            setRefreshing(true);
            void fetchTelemetry();
            if (!zoomedOutForResources) {
              void fetchEmergencyResources(viewportCenter, viewportZoom);
            }
          }}
          onResetView={resetToTexas}
        />

        <CompactWeatherOverlay
          locationLabel={
            location.loading ? "Finding your location…" : location.city
          }
          data={weather.data}
          loading={location.loading || weather.loading}
          error={weather.error}
        />

        {/* Floating "Search this area" or "Zoom in to load local resources" Pill */}
        {layerVisibility.resources && zoomedOutForResources ? (
          <div className="pointer-events-auto absolute left-1/2 top-16 z-10 -translate-x-1/2 sm:top-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                mapRef.current?.flyTo({
                  center: viewportCenter,
                  zoom: 9.5,
                  duration: 900,
                });
              }}
              className="h-9 gap-1.5 rounded-full bg-background/90 px-4 text-xs font-medium shadow-lg ring-1 ring-black/10 backdrop-blur-xl hover:bg-background dark:ring-white/15"
            >
              <ZoomIn className="size-3.5 text-primary" aria-hidden="true" />
              Zoom in to load local aid resources
            </Button>
          </div>
        ) : (
          layerVisibility.resources &&
          hasPendingAreaSearch && (
            <div className="pointer-events-auto absolute left-1/2 top-16 z-10 -translate-x-1/2 sm:top-4">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSearchCurrentArea}
                disabled={resourcesLoading}
                className="h-9 gap-1.5 rounded-full px-4 text-xs font-medium shadow-xl"
              >
                {resourcesLoading ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="size-3.5" aria-hidden="true" />
                )}
                Search this area
              </Button>
            </div>
          )
        )}

        <LayerControlDock
          activeSection={activeSection}
          onSelect={(section) => {
            setSelectedHazard(null);
            setOpenedResourceFromPanel(false);
            setActiveSection((current) =>
              current === section ? null : section,
            );
          }}
        />

        <Link
          href="/report"
          className={cn(
            buttonVariants(),
            "absolute bottom-24 right-3 z-10 min-h-12 gap-2 rounded-full px-5 shadow-xl sm:bottom-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2",
          )}
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
          <div
            role="alert"
            className="absolute left-3 right-3 top-16 z-30 flex items-center gap-2 rounded-xl border border-destructive/30 bg-card p-3 text-sm text-destructive shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* MapLibre Engine with Tilt Disabled */}
        <Map
          ref={mapRef}
          initialViewState={TEXAS_VIEWPORT}
          mapStyle={mapStyle}
          onLoad={() => {
            ensureMapIcons();
            moveToSelectedLocation();
          }}
          onStyleData={ensureMapIcons}
          onMoveEnd={handleMapMoveEnd}
          maxPitch={0}
          minPitch={0}
          pitchWithRotate={false}
          interactiveLayerIds={[
            ...(layerVisibility.nws ? ["nws-hazard-fill"] : []),
            ...(layerVisibility.txdot ? ["txdot-road-line"] : []),
            ...(layerVisibility.social ? ["social-alerts-points"] : []),
            ...(layerVisibility.resources
              ? ["aid-resource-clusters", "aid-resource-points"]
              : []),
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

          {layerVisibility.resources &&
            resourceGeoJson.features.length > 0 && (
              <Source
                id="aid-resources"
                type="geojson"
                data={resourceGeoJson}
                cluster={true}
                clusterMaxZoom={13}
                clusterRadius={42}
              >
                <Layer {...aidResourcesClusterLayer} />
                <Layer {...aidResourcesClusterCountLayer} />
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

        {/* Slide-out Hazard & Resource Inspection Drawer */}
        <HazardDrawer
          hazard={selectedHazard}
          socialAlerts={MOCK_SOCIAL_ALERTS}
          onClose={() => {
            setSelectedHazard(null);
            setOpenedResourceFromPanel(false);
          }}
          onLocate={(h) => flyToHazard(h, openedResourceFromPanel)}
          onBackToResources={() => {
            setSelectedHazard(null);
            setOpenedResourceFromPanel(false);
            setActiveSection("resources");
          }}
        />

        <MapInformationPanel
          section={activeSection}
          visibility={layerVisibility}
          weather={weather}
          locationLabel={location.city}
          hazards={hazards}
          communityReports={MOCK_SOCIAL_ALERTS}
          resourceReports={nearbyResourceReports}
          verifiedResources={verifiedResources}
          resourcesLoading={resourcesLoading}
          resourcesError={resourcesError}
          zoomedOutForResources={zoomedOutForResources}
          activeResourceGroups={activeResourceGroups}
          resourceSearchQuery={resourceSearchQuery}
          includeUnnamedResources={includeUnnamedResources}
          hasPendingAreaSearch={hasPendingAreaSearch}
          mapDataLoading={loading}
          onClose={closeInformationPanel}
          onToggleLayer={(layerKey) =>
            setLayerVisibility((previous) => ({
              ...previous,
              [layerKey]: !previous[layerKey],
            }))
          }
          onToggleResourceGroup={toggleResourceGroup}
          onResourceSearchChange={setResourceSearchQuery}
          onToggleIncludeUnnamed={() =>
            setIncludeUnnamedResources((prev) => !prev)
          }
          onSearchCurrentArea={handleSearchCurrentArea}
          onLocateHazard={(h) => flyToHazard(h, false)}
          onLocateReport={locateSocialReport}
          onLocateVerifiedResource={locateVerifiedResource}
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
            <span className="text-sm font-normal text-muted-foreground group-open:hidden">
              Show
            </span>
            <span className="hidden text-sm font-normal text-muted-foreground group-open:inline">
              Hide
            </span>
          </summary>

          <AlertFeedTable
            hazards={allHazardsAndResources}
            selectedHazardId={selectedHazard?.id}
            onSelectHazard={(h) => setSelectedHazard(h)}
            onLocate={(h) => flyToHazard(h, false)}
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

function combinedAidResourcesToGeoJson(
  verifiedResources: EmergencyResource[],
  communityAidReports: SocialAlert[],
) {
  const verifiedFeatures = verifiedResources.map((res) => ({
    type: "Feature" as const,
    id: `osm-${res.id}`,
    geometry: {
      type: "Point" as const,
      coordinates: res.coordinates,
    },
    properties: {
      id: `osm-${res.id}`,
      name: res.name,
      group: res.group,
      resourceType: res.resourceType,
      verified: true,
    },
  }));

  const communityFeatures = communityAidReports.map((post) => ({
    type: "Feature" as const,
    id: post.id,
    geometry: {
      type: "Point" as const,
      coordinates: post.coordinates,
    },
    properties: {
      id: post.id,
      name: post.summary,
      group: "community_aid" as const,
      resourceType: post.category,
      verified: false,
    },
  }));

  return {
    type: "FeatureCollection" as const,
    features: [...communityFeatures, ...verifiedFeatures],
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
