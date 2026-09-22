"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, CloudSun, Construction, Droplets, MapPin, MessageSquare, TentTree, Wind, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WeatherData } from "@/hooks/use-current-weather";
import type { SocialAlert, UnifiedHazard } from "@/types/hazard";
import type { InformationSection, LayerVisibility } from "./LayerControlDock";

interface MapInformationPanelProps {
  section: InformationSection | null;
  visibility: LayerVisibility;
  weather: { data: WeatherData | null; loading: boolean; error: string | null };
  locationLabel: string;
  hazards: UnifiedHazard[];
  communityReports: SocialAlert[];
  resourceReports: SocialAlert[];
  mapDataLoading: boolean;
  onClose: () => void;
  onToggleLayer: (key: keyof LayerVisibility) => void;
  onLocateHazard: (hazard: UnifiedHazard) => void;
  onLocateReport: (report: SocialAlert) => void;
}

const sectionDetails = {
  weather: { title: "Weather", icon: CloudSun, layer: "nws" },
  roads: { title: "Road conditions", icon: Construction, layer: "txdot" },
  resources: { title: "Shelters & Aid", icon: TentTree, layer: "resources" },
  community: { title: "Community reports", icon: MessageSquare, layer: "social" },
} as const;

export function MapInformationPanel({ section, visibility, weather, locationLabel, hazards, communityReports, resourceReports, mapDataLoading, onClose, onToggleLayer, onLocateHazard, onLocateReport }: MapInformationPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!section) return;
    headingRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, section]);

  if (!section) return null;
  const details = sectionDetails[section];
  const Icon = details.icon;
  const layerVisible = visibility[details.layer];

  return (
    <aside id="map-information-panel" aria-labelledby="map-information-heading" className="absolute inset-x-0 bottom-0 z-20 flex max-h-[68%] flex-col overflow-hidden rounded-t-3xl bg-background/94 text-foreground shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom dark:bg-background/92 dark:ring-white/10 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-16 sm:max-h-none sm:w-[23rem] sm:rounded-3xl sm:motion-safe:slide-in-from-right">
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" aria-hidden="true" />
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><Icon className="size-5" aria-hidden="true" /></span>
          <h2 id="map-information-heading" ref={headingRef} tabIndex={-1} className="truncate text-lg font-semibold outline-none">{details.title}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} className="size-11 rounded-full" aria-label={`Close ${details.title}`}><X aria-hidden="true" /></Button>
      </div>

      <div className="flex items-center justify-between border-y border-border/60 px-5 py-2.5 text-sm">
        <span className="text-muted-foreground">Show on map</span>
        <Button type="button" variant={layerVisible ? "secondary" : "ghost"} size="sm" onClick={() => onToggleLayer(details.layer)} aria-pressed={layerVisible} className="min-h-11 rounded-full px-4">{layerVisible ? "On" : "Off"}</Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {section === "weather" && <WeatherContent weather={weather} locationLabel={locationLabel} alerts={hazards.filter((hazard) => hazard.source === "nws")} alertsLoading={mapDataLoading} onLocate={onLocateHazard} />}
        {section === "roads" && <HazardList hazards={hazards.filter((hazard) => hazard.source === "txdot")} loading={mapDataLoading} emptyLabel="No major road hazards are currently reported." onLocate={onLocateHazard} />}
        {section === "resources" && <ReportList reports={resourceReports} emptyLabel="No community-reported shelter or aid locations are currently listed within 100 miles." resource onLocate={onLocateReport} />}
        {section === "community" && <ReportList reports={communityReports} emptyLabel="No community reports are currently available." onLocate={onLocateReport} />}
      </div>
    </aside>
  );
}

