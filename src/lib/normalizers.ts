import type { Feature, Geometry } from "geojson";
import type { DisasterCategory, UnifiedHazard, UrgencyLevel } from "@/types/hazard";

/**
 * Raw NWS GeoJSON Feature shape based on api.weather.gov/alerts
 */
interface RawNwsFeature {
  id?: string;
  type: string;
  geometry: Geometry | null;
  properties?: {
    id?: string;
    event?: string;
    headline?: string;
    description?: string;
    instruction?: string;
    severity?: string;
    urgency?: string;
    areaDesc?: string;
    effective?: string;
    expires?: string;
    sent?: string;
    [key: string]: unknown;
  };
}

/**
 * Raw TxDOT ArcGIS Feature shape
 */
interface RawTxDotFeature {
  id?: string | number;
  type: string;
  geometry: Geometry | null;
  properties?: {
    RTE_NM?: string;
    RDWAY_STAT?: string;
    BEGIN_DFO?: number;
    END_DFO?: number;
    [key: string]: unknown;
  };
}

/**
 * Infers `disaster_category` enum from NWS alert text
 */
function inferNwsCategory(event = "", headline = ""): DisasterCategory {
  const text = `${event} ${headline}`.toLowerCase();
  if (text.includes("flood") || text.includes("flash flood") || text.includes("surge")) {
    return "flood";
  }
  if (text.includes("tornado")) {
    return "tornado";
  }
  if (
    text.includes("freeze") ||
    text.includes("winter") ||
    text.includes("ice") ||
    text.includes("snow") ||
    text.includes("blizzard") ||
    text.includes("frost")
  ) {
    return "freeze";
  }
  if (text.includes("power") || text.includes("outage")) {
    return "power_outage";
  }
  return "other";
}

/**
 * Maps NWS severity to `urgency_level` enum in schema.sql
 */
function mapNwsUrgency(severity = ""): UrgencyLevel {
  switch (severity.toLowerCase()) {
    case "extreme":
      return "critical";
    case "severe":
      return "severe";
    case "moderate":
      return "medium";
    case "minor":
      return "low";
    default:
      return "unknown";
  }
}

/**
 * Maps TxDOT roadway status to `urgency_level`
 */
function mapTxDotUrgency(status = ""): UrgencyLevel {
  const lower = status.toLowerCase();
  if (
    lower.includes("closed") ||
    lower.includes("flooded") ||
    lower.includes("water") ||
    lower.includes("impasse")
  ) {
    return "severe";
  }
  if (lower.includes("lane") || lower.includes("caution") || lower.includes("hazard")) {
    return "medium";
  }
  return "low";
}

/**
 * Normalizes an NWS GeoJSON Feature into `UnifiedHazard`.
 * Note: Features with `geometry: null` are preserved with `hasGeometry: false`.
 */
export function normalizeNwsAlert(feature: RawNwsFeature): UnifiedHazard {
  const p = feature.properties || {};
  const id = p.id || feature.id || `nws-${Math.random().toString(36).slice(2, 9)}`;
  const event = p.event || "Weather Alert";
  const headline = p.headline || event;

  return {
    id,
    source: "nws",
    externalId: p.id || id,
    headline,
    description: p.description || undefined,
    instruction: p.instruction || undefined,
    category: inferNwsCategory(event, headline),
    urgency: mapNwsUrgency(p.severity),
    eventType: event,
    areaDesc: p.areaDesc || undefined,
    hasGeometry: Boolean(feature.geometry),
    geometry: feature.geometry,
    expiresAt: p.expires || undefined,
    createdAt: p.sent || p.effective || undefined,
    rawProperties: p,
  };
}

/**
 * Normalizes a TxDOT ArcGIS Feature into `UnifiedHazard`.
 */
export function normalizeTxDotRoad(feature: RawTxDotFeature, index = 0): UnifiedHazard {
  const p = feature.properties || {};
  const route = p.RTE_NM || "Texas Roadway";
  const status = p.RDWAY_STAT || "Hazard / Condition";
  const id = `txdot-${route}-${index}`;

  return {
    id,
    source: "txdot",
    externalId: id,
    headline: `${route} — ${status}`,
    description: `Road status: ${status}. Mile/DFO marker: ${p.BEGIN_DFO ?? "N/A"} to ${p.END_DFO ?? "N/A"}.`,
    category: "road_hazard",
    urgency: mapTxDotUrgency(status),
    eventType: `Road Condition: ${status}`,
    hasGeometry: Boolean(feature.geometry),
    geometry: feature.geometry,
    createdAt: new Date().toISOString(),
    rawProperties: p,
  };
}

/**
 * Converts an array of UnifiedHazards back into a MapLibre-ready GeoJSON FeatureCollection,
 * safely including ONLY items with valid geometry.
 */
export function hazardsToGeoJson(hazards: UnifiedHazard[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hazards
      .filter((h): h is UnifiedHazard & { geometry: Geometry } => h.hasGeometry && h.geometry !== null)
      .map((h) => ({
        type: "Feature" as const,
        id: h.id,
        geometry: h.geometry,
        properties: {
          id: h.id,
          source: h.source,
          externalId: h.externalId,
          headline: h.headline,
          category: h.category,
          urgency: h.urgency,
          eventType: h.eventType,
          areaDesc: h.areaDesc,
          expiresAt: h.expiresAt,
        },
      })),
  };
}

