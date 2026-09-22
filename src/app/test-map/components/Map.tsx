"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  Map,
  Source,
  Layer,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import bbox from "@turf/bbox";
import { Loader2, AlertCircle } from "lucide-react";

import type { UnifiedHazard } from "@/types/hazard";
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
} from "./MapLayers";
import { HazardDrawer } from "./HazardDrawer";
import { AlertFeedTable } from "./AlertFeedTable";
import { MapControls } from "./MapControls";
import { LayerControlDock, type LayerVisibility } from "./LayerControlDock";
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

export default function CrisisMap() {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // State
  const [hazards, setHazards] = useState<UnifiedHazard[]>([]);
  const [selectedHazard, setSelectedHazard] = useState<UnifiedHazard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Layer visibility toggles
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    nws: true,
    txdot: true,
    social: true,
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
        const nwsData = await nwsRes.value.json();
        if (Array.isArray(nwsData.features)) {
          nwsData.features.forEach((feat: any) => {
            loadedHazards.push(normalizeNwsAlert(feat));
          });
        }
      }

      if (txdotRes.status === "fulfilled" && txdotRes.value.ok) {
        const txdotData = await txdotRes.value.json();
        if (Array.isArray(txdotData.features)) {
          txdotData.features.forEach((feat: any, idx: number) => {
            loadedHazards.push(normalizeTxDotRoad(feat, idx));
          });
        }
      }

      setHazards(loadedHazards);
    } catch (err) {
      console.error("Telemetry fetch error:", err);
      setError("Failed to load active disaster telemetry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  const nwsGeoJson = useMemo(() => {
    return hazardsToGeoJson(hazards.filter((h) => h.source === "nws"));
  }, [hazards]);

  const txdotGeoJson = useMemo(() => {
    return hazardsToGeoJson(hazards.filter((h) => h.source === "txdot"));
  }, [hazards]);

  const socialGeoJson = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: MOCK_SOCIAL_ALERTS.map((post) => ({
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
  }, []);

  const handleMapClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature && feature.properties) {
      const clickedId = feature.properties.id || feature.id;
      const match = hazards.find((h) => h.id === clickedId);
      if (match) {
        setSelectedHazard(match);
      } else {
        const isSocial = MOCK_SOCIAL_ALERTS.find((s) => s.id === clickedId);
        if (isSocial) {
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
    }
  };

  const flyToHazard = (hazard: UnifiedHazard) => {
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

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full min-h-screen bg-background text-foreground"
    >
      {/* Map Viewport */}
      <div className="relative w-full h-[75vh] md:h-[80vh] bg-muted overflow-hidden border-b border-border">
        {/* Modular Top Floating Dock */}
        <MapControls
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchTelemetry();
          }}
          onResetView={resetToTexas}
        />

        {/* Modular Layer Toggle Dock */}
        <LayerControlDock
          visibility={layerVisibility}
          nwsCount={nwsGeoJson.features.length}
          txdotCount={txdotGeoJson.features.length}
          socialCount={socialGeoJson.features.length}
          onToggleLayer={(layerKey) =>
            setLayerVisibility((prev) => ({
              ...prev,
              [layerKey]: !prev[layerKey],
            }))
          }
        />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/50 backdrop-blur-xs">
            <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl shadow-xl">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs font-medium">
                Loading Texas Disaster Telemetry...
              </span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="absolute top-4 right-4 z-30 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-xl shadow-lg text-destructive text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* MapLibre Engine with Tilt Disabled */}
        <Map
          ref={mapRef}
          initialViewState={TEXAS_VIEWPORT}
          mapStyle={mapStyle}
          maxPitch={0}
          minPitch={0}
          pitchWithRotate={false}
          interactiveLayerIds={[
            ...(layerVisibility.nws ? ["nws-hazard-fill"] : []),
            ...(layerVisibility.txdot ? ["txdot-road-line"] : []),
            ...(layerVisibility.social ? ["social-alerts-points"] : []),
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

          {layerVisibility.social && socialGeoJson.features.length > 0 && (
            <Source id="social-alerts" type="geojson" data={socialGeoJson}>
              <Layer {...socialAlertsPointLayer} />
            </Source>
          )}
        </Map>

        {/* Slide-out Hazard Inspection Drawer */}
        <HazardDrawer
          hazard={selectedHazard}
          socialAlerts={MOCK_SOCIAL_ALERTS}
          onClose={() => setSelectedHazard(null)}
          onLocate={flyToHazard}
        />
      </div>

      {/* Alert Feed & Data Inspector Table */}
      <AlertFeedTable
        hazards={hazards}
        selectedHazardId={selectedHazard?.id}
        onSelectHazard={(h) => setSelectedHazard(h)}
        onLocate={flyToHazard}
      />
    </div>
  );
}
