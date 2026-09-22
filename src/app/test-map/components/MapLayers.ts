import type { LayerProps } from "react-map-gl/maplibre";

/**
 * NWS Weather Alerts - Semi-transparent fill layer
 */
export const nwsHazardFillLayer: LayerProps = {
  id: "nws-hazard-fill",
  type: "fill",
  filter: ["==", "$type", "Polygon"],
  paint: {
    "fill-color": [
      "match",
      ["get", "urgency"],
      "critical",
      "#dc2626", // Red for tornado / flash flood emergency
      "severe",
      "#ea580c", // Orange for severe thunderstorm / flood warning
      "medium",
      "#eab308", // Yellow for watch / advisory
      "low",
      "#3b82f6", // Blue for minor
      "#64748b", // Default slate
    ],
    "fill-opacity": 0.35,
  },
};

/**
 * NWS Weather Alerts - Crisp polygon boundary
 */
export const nwsHazardOutlineLayer: LayerProps = {
  id: "nws-hazard-outline",
  type: "line",
  filter: ["==", "$type", "Polygon"],
  paint: {
    "line-color": [
      "match",
      ["get", "urgency"],
      "critical",
      "#991b1b",
      "severe",
      "#c2410c",
      "medium",
      "#a16207",
      "low",
      "#1d4ed8",
      "#475569",
    ],
    "line-width": 2.5,
  },
};

/**
 * TxDOT Road Conditions / Closures - High visibility LineString
 */
export const txdotRoadLayer: LayerProps = {
  id: "txdot-road-line",
  type: "line",
  filter: ["==", "$type", "LineString"],
  paint: {
    "line-color": [
      "match",
      ["get", "urgency"],
      "critical",
      "#ef4444",
      "severe",
      "#f97316",
      "medium",
      "#facc15",
      "#94a3b8",
    ],
    "line-width": 3.5,
    "line-dasharray": [2, 1],
  },
};

/**
 * Social Alert Points (Bluesky firehose)
 */
export const socialAlertsPointLayer: LayerProps = {
  id: "social-alerts-points",
  type: "circle",
  filter: ["==", "$type", "Point"],
  paint: {
    "circle-radius": 7,
    "circle-color": "#0ea5e9", // Sky blue for social posts
    "circle-stroke-width": 2,
    "circle-stroke-color": "#ffffff",
  },
};

/**
 * Community-reported shelter and aid points
 */
export const aidResourcesPointLayer: LayerProps = {
  id: "aid-resource-points",
  type: "circle",
  filter: ["==", "$type", "Point"],
  paint: {
    "circle-radius": 8,
    "circle-color": "#16a34a",
    "circle-stroke-width": 2.5,
    "circle-stroke-color": "#ffffff",
  },
};
