import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import texas from "./data/texas-boundary.json";
import { validateIncidentReport } from "./report-validation";

const SUBMISSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTexasLocation(longitude: number, latitude: number) {
  return Number.isFinite(longitude) && Number.isFinite(latitude) &&
    booleanPointInPolygon([longitude, latitude], texas as Feature<Polygon | MultiPolygon>);
}

/** Flags support human review; no submitted report is automatically published. */
export function contentFlags(text: string): string[] {
  const flags: string[] = [];
  if (/https?:\/\/|www\./i.test(text)) flags.push("external_link");
  if (/<\/?[a-z][^>]*>/i.test(text)) flags.push("markup");
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/i.test(text)) flags.push("personal_contact");
  if (/(.)\1{14,}/u.test(text)) flags.push("repeated_content");
  return flags;
}

export function validateSubmission(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;

  // Check field types before passing them to the existing form validator.
  if (typeof body.category !== "string" || typeof body.severity !== "string" || typeof body.description !== "string") {
    return null;
  }
  if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
    return null;
  }
  if (typeof body.submissionId !== "string" || !SUBMISSION_ID_PATTERN.test(body.submissionId)) {
    return null;
  }
  if (typeof body.locationSource !== "string" || !["gps", "zip", "map", "fallback"].includes(body.locationSource)) {
    return null;
  }
  if (typeof body.locationStatus !== "string" || !["ready", "fallback", "unavailable"].includes(body.locationStatus)) {
    return null;
  }

  const result = validateIncidentReport({
    category: body.category,
    severity: body.severity,
    description: body.description,
    latitude: String(body.latitude),
    longitude: String(body.longitude),
  });
  if (!result.success || !isTexasLocation(body.longitude, body.latitude)) return null;
  return {
    ...result.data,
    submissionId: body.submissionId,
    locationSource: body.locationSource,
    locationStatus: body.locationStatus,
    flags: contentFlags(result.data.description),
  };
}

export function parseReportBounds(value: string | null): number[] | null {
  if (value === null) return [-106.7, 25.8, -93.5, 36.6];
  const parts = value.split(",");
  if (parts.length !== 4 || parts.some((part) => !part.trim())) return null;
  const [west, south, east, north] = parts.map(Number);
  if (![west, south, east, north].every(Number.isFinite) ||
      west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north ||
      east - west > 15 || north - south > 15) return null;
  return [west, south, east, north];
}
