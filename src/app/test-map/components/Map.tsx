"use client";

import { useRef, useState } from "react";
import {
  Map,
  Source,
  Layer,
  type LayerProps,
  type MapLayerMouseEvent,
  MapRef,
} from "react-map-gl/maplibre";
import { setWorkerUrl } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl("/maplibre-gl-worker.mjs");

const hardcodedHazard = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "demo-1",
        severity: "Severe",
        event: "Flash Flood Warning",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-98.95, 29.05],
            [-98.05, 29.05],
            [-98.05, 29.85],
            [-98.95, 29.85],
            [-98.95, 29.05],
          ],
        ],
      },
    },
  ],
};

const hardcodedPOI = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Downtown Shelter", type: "shelter" },
      geometry: { type: "Point", coordinates: [-98.5, 29.45] },
    },
  ],
};

const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

const hazardFillLayer: LayerProps = {
  id: "hazard-fill",
  type: "fill",
  filter: ["==", "$type", "Polygon"],
  layout: { visibility: "visible" },
  paint: { "fill-color": "#ff00ff", "fill-opacity": 0.45 },
};

const hazardOutlineLayer: LayerProps = {
  id: "hazard-outline",
  type: "line",
  filter: ["==", "$type", "Polygon"],
  layout: { visibility: "visible" },
  paint: { "line-color": "#b91c1c", "line-width": 4 },
};

const poiLayer: LayerProps = {
  id: "poi-points",
  type: "circle",
  filter: ["==", "$type", "Point"],
  layout: { visibility: "visible" },
  paint: {
    "circle-radius": 14,
    "circle-color": "#1d4ed8",
    "circle-stroke-width": 3,
    "circle-stroke-color": "#ffffff",
  },
};

export default function CrisisMap() {
  console.log("CrisisMap is rendering");
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    setSelected(feature ? (feature.properties?.id as string) : null);
  };

  const mapRef = useRef<MapRef>(null);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: -98.49, latitude: 29.42, zoom: 8 }}
        mapStyle={BASEMAP_STYLE}
        interactiveLayerIds={["hazard-fill"]}
        onClick={handleClick}
        onError={(e) => console.error("map error:", e)}
        onLoad={() => {
          const map = mapRef.current?.getMap();
          console.log(
            "layer ids:",
            map?.getStyle()?.layers?.map((l) => l.id),
          );
          console.log("hazard source:", map?.getSource("hazard"));
          console.log("poi source:", map?.getSource("poi"));
        }}
      >
        <Source id="hazard" type="geojson" data={hardcodedHazard}>
          <Layer {...hazardFillLayer} />
          <Layer {...hazardOutlineLayer} />
        </Source>
        <Source id="poi" type="geojson" data={hardcodedPOI}>
          <Layer {...poiLayer} />
        </Source>
      </Map>
      {selected && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "white",
            padding: 8,
            borderRadius: 4,
          }}
        >
          Clicked hazard: {selected}
        </div>
      )}
      <pre
        style={{
          position: "absolute",
          bottom: 0,
          background: "white",
          fontSize: 10,
        }}
      >
        {JSON.stringify(hardcodedHazard)}
      </pre>
    </div>
  );
}
