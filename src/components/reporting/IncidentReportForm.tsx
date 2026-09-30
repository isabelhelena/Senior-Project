"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Loader2, LocateFixed, Send } from "lucide-react"

import { useLocation } from "@/context/LocationContext"
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  type IncidentReportDraft,
  type IncidentReportErrors,
  type IncidentReportField,
  type IncidentReportPayload,
  type ReportLocationStatus,
  validateIncidentReport,
} from "@/lib/report-validation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const initialDraft: IncidentReportDraft = {
  category: "",
  severity: "",
  description: "",
  latitude: "",
  longitude: "",
}

const fieldLabels: Record<IncidentReportField, string> = {
  category: "Incident category",
  severity: "Severity / urgency",
  description: "Description",
  latitude: "Latitude",
  longitude: "Longitude",
}

export function IncidentReportForm() {
  const { location } = useLocation()
  const [draft, setDraft] = useState<IncidentReportDraft>(initialDraft)
  const [errors, setErrors] = useState<IncidentReportErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const submissionLock = useRef(false)

  useEffect(() => {
    if (location.loading) return

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return

      setDraft((current) => ({
        ...current,
        latitude: current.latitude || String(location.lat),
        longitude: current.longitude || String(location.lng),
      }))
    })

    return () => {
      cancelled = true
    }
  }, [location.lat, location.lng, location.loading])

  const locationStatus: ReportLocationStatus = location.error
    ? location.source === "fallback"
      ? "fallback"
      : "unavailable"
    : location.source === "fallback"
      ? "fallback"
      : "ready"

  const updateField = (field: IncidentReportField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setStatusMessage("")
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submissionLock.current) return

    setStatusMessage("")
    const result = validateIncidentReport(draft)

    if (!result.success) {
      setErrors(result.errors)
      focusFirstInvalidField(result.errors)
      return
    }

    setErrors({})
    submissionLock.current = true
    setIsSubmitting(true)

    const payload: IncidentReportPayload = {
      ...result.data,
      locationSource: location.source,
      locationStatus,
    }

    try {
      await submitIncidentReport(payload)
      setStatusMessage(
        "Report validated. Backend submission will be enabled when the FastAPI endpoint is available."
      )
    } finally {
      submissionLock.current = false
      setIsSubmitting(false)
    }
  }

  const errorEntries = Object.entries(errors) as Array<
    [IncidentReportField, string]
  >

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Incident details</CardTitle>
            <CardDescription>
              Share current natural-disaster or relief information. All fields are
              required.
            </CardDescription>
          </div>
          <Badge variant="outline" className="min-h-6 gap-1.5 px-2.5">
            <LocateFixed aria-hidden="true" />
            {location.loading ? "Locating" : location.source.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>

      <form noValidate onSubmit={handleSubmit}>
        <CardContent className="gap-5">
          {errorEntries.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <div className="flex items-start gap-2 font-medium">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>Please correct the following fields:</span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                {errorEntries.map(([field, message]) => (
                  <li key={field}>
                    <a className="underline underline-offset-2" href={`#${field}`}>
                      {fieldLabels[field]}: {message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Incident category" error={errors.category} htmlFor="category">
              <select
                id="category"
                name="category"
                required
                value={draft.category}
                onChange={(event) => updateField("category", event.target.value)}
                aria-invalid={Boolean(errors.category)}
                aria-describedby={errors.category ? "category-error" : undefined}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 sm:text-sm"
              >
                <option value="">Select a category</option>
                {INCIDENT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Severity / urgency" error={errors.severity} htmlFor="severity">
              <select
                id="severity"
                name="severity"
                required
                value={draft.severity}
                onChange={(event) => updateField("severity", event.target.value)}
                aria-invalid={Boolean(errors.severity)}
                aria-describedby={errors.severity ? "severity-error" : undefined}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 sm:text-sm"
              >
                <option value="">Select severity</option>
                {INCIDENT_SEVERITIES.map((severity) => (
                  <option key={severity.value} value={severity.value}>
                    {severity.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description" error={errors.description} htmlFor="description">
            <Textarea
              id="description"
              name="description"
              required
              minLength={DESCRIPTION_MIN_LENGTH}
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={6}
              value={draft.description}
              onChange={(event) => updateField("description", event.target.value)}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description
                  ? "description-help description-error"
                  : "description-help"
              }
              placeholder="Describe what is happening, what is affected, and any immediate danger."
              className="min-h-36"
            />
            <div
              id="description-help"
              className="flex justify-between gap-4 text-xs text-muted-foreground"
            >
              <span>Include observable facts and current conditions.</span>
              <span aria-label={`${draft.description.length} of ${DESCRIPTION_MAX_LENGTH} characters`}>
                {draft.description.length}/{DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </Field>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Incident coordinates</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" error={errors.latitude} htmlFor="latitude">
                <Input
                  id="latitude"
                  name="latitude"
                  type="number"
                  inputMode="decimal"
                  required
                  min={-90}
                  max={90}
                  step="any"
                  value={draft.latitude}
                  onChange={(event) => updateField("latitude", event.target.value)}
                  aria-invalid={Boolean(errors.latitude)}
                  aria-describedby={errors.latitude ? "latitude-error" : undefined}
                  className="h-11"
                />
              </Field>

              <Field label="Longitude" error={errors.longitude} htmlFor="longitude">
                <Input
                  id="longitude"
                  name="longitude"
                  type="number"
                  inputMode="decimal"
                  required
                  min={-180}
                  max={180}
                  step="any"
                  value={draft.longitude}
                  onChange={(event) => updateField("longitude", event.target.value)}
                  aria-invalid={Boolean(errors.longitude)}
                  aria-describedby={errors.longitude ? "longitude-error" : undefined}
                  className="h-11"
                />
              </Field>
            </div>
          </fieldset>

          <div className="rounded-lg border bg-muted/50 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Location source / status</span>
              <Badge variant={location.error ? "destructive" : "secondary"}>
                {location.loading
                  ? "Locating"
                  : `${location.source.toUpperCase()} · ${locationStatus}`}
              </Badge>
            </div>
            <p className="mt-2 text-muted-foreground">
              {location.loading
                ? "Waiting for location data. Coordinates can also be entered manually."
                : location.error || `Coordinates prefilled for ${location.city}.`}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            This form is not an emergency service. If there is immediate danger, contact
            local emergency services.
          </p>

          <div aria-live="polite" aria-atomic="true" className="min-h-5 text-sm font-medium text-primary">
            {statusMessage}
          </div>
        </CardContent>

        <CardFooter className="mt-5 border-t">
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            aria-disabled={isSubmitting}
            className="min-h-11 w-full sm:w-auto sm:min-w-44"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Validating report…
              </>
            ) : (
              <>
                <Send aria-hidden="true" />
                Validate report
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string
  error?: string
  htmlFor: IncidentReportField
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label} <span aria-hidden="true" className="text-destructive">*</span>
        <span className="sr-only"> (required)</span>
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function focusFirstInvalidField(errors: IncidentReportErrors) {
  const firstInvalidField = Object.keys(errors)[0]
  if (!firstInvalidField) return

  requestAnimationFrame(() => {
    document.getElementById(firstInvalidField)?.focus()
  })
}

async function submitIncidentReport(_payload: IncidentReportPayload): Promise<void> {
  // Integration seam: replace this resolved promise with a fetch to the FastAPI
  // report endpoint after its URL and request/response contract are finalized.
  void _payload
  await Promise.resolve()
}
