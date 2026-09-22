import { Car, CloudRain, MapPin, ShieldCheck, TentTree } from "lucide-react";

import type { SocialAlert, UnifiedHazard } from "@/types/hazard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ImportantInformationProps {
  hazards: UnifiedHazard[];
  resourceReports: SocialAlert[];
  loading: boolean;
}

export function ImportantInformation({
  hazards,
  resourceReports,
  loading,
}: ImportantInformationProps) {
  const weatherAlerts = hazards.filter((hazard) => hazard.source === "nws");
  const roadHazards = hazards.filter((hazard) => hazard.source === "txdot");
  const mostUrgentWeatherAlert = weatherAlerts.find(
    (hazard) => hazard.urgency === "critical" || hazard.urgency === "severe",
  ) ?? weatherAlerts[0];

  return (
    <section aria-labelledby="important-information-heading" className="space-y-4">
      <div>
        <h2 id="important-information-heading" className="text-xl font-semibold tracking-tight">
          Important information
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A quick summary of the information currently available.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card size="sm" className={mostUrgentWeatherAlert ? "ring-amber-500/40" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CloudRain className="size-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Weather Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Checking for weather alerts…</p>
            ) : mostUrgentWeatherAlert ? (
              <div className="space-y-2">
                <p className="font-medium leading-snug">
                  {mostUrgentWeatherAlert.eventType || mostUrgentWeatherAlert.headline}
                </p>
                <p className="text-muted-foreground">
                  {mostUrgentWeatherAlert.expiresAt
                    ? `In effect until ${formatTime(mostUrgentWeatherAlert.expiresAt)}.`
                    : `${weatherAlerts.length} active weather alert${weatherAlerts.length === 1 ? "" : "s"} currently listed.`}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p>No active weather alerts are currently listed.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="size-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
              Road Conditions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Checking road conditions…</p>
            ) : roadHazards.length > 0 ? (
              <p>
                {roadHazards.length} road hazard{roadHazards.length === 1 ? " is" : "s are"} currently reported.
                Check the map before traveling.
              </p>
            ) : (
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p>No major road hazards are currently reported.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TentTree className="size-5 text-primary" aria-hidden="true" />
              Shelters &amp; Aid
            </CardTitle>
          </CardHeader>
          <CardContent>
            {resourceReports.length > 0 ? (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  {resourceReports.length} community-reported aid location
                  {resourceReports.length === 1 ? "" : "s"} within 100 miles.
                </p>
                <ul className="space-y-2">
                  {resourceReports.slice(0, 3).map((report) => (
                    <li key={report.id} className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />
                      <span className="leading-snug">{report.summary}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Community reports may not be officially verified. Confirm details before traveling.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="text-muted-foreground">
                  No community-reported shelter or aid locations are currently listed within 100 miles.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
