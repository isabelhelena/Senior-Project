import type {
  DisasterCategory,
  EmergencyResource,
  EmergencyResourceType,
  ResourceGroupKey,
  SocialAlert,
  UnifiedHazard,
} from "@/types/hazard";

const AID_RESOURCE_CATEGORIES = new Set<DisasterCategory>([
  "shelter",
  "water_station",
]);

export interface ResourceGroupConfig {
  key: ResourceGroupKey;
  label: string;
  shortLabel: string;
  description: string;
  colorHex: string;
  badgeClass: string;
  osmTypes: EmergencyResourceType[];
  defaultEnabled: boolean;
}

export const RESOURCE_GROUPS: readonly ResourceGroupConfig[] = [
  {
    key: "shelters",
    label: "Shelters & Aid",
    shortLabel: "Shelters",
    description: "Evacuation shelters, relief centers, and community assembly points",
    colorHex: "#16a34a",
    badgeClass:
      "bg-emerald-500/15 text-emerald-800 border-emerald-500/30 dark:text-emerald-300",
    osmTypes: [
      "shelter",
      "disaster_response",
      "assembly_point",
      "community_centre",
    ],
    defaultEnabled: true,
  },
  {
    key: "food_water",
    label: "Food & Water",
    shortLabel: "Food & Water",
    description: "Drinking water stations, food banks, and community kitchens",
    colorHex: "#0284c7",
    badgeClass:
      "bg-sky-500/15 text-sky-800 border-sky-500/30 dark:text-sky-300",
    osmTypes: ["drinking_water", "food_bank", "soup_kitchen"],
    defaultEnabled: true,
  },
  {
    key: "medical",
    label: "Medical",
    shortLabel: "Medical",
    description: "Hospitals, urgent clinics, pharmacies, and doctors",
    colorHex: "#e11d48",
    badgeClass:
      "bg-rose-500/15 text-rose-800 border-rose-500/30 dark:text-rose-300",
    osmTypes: ["hospital", "clinic", "pharmacy", "doctor"],
    defaultEnabled: false,
  },
  {
    key: "responders",
    label: "Responders",
    shortLabel: "Responders",
    description: "Fire stations, EMS/ambulance stations, and police stations",
    colorHex: "#4f46e5",
    badgeClass:
      "bg-indigo-500/15 text-indigo-800 border-indigo-500/30 dark:text-indigo-300",
    osmTypes: ["fire_station", "ambulance_station", "police_station"],
    defaultEnabled: false,
  },
  {
    key: "community_aid",
    label: "Community Aid",
    shortLabel: "Community Aid",
    description: "Citizen-reported shelters, water, and mutual aid locations",
    colorHex: "#d97706",
    badgeClass:
      "bg-amber-500/15 text-amber-900 border-amber-500/35 dark:text-amber-300",
    osmTypes: [],
    defaultEnabled: true,
  },
] as const;

export const DEFAULT_ACTIVE_RESOURCE_GROUPS: ResourceGroupKey[] =
  RESOURCE_GROUPS.filter((g) => g.defaultEnabled).map((g) => g.key);

const OSM_TYPE_TO_GROUP: Record<
  EmergencyResourceType,
  Exclude<ResourceGroupKey, "community_aid">
> = {
  shelter: "shelters",
  disaster_response: "shelters",
  assembly_point: "shelters",
  community_centre: "shelters",
  drinking_water: "food_water",
  food_bank: "food_water",
  soup_kitchen: "food_water",
  hospital: "medical",
  clinic: "medical",
  pharmacy: "medical",
  doctor: "medical",
  fire_station: "responders",
  ambulance_station: "responders",
  police_station: "responders",
  other: "shelters",
};

const SUBTYPE_LABELS: Record<string, string> = {
  shelter: "Emergency Shelter",
  disaster_response: "Disaster Response Center",
  assembly_point: "Evacuation Assembly Point",
  community_centre: "Community Center",
  drinking_water: "Drinking Water Source",
  food_bank: "Food Bank",
  soup_kitchen: "Community Kitchen",
  hospital: "Hospital / ER",
  clinic: "Medical Clinic",
  pharmacy: "Pharmacy",
  doctor: "Doctor's Office",
  fire_station: "Fire Station",
  ambulance_station: "EMS / Ambulance Station",
  police_station: "Police Station",
  water_station: "Water & Relief Station",
  other: "Support Resource",
};

export function isAidResourceCategory(category: DisasterCategory) {
  return AID_RESOURCE_CATEGORIES.has(category);
}

export function isAidResourceReport(report: Pick<SocialAlert, "category">) {
  return isAidResourceCategory(report.category);
}

export function getResourceGroupForOsmType(
  resourceType: string,
): Exclude<ResourceGroupKey, "community_aid"> {
  return (
    OSM_TYPE_TO_GROUP[resourceType as EmergencyResourceType] ?? "shelters"
  );
}

