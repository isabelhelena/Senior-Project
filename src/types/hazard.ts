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
 * High-level filter categories for the Shelters & Aid tab
 */
export type ResourceGroupKey =
  | "shelters"
  | "food_water"
  | "medical"
  | "responders"
  | "community_aid";

/**
 * Granular OpenStreetMap emergency_resources.resource_type values
 */
export type EmergencyResourceType =
  | "hospital"
  | "clinic"
  | "pharmacy"
  | "doctor"
  | "ambulance_station"
  | "fire_station"
  | "police_station"
  | "shelter"
  | "disaster_response"
  | "assembly_point"
  | "food_bank"
  | "soup_kitchen"
  | "community_centre"
  | "drinking_water"
  | "other";

/**
 * Verified OpenStreetMap emergency resource from `get_nearby_emergency_resources`
 */
export interface EmergencyResource {
  id: string;
  osmId: string;
  name: string;
  resourceType: EmergencyResourceType;
  group: Exclude<ResourceGroupKey, "community_aid">;
  address?: string | null;
  phone?: string | null;
  distMeters: number;
  distMiles: number;
  coordinates: [number, number]; // [longitude, latitude]
  verified: true;
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
  resourceGroup?: ResourceGroupKey;
  resourceSubtype?: string;
  verified?: boolean;
  address?: string | null;
  phone?: string | null;
  distanceMiles?: number | null;
  coordinates?: [number, number];
  authorHandle?: string;
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

