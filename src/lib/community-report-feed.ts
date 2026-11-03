import type { Feature, Point } from "geojson";
import type { UnifiedHazard } from "@/types/hazard";
import { normalizeClassification } from "./alert-classification";

interface StoredReportProperties {
  id: string;
  report_id: string;
  description: string;
  category: string;
  urgency: string;
  created_at: string;
  expires_at: string;
  source_classification?: { category: string; urgency: string };
}

/** Convert a database report into the same shape the existing map already uses. */
export function normalizeCommunityReport(feature: Feature<Point, StoredReportProperties>): UnifiedHazard {
  const report = feature.properties;
  if (!report || !feature.geometry || feature.geometry.type !== "Point" ||
      feature.geometry.coordinates.length !== 2 || !feature.geometry.coordinates.every(Number.isFinite) ||
      typeof report.id !== "string" || !report.id.startsWith("community-") ||
      typeof report.description !== "string" || !Number.isFinite(Date.parse(report.expires_at))) {
    throw new Error("Invalid community report");
  }
  const categoryLabel = (report.source_classification?.category || report.category).replaceAll("_", " ");
  return {
    ...normalizeClassification(report.category, report.urgency),
    sourceClassification: report.source_classification,
    id: report.id,
    source: "community",
    externalId: report.report_id,
    headline: `Reviewed community report: ${categoryLabel}`,
    description: report.description,
    instruction: "Reviewed for publication. This community report has not been independently verified.",
    hasGeometry: true,
    geometry: feature.geometry,
    createdAt: report.created_at,
    expiresAt: report.expires_at,
    coordinates: feature.geometry.coordinates as [number, number],
    verified: false,
  };
}