export function getResourceGroupConfig(group: ResourceGroupKey): ResourceGroupConfig {
  return (
    RESOURCE_GROUPS.find((item) => item.key === group) ?? RESOURCE_GROUPS[0]
  );
}

export function getActiveOsmTypesForGroups(
  activeGroups: Iterable<ResourceGroupKey>,
): EmergencyResourceType[] {
  const activeSet = new Set(activeGroups);
  const types: EmergencyResourceType[] = [];
  for (const group of RESOURCE_GROUPS) {
    if (activeSet.has(group.key)) {
      types.push(...group.osmTypes);
    }
  }
  return types;
}

export function formatResourceSubtype(resourceType: string): string {
  if (SUBTYPE_LABELS[resourceType]) {
    return SUBTYPE_LABELS[resourceType];
  }
  return resourceType
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function mapOsmTypeToDisasterCategory(
  resourceType: string,
): DisasterCategory {
  const group = getResourceGroupForOsmType(resourceType);
  if (group === "shelters") return "shelter";
  if (group === "food_water") return "water_station";
  return "other";
}

export function distanceMiles(
  from: [number, number],
  to: [number, number],
) {
  const earthRadiusMiles = 3958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

export function metersToMiles(meters: number): number {
  return Number((meters / 1609.344).toFixed(1));
}

/**
 * Deduplicates nearby OSM nodes/ways that share the same normalized name & resourceType
 * (e.g. multiple campus buildings for "Haven For Hope"), preserving address/phone metadata.
 */
export function deduplicateEmergencyResources(
  resources: EmergencyResource[],
): EmergencyResource[] {
  const deduped: EmergencyResource[] = [];

  for (const candidate of resources) {
    const isUnnamed = candidate.name.toLowerCase().startsWith("unnamed ");
    if (isUnnamed) {
      deduped.push(candidate);
      continue;
    }

    const normName = candidate.name.trim().toLowerCase();
    const existing = deduped.find(
      (item) =>
        item.resourceType === candidate.resourceType &&
        item.name.trim().toLowerCase() === normName &&
        distanceMiles(item.coordinates, candidate.coordinates) <= 1.2,
    );

    if (existing) {
      if (!existing.address && candidate.address) {
        existing.address = candidate.address;
      }
      if (!existing.phone && candidate.phone) {
        existing.phone = candidate.phone;
      }
    } else {
      deduped.push({ ...candidate });
    }
  }

  return deduped;
}

export function emergencyResourceToHazard(
  resource: EmergencyResource,
): UnifiedHazard {
  const subtypeLabel = formatResourceSubtype(resource.resourceType);
  const groupConfig = getResourceGroupConfig(resource.group);

  const descriptionParts = [
    `Verified ${subtypeLabel.toLowerCase()} from OpenStreetMap (${groupConfig.label}).`,
  ];
  if (resource.address) {
    descriptionParts.push(`Address: ${resource.address}`);
  }
  if (resource.phone) {
    descriptionParts.push(`Phone: ${resource.phone}`);
  }

  return {
    id: `osm-${resource.id}`,
    source: "osm",
    externalId: resource.osmId,
    headline: resource.name,
    eventType: resource.name,
    description: descriptionParts.join("\n"),
    areaDesc: resource.address || `${subtypeLabel} • ${resource.distMiles} mi away`,
    category: mapOsmTypeToDisasterCategory(resource.resourceType),
    urgency: "low",
    hasGeometry: true,
    geometry: {
      type: "Point",
      coordinates: resource.coordinates,
    },
    resourceGroup: resource.group,
    resourceSubtype: subtypeLabel,
    verified: true,
    address: resource.address ?? null,
    phone: resource.phone ?? null,
    distanceMiles: resource.distMiles,
    coordinates: resource.coordinates,
  };
}

export function socialAidReportToHazard(
  report: SocialAlert,
  referenceCoords?: [number, number],
): UnifiedHazard {
  const dist = referenceCoords
    ? Number(distanceMiles(referenceCoords, report.coordinates).toFixed(1))
    : null;

  return {
    id: report.id,
    source: "bluesky",
    externalId: report.blueskyUri,
    headline: report.summary,
    eventType: "Community-Reported Aid Location",
    description: report.summary,
    instruction:
      "This aid location comes from a community report and has not been officially verified. Confirm operating hours and availability before traveling.",
    category: report.category,
    urgency: report.urgency,
    hasGeometry: true,
    geometry: { type: "Point", coordinates: report.coordinates },
    createdAt: report.createdAt,
    resourceGroup: "community_aid",
    resourceSubtype:
      report.category === "shelter"
        ? "Community-Reported Shelter"
        : "Community-Reported Water / Aid",
    verified: false,
    distanceMiles: dist,
    coordinates: report.coordinates,
    authorHandle: report.authorHandle,
  };
}
