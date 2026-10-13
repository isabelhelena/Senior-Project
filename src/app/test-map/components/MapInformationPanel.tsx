"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CloudSun,
  Construction,
  Copy,
  Droplets,
  HeartPulse,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  ShieldAlert,
  TentTree,
  Wind,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WeatherData } from "@/hooks/use-current-weather";
import {
  formatResourceSubtype,
  getResourceGroupConfig,
  RESOURCE_GROUPS,
} from "@/lib/community-resources";
import { cn } from "@/lib/utils";
import type {
  EmergencyResource,
  ResourceGroupKey,
  SocialAlert,
  UnifiedHazard,
} from "@/types/hazard";
import type { InformationSection, LayerVisibility } from "./LayerControlDock";

interface MapInformationPanelProps {
  section: InformationSection | null;
  visibility: LayerVisibility;
  weather: { data: WeatherData | null; loading: boolean; error: string | null };
  locationLabel: string;
  hazards: UnifiedHazard[];
  communityReports: SocialAlert[];
  resourceReports: SocialAlert[];
  verifiedResources: EmergencyResource[];
  resourcesLoading: boolean;
  resourcesError: string | null;
  zoomedOutForResources: boolean;
  activeResourceGroups: ResourceGroupKey[];
  resourceSearchQuery: string;
  includeUnnamedResources: boolean;
  hasPendingAreaSearch: boolean;
  mapDataLoading: boolean;
  onClose: () => void;
  onToggleLayer: (key: keyof LayerVisibility) => void;
  onToggleResourceGroup: (group: ResourceGroupKey) => void;
  onResourceSearchChange: (query: string) => void;
  onToggleIncludeUnnamed: () => void;
  onSearchCurrentArea: () => void;
  onLocateHazard: (hazard: UnifiedHazard) => void;
  onLocateReport: (report: SocialAlert) => void;
  onLocateVerifiedResource: (resource: EmergencyResource) => void;
}

const sectionDetails = {
  weather: { title: "Weather", icon: CloudSun, layer: "nws" },
  roads: { title: "Road conditions", icon: Construction, layer: "txdot" },
  resources: { title: "Shelters & Aid", icon: TentTree, layer: "resources" },
  community: { title: "Community reports", icon: MessageSquare, layer: "social" },
} as const;

const GROUP_ICONS: Record<ResourceGroupKey, typeof TentTree> = {
  shelters: TentTree,
  food_water: Droplets,
  medical: HeartPulse,
  responders: ShieldAlert,
  community_aid: MessageSquare,
};

export function MapInformationPanel({
  section,
  visibility,
  weather,
  locationLabel,
  hazards,
  communityReports,
  resourceReports,
  verifiedResources,
  resourcesLoading,
  resourcesError,
  zoomedOutForResources,
  activeResourceGroups,
  resourceSearchQuery,
  includeUnnamedResources,
  hasPendingAreaSearch,
  mapDataLoading,
  onClose,
  onToggleLayer,
  onToggleResourceGroup,
  onResourceSearchChange,
  onToggleIncludeUnnamed,
  onSearchCurrentArea,
  onLocateHazard,
  onLocateReport,
  onLocateVerifiedResource,
}: MapInformationPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!section) return;
    headingRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, section]);

  if (!section) return null;
  const details = sectionDetails[section];
  const Icon = details.icon;
  const layerVisible = visibility[details.layer];

  return (
    <aside
      id="map-information-panel"
      aria-labelledby="map-information-heading"
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[72%] flex-col overflow-hidden rounded-t-3xl bg-background/95 text-foreground shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom dark:bg-background/93 dark:ring-white/10 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-16 sm:max-h-none sm:w-[25rem] sm:rounded-3xl sm:motion-safe:slide-in-from-right"
    >
      <div
        className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden"
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <h2
            id="map-information-heading"
            ref={headingRef}
            tabIndex={-1}
            className="truncate text-lg font-semibold outline-none"
          >
            {details.title}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-11 rounded-full"
          aria-label={`Close ${details.title}`}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      <div className="flex items-center justify-between border-y border-border/60 px-5 py-2.5 text-sm">
        <span className="text-muted-foreground">Show layer on map</span>
        <Button
          type="button"
          variant={layerVisible ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onToggleLayer(details.layer)}
          aria-pressed={layerVisible}
          className="min-h-10 rounded-full px-4"
        >
          {layerVisible ? "On" : "Off"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {section === "weather" && (
          <WeatherContent
            weather={weather}
            locationLabel={locationLabel}
            alerts={hazards.filter((hazard) => hazard.source === "nws")}
            alertsLoading={mapDataLoading}
            onLocate={onLocateHazard}
          />
        )}
        {section === "roads" && (
          <HazardList
            hazards={hazards.filter((hazard) => hazard.source === "txdot")}
            loading={mapDataLoading}
            emptyLabel="No major road hazards are currently reported."
            onLocate={onLocateHazard}
          />
        )}
        {section === "resources" && (
          <ResourcesSectionContent
            verifiedResources={verifiedResources}
            communityAidReports={resourceReports}
            loading={resourcesLoading}
            error={resourcesError}
            zoomedOut={zoomedOutForResources}
            activeGroups={activeResourceGroups}
            searchQuery={resourceSearchQuery}
            includeUnnamed={includeUnnamedResources}
            hasPendingAreaSearch={hasPendingAreaSearch}
            onToggleGroup={onToggleResourceGroup}
            onSearchChange={onResourceSearchChange}
            onToggleIncludeUnnamed={onToggleIncludeUnnamed}
            onSearchCurrentArea={onSearchCurrentArea}
            onLocateVerified={onLocateVerifiedResource}
            onLocateCommunity={onLocateReport}
          />
        )}
        {section === "community" && (
          <ReportList
            reports={communityReports}
            emptyLabel="No community reports are currently available."
            onLocate={onLocateReport}
          />
        )}
      </div>
    </aside>
  );
}

