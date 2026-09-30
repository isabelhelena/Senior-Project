import type { Metadata } from "next"

import { IncidentReportForm } from "@/components/reporting/IncidentReportForm"

export const metadata: Metadata = {
  title: "Report an Incident | Lone Star Support",
  description: "Report natural-disaster hazards and relief resources in your area.",
}

export default function ReportPage() {
  return (
    <main className="flex flex-1 bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold text-primary">Lone Star Support</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Report an incident
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Provide concise, location-specific information to support disaster awareness
            and relief coordination.
          </p>
        </header>

        <IncidentReportForm />
      </div>
    </main>
  )
}
