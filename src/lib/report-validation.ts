export const INCIDENT_CATEGORIES = [
  { value: "flood", label: "Flood" },
  { value: "shelter", label: "Shelter" },
  { value: "water_relief_resource", label: "Water / Relief Resource" },
  { value: "medical", label: "Medical" },
  { value: "road_hazard", label: "Road Hazard" },
  { value: "other_disaster_hazard", label: "Other Disaster Hazard" },
] as const

export const INCIDENT_SEVERITIES = [
  { value: "low", label: "Low — information only" },
  { value: "moderate", label: "Moderate — help may be needed" },
  { value: "high", label: "High — urgent conditions" },
  { value: "critical", label: "Critical — immediate danger" },
] as const

export const DESCRIPTION_MIN_LENGTH = 20
export const DESCRIPTION_MAX_LENGTH = 1000

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number]["value"]
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number]["value"]
export type ReportLocationSource = "gps" | "zip" | "map" | "fallback"
export type ReportLocationStatus = "ready" | "fallback" | "unavailable"

export interface IncidentReportDraft {
  category: string
  severity: string
  description: string
  latitude: string
  longitude: string
}

export interface IncidentReportPayload {
  category: IncidentCategory
  severity: IncidentSeverity
  description: string
  latitude: number
  longitude: number
  locationSource: ReportLocationSource
  locationStatus: ReportLocationStatus
}

export type IncidentReportField = keyof IncidentReportDraft
export type IncidentReportErrors = Partial<Record<IncidentReportField, string>>

type ValidationResult =
  | { success: true; data: Omit<IncidentReportPayload, "locationSource" | "locationStatus"> }
  | { success: false; errors: IncidentReportErrors }

const categoryValues = new Set<string>(
  INCIDENT_CATEGORIES.map(({ value }) => value)
)
const severityValues = new Set<string>(
  INCIDENT_SEVERITIES.map(({ value }) => value)
)

export function validateIncidentReport(
  draft: IncidentReportDraft
): ValidationResult {
  const errors: IncidentReportErrors = {}
  const description = draft.description.trim()
  const latitude = parseCoordinate(draft.latitude)
  const longitude = parseCoordinate(draft.longitude)

  if (!categoryValues.has(draft.category)) {
    errors.category = "Select an incident category."
  }

  if (!severityValues.has(draft.severity)) {
    errors.severity = "Select a severity level."
  }

  if (!description) {
    errors.description = "Enter a description of the incident."
  } else if (description.length < DESCRIPTION_MIN_LENGTH) {
    errors.description = `Use at least ${DESCRIPTION_MIN_LENGTH} characters so responders have enough detail.`
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Use no more than ${DESCRIPTION_MAX_LENGTH} characters.`
  }

  if (latitude === null || latitude < -90 || latitude > 90) {
    errors.latitude = "Enter a latitude from -90 to 90."
  }

  if (longitude === null || longitude < -180 || longitude > 180) {
    errors.longitude = "Enter a longitude from -180 to 180."
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }

  return {
    success: true,
    data: {
      category: draft.category as IncidentCategory,
      severity: draft.severity as IncidentSeverity,
      description,
      latitude: latitude as number,
      longitude: longitude as number,
    },
  }
}

function parseCoordinate(value: string): number | null {
  if (!value.trim()) return null

  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate : null
}
