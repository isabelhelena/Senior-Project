import type { Geometry } from "geojson";

/**
 * Maps directly to PostgreSQL `disaster_category` enum in schema.sql
 */
export type DisasterCategory =
  | "flood"
  | "freeze"
  | "tornado"
  | "road_hazard"
  | "shelter"
  | "water_station"
  | "power_outage"
  | "other";

/**
 * Maps directly to PostgreSQL `urgency_level` enum in schema.sql
 */
export type UrgencyLevel = "low" | "medium" | "severe" | "critical" | "unknown";

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
}

/**
 * Social alert from Bluesky firehose matching `social_alerts` table in schema.sql
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
}

