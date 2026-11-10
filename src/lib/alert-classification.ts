import {
  DISASTER_CATEGORIES,
  STORED_URGENCY_LEVELS,
  type DisasterCategory,
  type UrgencyLevel,
} from "@/types/hazard";

const categories = new Map<string, DisasterCategory>([
  ...DISASTER_CATEGORIES.map((value) => [value, value] as const),
  // No matching database category: retain the original label separately.
  ["severe_weather", "other"],
  ["wildfire", "other"],
  ["mutual_aid", "other"],
  ["medical", "other"],
  ["other_disaster_hazard", "other"],
  // This form option includes general relief, not necessarily a water station.
  ["water_relief_resource", "other"],
]);

const urgencies = new Map<string, UrgencyLevel>([
  ...STORED_URGENCY_LEVELS.map((value) => [value, value] as const),
  ["moderate", "medium"],
  ["high", "severe"],
  ["minor", "low"],
  ["extreme", "critical"],
]);

function key(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeCategory(value: unknown): DisasterCategory {
  return categories.get(key(value)) ?? "other";
}

export function normalizeUrgency(value: unknown): UrgencyLevel {
  return urgencies.get(key(value)) ?? "unknown";
}

export function normalizeClassification(category: unknown, urgency: unknown) {
  return {
    category: normalizeCategory(category),
    urgency: normalizeUrgency(urgency),
    sourceClassification: {
      category: typeof category === "string" ? category : null,
      urgency: typeof urgency === "string" ? urgency : null,
    },
  };
}
