import type { Geometry } from "geojson";

/**
 * Maps directly to PostgreSQL `disaster_category` enum in schema.sql
 */
export const DISASTER_CATEGORIES = [
  "flood", "freeze", "tornado", "road_hazard", "shelter",
  "water_station", "power_outage", "other",
] as const;
export type DisasterCategory = (typeof DISASTER_CATEGORIES)[number];

/**
 * Stored levels match PostgreSQL; `unknown` is a display-only fallback.
 */
export const STORED_URGENCY_LEVELS = ["low", "medium", "severe", "critical"] as const;
export type StoredUrgencyLevel = (typeof STORED_URGENCY_LEVELS)[number];
export type UrgencyLevel = StoredUrgencyLevel | "unknown";

/** Preserve source detail when its vocabulary is broader than our categories. */
export interface SourceClassification {
  category: string | null;
  urgency: string | null;
}

/**
 * Standardized data contract across all Texas crisis data providers
 * (NWS, TxDOT, OpenStreetMap, and Bluesky social signals).
 */
export interface UnifiedHazard {
  id: string;
  source: "nws" | "txdot" | "osm" | "bluesky";
  externalId: string;
  headline: string;
  description?: string;
  instruction?: string;
  category: DisasterCategory;
  urgency: UrgencyLevel;
  eventType?: string;
  areaDesc?: string;
  hasGeometry: boolean;
  geometry: Geometry | null;
  expiresAt?: string;
  createdAt?: string;
  rawProperties?: Record<string, unknown>;
  sourceClassification?: SourceClassification;
}

/**
 * Normalized social alert for display, not a raw `social_alerts` database row.
 */
export interface SocialAlert {
  id: string;
  blueskyUri: string;
  summary: string;
  category: DisasterCategory;
  urgency: UrgencyLevel;
  coordinates: [number, number]; // [longitude, latitude]
  createdAt: string;
  authorHandle?: string;
  sourceClassification?: SourceClassification;
}