function WeatherContent({ weather, locationLabel, alerts, alertsLoading, onLocate }: { weather: MapInformationPanelProps["weather"]; locationLabel: string; alerts: UnifiedHazard[]; alertsLoading: boolean; onLocate: (hazard: UnifiedHazard) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{locationLabel}</p>
        {weather.loading ? <p role="status" className="mt-2 text-sm">Checking current weather…</p> : weather.error || !weather.data ? <p className="mt-2 text-sm text-muted-foreground">Current weather is temporarily unavailable.</p> : (
          <>
            <p className="mt-1 text-5xl font-semibold tracking-tight">{weather.data.tempF !== null ? `${Math.round(weather.data.tempF)}°` : "--"}</p>
            <p className="mt-1 text-lg">{weather.data.condition}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Wind className="size-4" aria-hidden="true" />{weather.data.windMph !== null ? `${weather.data.windMph} mph` : "Wind unavailable"}</span>
              <span className="inline-flex items-center gap-1.5"><Droplets className="size-4" aria-hidden="true" />{weather.data.humidity !== null ? `${weather.data.humidity}% humidity` : "Humidity unavailable"}</span>
            </div>
          </>
        )}
      </div>
      <div className="border-t border-border/60 pt-4">
        <h3 className="font-semibold">Weather alerts</h3>
        {alertsLoading ? <p role="status" className="mt-2 text-sm text-muted-foreground">Checking weather alerts…</p> : alerts.length === 0 ? <EmptyState label="No active weather alerts are currently listed." /> : (
          <ul className="mt-3 space-y-3">{alerts.map((alert) => (
            <li key={alert.id} className="rounded-2xl bg-muted/65 p-3">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-sm font-medium leading-snug">{alert.eventType || alert.headline}</p>{alert.expiresAt && <p className="mt-1 text-xs text-muted-foreground">Until {formatTime(alert.expiresAt)}</p>}</div></div>
              {alert.hasGeometry && <LocateButton onClick={() => onLocate(alert)} />}
            </li>
          ))}</ul>
        )}
      </div>
    </div>
  );
}

function HazardList({ hazards, loading, emptyLabel, onLocate }: { hazards: UnifiedHazard[]; loading: boolean; emptyLabel: string; onLocate: (hazard: UnifiedHazard) => void }) {
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Checking road conditions…</p>;
  if (hazards.length === 0) return <EmptyState label={emptyLabel} />;
  return <ul className="space-y-3">{hazards.map((hazard) => <li key={hazard.id} className="rounded-2xl bg-muted/65 p-3.5"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{formatCategory(hazard.category)}</Badge><span className="text-xs capitalize text-muted-foreground">{hazard.urgency}</span></div><p className="mt-2 text-sm font-medium leading-snug">{hazard.eventType || hazard.headline}</p>{hazard.areaDesc && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hazard.areaDesc}</p>}{hazard.hasGeometry && <LocateButton onClick={() => onLocate(hazard)} />}</li>)}</ul>;
}

function ReportList({ reports, emptyLabel, resource = false, onLocate }: { reports: SocialAlert[]; emptyLabel: string; resource?: boolean; onLocate: (report: SocialAlert) => void }) {
  if (reports.length === 0) return <EmptyState label={emptyLabel} />;
  return <div className="space-y-3">{resource && <p className="text-xs leading-relaxed text-muted-foreground">These locations come from community reports and may not be officially verified. Confirm details before traveling.</p>}<ul className="space-y-3">{reports.map((report) => <li key={report.id} className="rounded-2xl bg-muted/65 p-3.5"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{formatCategory(report.category)}</Badge><span className="text-xs capitalize text-muted-foreground">{report.urgency} urgency</span></div>{resource && <p className="mt-2 text-xs font-medium text-primary">Community-reported aid location</p>}<p className="mt-1 text-sm leading-relaxed">{report.summary}</p><p className="mt-2 text-xs text-muted-foreground">{report.authorHandle || "Community report"}</p><LocateButton onClick={() => onLocate(report)} /></li>)}</ul></div>;
}

function EmptyState({ label }: { label: string }) {
  return <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{label}</p>;
}

function LocateButton({ onClick }: { onClick: () => void }) {
  return <Button type="button" variant="ghost" onClick={onClick} className="mt-2 min-h-11 w-full justify-start gap-2 px-2 text-primary"><MapPin aria-hidden="true" />Show on map</Button>;
}

function formatCategory(category: string) {
  return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