function ResourcesSectionContent({
  verifiedResources,
  communityAidReports,
  loading,
  error,
  zoomedOut,
  activeGroups,
  searchQuery,
  includeUnnamed,
  hasPendingAreaSearch,
  onToggleGroup,
  onSearchChange,
  onToggleIncludeUnnamed,
  onSearchCurrentArea,
  onLocateVerified,
  onLocateCommunity,
}: {
  verifiedResources: EmergencyResource[];
  communityAidReports: SocialAlert[];
  loading: boolean;
  error: string | null;
  zoomedOut: boolean;
  activeGroups: ResourceGroupKey[];
  searchQuery: string;
  includeUnnamed: boolean;
  hasPendingAreaSearch: boolean;
  onToggleGroup: (group: ResourceGroupKey) => void;
  onSearchChange: (query: string) => void;
  onToggleIncludeUnnamed: () => void;
  onSearchCurrentArea: () => void;
  onLocateVerified: (resource: EmergencyResource) => void;
  onLocateCommunity: (report: SocialAlert) => void;
}) {
  const activeSet = new Set(activeGroups);
  const showCommunity = activeSet.has("community_aid");

  const filteredCommunity = showCommunity
    ? communityAidReports.filter((report) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          report.summary.toLowerCase().includes(q) ||
          report.category.toLowerCase().includes(q) ||
          (report.authorHandle?.toLowerCase().includes(q) ?? false)
        );
      })
    : [];

  const totalCount = verifiedResources.length + filteredCommunity.length;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search shelters, water, hospitals, or street…"
            aria-label="Search shelters and aid resources"
            className="h-10 rounded-full bg-muted/65 pl-9 pr-9 text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {hasPendingAreaSearch && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSearchCurrentArea}
            className="h-9 w-full gap-1.5 rounded-full text-xs font-medium shadow-xs"
          >
            <Search className="size-3.5" aria-hidden="true" />
            Search this map area
          </Button>
        )}
      </div>

      {/* High-Level Category Filter Chips */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">
            Filter categories
          </span>
          <span className="text-[11px] text-muted-foreground">
            {totalCount} shown
          </span>
        </div>

        <div
          role="group"
          aria-label="Resource category filters"
          className="flex flex-wrap gap-1.5"
        >
          {RESOURCE_GROUPS.map((group) => {
            const active = activeSet.has(group.key);
            const GroupIcon = GROUP_ICONS[group.key];
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => onToggleGroup(group.key)}
                aria-pressed={active}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  active
                    ? "border-foreground/20 bg-foreground text-background shadow-xs"
                    : "border-border bg-muted/45 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: group.colorHex }}
                  aria-hidden="true"
                />
                <GroupIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{group.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Unnamed Park/Water Node Toggle Button */}
        <button
          type="button"
          aria-pressed={includeUnnamed}
          onClick={onToggleIncludeUnnamed}
          className={cn(
            "mt-1.5 flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium transition-all cursor-pointer",
            includeUnnamed
              ? "border-foreground/25 bg-foreground text-background shadow-xs"
              : "border-border bg-muted/55 text-foreground hover:bg-muted",
          )}
        >
          <span className="flex items-center gap-2">
            <Droplets
              className={cn(
                "size-4 shrink-0",
                includeUnnamed
                  ? "text-sky-400 dark:text-sky-600"
                  : "text-sky-500",
              )}
              aria-hidden="true"
            />
            <span>Include unnamed water taps &amp; park shelters</span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
              includeUnnamed
                ? "bg-background/20 text-background"
                : "border border-border bg-background text-muted-foreground",
            )}
          >
            {includeUnnamed ? "On" : "Off"}
          </span>
        </button>
      </div>

      {/* Status / Error / Zoom Prompt */}
      {zoomedOut && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-200">
          Zoom in on the map to load verified OpenStreetMap shelters, water
          stations, and medical resources for a specific city or neighborhood.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Community-Reported Aid Section */}
      {showCommunity && filteredCommunity.length > 0 && (
        <div className="space-y-2.5 border-t border-border/60 pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Community-Reported Aid ({filteredCommunity.length})
            </h3>
            <Badge
              variant="outline"
              className="border-amber-500/35 bg-amber-500/10 text-[10px] text-amber-900 dark:text-amber-200"
            >
              Unverified
            </Badge>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Shared by community members. Confirm availability before traveling.
          </p>
          <ul className="space-y-2.5">
            {filteredCommunity.map((report) => (
              <li
                key={report.id}
                className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className="border-amber-500/35 bg-amber-500/15 text-[10px] text-amber-900 dark:text-amber-300"
                  >
                    Community-reported {formatCategory(report.category)}
                  </Badge>
                  <span className="text-[11px] capitalize text-muted-foreground">
                    {report.urgency} urgency
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{report.summary}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {report.authorHandle || "Community report"}
                </p>
                <LocateButton onClick={() => onLocateCommunity(report)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Verified OpenStreetMap Resources Section */}
      <div className="space-y-2.5 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Verified Map Resources ({verifiedResources.length})
          </h3>
          {loading && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Updating…
            </span>
          )}
        </div>

        {!loading && verifiedResources.length === 0 ? (
          <EmptyState
            label={
              activeGroups.filter((g) => g !== "community_aid").length === 0
                ? "Select at least one verified resource category chip above to view locations."
                : searchQuery.trim()
                  ? `No verified resources matching "${searchQuery}" in this map area.`
                  : "No verified resources found in this map area for the selected categories."
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {verifiedResources.map((resource) => {
              const groupConfig = getResourceGroupConfig(resource.group);
              const subtypeLabel = formatResourceSubtype(resource.resourceType);

              return (
                <li
                  key={resource.id}
                  className="rounded-2xl border border-border/60 bg-muted/55 p-3.5 transition-colors hover:bg-muted/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-medium",
                          groupConfig.badgeClass,
                        )}
                      >
                        { subtypeLabel }
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" aria-hidden="true" />
                        Verified
                      </span>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {resource.distMiles} mi
                    </span>
                  </div>

                  <p className="mt-2 text-sm font-semibold leading-snug">
                    {resource.name}
                  </p>

                  {resource.address && (
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs leading-relaxed text-muted-foreground">
                      <span className="min-w-0 flex-1 break-words">
                        {resource.address}
                      </span>
                      <CopyAddressButton address={resource.address} />
                    </div>
                  )}

                  {resource.phone && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="size-3 shrink-0" aria-hidden="true" />
                      <a
                        href={`tel:${resource.phone}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {resource.phone}
                      </a>
                    </p>
                  )}

                  <LocateButton onClick={() => onLocateVerified(resource)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function WeatherContent({
  weather,
  locationLabel,
  alerts,
  alertsLoading,
  onLocate,
}: {
  weather: MapInformationPanelProps["weather"];
  locationLabel: string;
  alerts: UnifiedHazard[];
  alertsLoading: boolean;
  onLocate: (hazard: UnifiedHazard) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{locationLabel}</p>
        {weather.loading ? (
          <p role="status" className="mt-2 text-sm">
            Checking current weather…
          </p>
        ) : weather.error || !weather.data ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Current weather is temporarily unavailable.
          </p>
        ) : (
          <>
            <p className="mt-1 text-5xl font-semibold tracking-tight">
              {weather.data.tempF !== null
                ? `${Math.round(weather.data.tempF)}°`
                : "--"}
            </p>
            <p className="mt-1 text-lg">{weather.data.condition}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Wind className="size-4" aria-hidden="true" />
                {weather.data.windMph !== null
                  ? `${weather.data.windMph} mph`
                  : "Wind unavailable"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Droplets className="size-4" aria-hidden="true" />
                {weather.data.humidity !== null
                  ? `${weather.data.humidity}% humidity`
                  : "Humidity unavailable"}
              </span>
            </div>
          </>
        )}
      </div>
      <div className="border-t border-border/60 pt-4">
        <h3 className="font-semibold">Weather alerts</h3>
        {alertsLoading ? (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            Checking weather alerts…
          </p>
        ) : alerts.length === 0 ? (
          <EmptyState label="No active weather alerts are currently listed." />
        ) : (
          <ul className="mt-3 space-y-3">
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-2xl bg-muted/65 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">
                      {alert.eventType || alert.headline}
                    </p>
                    {alert.expiresAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Until {formatTime(alert.expiresAt)}
                      </p>
                    )}
                  </div>
                </div>
                {alert.hasGeometry && (
                  <LocateButton onClick={() => onLocate(alert)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HazardList({
  hazards,
  loading,
  emptyLabel,
  onLocate,
}: {
  hazards: UnifiedHazard[];
  loading: boolean;
  emptyLabel: string;
  onLocate: (hazard: UnifiedHazard) => void;
}) {
  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking road conditions…
      </p>
    );
  if (hazards.length === 0) return <EmptyState label={emptyLabel} />;
  return (
    <ul className="space-y-3">
      {hazards.map((hazard) => (
        <li key={hazard.id} className="rounded-2xl bg-muted/65 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatCategory(hazard.category)}</Badge>
            <span className="text-xs capitalize text-muted-foreground">
              {hazard.urgency}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium leading-snug">
            {hazard.eventType || hazard.headline}
          </p>
          {hazard.areaDesc && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {hazard.areaDesc}
            </p>
          )}
          {hazard.hasGeometry && (
            <LocateButton onClick={() => onLocate(hazard)} />
          )}
        </li>
      ))}
    </ul>
  );
}

function ReportList({
  reports,
  emptyLabel,
  resource = false,
  onLocate,
}: {
  reports: SocialAlert[];
  emptyLabel: string;
  resource?: boolean;
  onLocate: (report: SocialAlert) => void;
}) {
  if (reports.length === 0) return <EmptyState label={emptyLabel} />;
  return (
    <div className="space-y-3">
      {resource && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          These locations come from community reports and may not be officially
          verified. Confirm details before traveling.
        </p>
      )}
      <ul className="space-y-3">
        {reports.map((report) => (
          <li key={report.id} className="rounded-2xl bg-muted/65 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {formatCategory(report.category)}
              </Badge>
              <span className="text-xs capitalize text-muted-foreground">
                {report.urgency} urgency
              </span>
            </div>
            {resource && (
              <p className="mt-2 text-xs font-medium text-primary">
                Community-reported aid location
              </p>
            )}
            <p className="mt-1 text-sm leading-relaxed">{report.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {report.authorHandle || "Community report"}
            </p>
            <LocateButton onClick={() => onLocate(report)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
      <CheckCircle2
        className="mt-0.5 size-4 shrink-0 text-primary"
        aria-hidden="true"
      />
      {label}
    </p>
  );
}

function LocateButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="mt-2 min-h-10 w-full justify-start gap-2 px-2 text-xs font-medium text-primary"
    >
      <MapPin className="size-3.5" aria-hidden="true" />
      Show on map
    </Button>
  );
}

function CopyAddressButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={handleCopy}
      aria-label={copied ? "Address copied" : "Copy address"}
      title={copied ? "Copied!" : "Copy address"}
      className="shrink-0 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
    >
      {copied ? (
        <Check
          className="size-3.5 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}

function formatCategory(category: string) {
  return category
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
