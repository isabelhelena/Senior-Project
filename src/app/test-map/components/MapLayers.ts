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
 * Clustered Aid & Emergency Resources - Circle bubble for clusters
 */
export const aidResourcesClusterLayer: LayerProps = {
  id: "aid-resource-clusters",
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#0d9488", // Teal for small clusters (< 15)
      15,
      "#0284c7", // Sky blue for medium clusters (15 - 49)
      50,
      "#4f46e5", // Indigo for large clusters (50+)
    ],
    "circle-radius": [
      "step",
      ["get", "point_count"],
      17,
      15,
      21,
      50,
      25,
    ],
    "circle-stroke-width": 2.5,
    "circle-stroke-color": "#ffffff",
  },
};

/**
 * Clustered Aid & Emergency Resources - Count label inside cluster bubble
 */
export const aidResourcesClusterCountLayer: LayerProps = {
  id: "aid-resource-cluster-count",
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-size": 12,
    "text-allow-overlap": true,
  },
  paint: {
    "text-color": "#ffffff",
  },
};

/**
 * Unclustered Aid & Emergency Resource Points - Distinct icon per high-level group
 */
export const aidResourcesPointLayer: LayerProps = {
  id: "aid-resource-points",
  type: "symbol",
  filter: ["!", ["has", "point_count"]],
  layout: {
    "icon-image": ["concat", "resource-icon-", ["get", "group"]],
    "icon-size": 0.95,
    "icon-allow-overlap": true,
    "icon-ignore-placement": false,
  },
};

interface MapImageTarget {
  hasImage: (id: string) => boolean;
  addImage: (
    id: string,
    image: { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
    options?: { pixelRatio?: number },
  ) => void;
}

const ICON_CONFIGS: Array<{
  id: string;
  bg: string;
  dashedRing?: boolean;
  drawGlyph: (ctx: CanvasRenderingContext2D, center: number) => void;
}> = [
  {
    id: "resource-icon-shelters",
    bg: "#16a34a",
    drawGlyph: (ctx, c) => {
      // Shelter roof + house base
      ctx.beginPath();
      ctx.moveTo(c - 11, c - 1);
      ctx.lineTo(c, c - 11);
      ctx.lineTo(c + 11, c - 1);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(c - 7, c - 2);
      ctx.lineTo(c - 7, c + 9);
      ctx.lineTo(c + 7, c + 9);
      ctx.lineTo(c + 7, c - 2);
      ctx.stroke();

      ctx.fillRect(c - 2.5, c + 2, 5, 7);
    },
  },
  {
    id: "resource-icon-food_water",
    bg: "#0284c7",
    drawGlyph: (ctx, c) => {
      // Water droplet
      ctx.beginPath();
      ctx.moveTo(c, c - 11);
      ctx.bezierCurveTo(c + 9, c - 1, c + 8, c + 10, c, c + 10);
      ctx.bezierCurveTo(c - 8, c + 10, c - 9, c - 1, c, c - 11);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    id: "resource-icon-medical",
    bg: "#e11d48",
    drawGlyph: (ctx, c) => {
      // Crisp medical cross
      ctx.fillRect(c - 3, c - 10, 6, 20);
      ctx.fillRect(c - 10, c - 3, 20, 6);
    },
  },
  {
    id: "resource-icon-responders",
    bg: "#4f46e5",
    drawGlyph: (ctx, c) => {
      // Responder shield silhouette
      ctx.beginPath();
      ctx.moveTo(c, c - 11);
      ctx.lineTo(c + 9, c - 7);
      ctx.lineTo(c + 9, c + 1);
      ctx.quadraticCurveTo(c + 8, c + 8, c, c + 11);
      ctx.quadraticCurveTo(c - 8, c + 8, c - 9, c + 1);
      ctx.lineTo(c - 9, c - 7);
      ctx.closePath();
      ctx.stroke();

      // Inner star / cross bar
      ctx.fillRect(c - 2, c - 5, 4, 10);
      ctx.fillRect(c - 5, c - 2, 10, 4);
    },
  },
  {
    id: "resource-icon-community_aid",
    bg: "#d97706",
    dashedRing: true,
    drawGlyph: (ctx, c) => {
      // Speech bubble / community report pin
      ctx.beginPath();
      ctx.roundRect(c - 9, c - 9, 18, 13, 3.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(c - 3, c + 4);
      ctx.lineTo(c - 6, c + 10);
      ctx.lineTo(c + 2, c + 4);
      ctx.closePath();
      ctx.fill();
    },
  },
];

/**
 * Registers high-DPI badge icons for all 5 resource groups on a MapLibre instance.
 * Safe to call whenever the map loads or changes theme style.
 */
export function registerResourceIconsOnMap(map: MapImageTarget | null | undefined) {
  if (!map || typeof document === "undefined") return;

  const size = 64;
  const center = size / 2;
  const radius = 24;

  for (const config of ICON_CONFIGS) {
    if (map.hasImage(config.id)) continue;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    // Subtle drop shadow
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;

    // Colored circle fill
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = config.bg;
    ctx.fill();
    ctx.restore();

    // Crisp outer border (dashed for unverified community aid, solid for verified OSM)
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    if (config.dashedRing) {
      ctx.setLineDash([5, 3]);
    }
    ctx.stroke();
    ctx.restore();

    // White glyph inside badge
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    config.drawGlyph(ctx, center);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, size, size);
    map.addImage(
      config.id,
      {
        width: size,
        height: size,
        data: imageData.data,
      },
      { pixelRatio: 2 },
    );
  }
}
