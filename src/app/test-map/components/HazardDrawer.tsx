"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  CloudSun,
  Construction,
  Copy,
  Droplets,
  ExternalLink,
  HeartPulse,
  Info,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  ShieldAlert,
  TentTree,
  X,
} from "lucide-react";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import {
  getResourceGroupConfig,
  isAidResourceCategory,
} from "@/lib/community-resources";
import type {
  ResourceGroupKey,
  SocialAlert,
  UnifiedHazard,
  UrgencyLevel,
} from "@/types/hazard";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface HazardDrawerProps {
  hazard: UnifiedHazard | null;
  socialAlerts?: SocialAlert[];
  onClose: () => void;
  onLocate?: (hazard: UnifiedHazard) => void;
  onBackToResources?: () => void;
}

const URGENCY_BADGE_STYLES: Record<UrgencyLevel, string> = {
  critical: "bg-red-600 hover:bg-red-700 text-white border-transparent",
  severe: "bg-orange-500 hover:bg-orange-600 text-white border-transparent",
  medium: "bg-amber-500 hover:bg-amber-600 text-black border-transparent",
  low: "bg-blue-600 hover:bg-blue-700 text-white border-transparent",
  unknown: "bg-muted text-muted-foreground",
};

const RESOURCE_GROUP_ICONS: Record<ResourceGroupKey, typeof TentTree> = {
  shelters: TentTree,
  food_water: Droplets,
  medical: HeartPulse,
  responders: ShieldAlert,
  community_aid: MessageSquare,
};

const PANEL_SHELL_CLASSES =
  "absolute inset-x-0 bottom-0 z-20 flex max-h-[72%] flex-col overflow-hidden rounded-t-3xl bg-background/95 text-foreground shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom dark:bg-background/93 dark:ring-white/10 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-16 sm:max-h-none sm:w-[25rem] sm:rounded-3xl sm:motion-safe:slide-in-from-right";

export function HazardDrawer({
  hazard,
  socialAlerts = [],
  onClose,
  onLocate,
  onBackToResources,
}: HazardDrawerProps) {
  const [activeTab, setActiveTab] = useState<string>("details");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!hazard) return;
    headingRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [hazard, onClose]);

  // Spatially intersect social alerts if the hazard has a Polygon or MultiPolygon geometry
  const nearbySocialPosts = useMemo(() => {
    if (!hazard || !hazard.geometry) return [];
    if (
      hazard.geometry.type !== "Polygon" &&
      hazard.geometry.type !== "MultiPolygon"
    ) {
      return [];
    }

    try {
      return socialAlerts.filter((post) => {
        return booleanPointInPolygon(
          post.coordinates,
          hazard.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
        );
      });
    } catch (err) {
      console.error("Spatial filter failed:", err);
      return [];
    }
  }, [hazard, socialAlerts]);

  if (!hazard) return null;

  const isResourceItem =
    hazard.source === "osm" ||
    Boolean(hazard.resourceGroup) ||
    (hazard.source === "bluesky" && isAidResourceCategory(hazard.category));

  if (isResourceItem) {
    return (
      <ResourceDetailDrawer
        hazard={hazard}
        onClose={onClose}
        onLocate={onLocate}
        onBackToResources={onBackToResources}
      />
    );
  }

  const urgencyStyle =
    URGENCY_BADGE_STYLES[hazard.urgency] || URGENCY_BADGE_STYLES.unknown;
  const HeaderIcon =
    hazard.source === "nws"
      ? CloudSun
      : hazard.source === "txdot"
        ? Construction
        : MessageSquare;

  return (
    <aside className={PANEL_SHELL_CLASSES} aria-label="Alert details">
      <div
        className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden"
        aria-hidden="true"
      />

      {/* Unified Panel Header */}
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <HeaderIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {sourceLabel(hazard.source, hazard.category)}
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="line-clamp-2 text-lg font-semibold leading-snug outline-none"
            >
              {hazard.eventType || hazard.headline}
            </h2>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-11 shrink-0 rounded-full"
          aria-label="Close alert details"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {/* Unified Subbar */}
      <div className="flex items-center justify-between gap-2 border-y border-border/60 px-5 py-2.5 text-sm">
        {onBackToResources ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToResources}
            className="-ml-2 min-h-9 gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            See All Shelters and Aid
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {formatCategory(hazard.category)}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="secondary" className="capitalize">
            {formatCategory(hazard.category)}
          </Badge>
          <Badge className={urgencyStyle}>
            {hazard.urgency.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Tabs Switcher */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 px-5 pt-3">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-muted/65 p-1 group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="details" className="h-9 rounded-xl text-xs">
              Alert details
            </TabsTrigger>
            <TabsTrigger
              value="social"
              className="flex h-9 items-center gap-1.5 rounded-xl text-xs"
            >
              <MessageSquare className="size-3.5" aria-hidden="true" />
              Community ({nearbySocialPosts.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Official Alert Details */}
        <TabsContent
          value="details"
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm"
        >
          {/* Non-geometry bulletin warning */}
          {!hazard.hasGeometry && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-muted/65 p-3.5 text-xs">
              <Info
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">Area-wide alert</p>
                <p className="mt-0.5 leading-relaxed text-muted-foreground">
                  This alert applies to a wider area, so it does not have a
                  precise shape on the map.
                </p>
              </div>
            </div>
          )}

          {/* Expiration Timer */}
          {hazard.expiresAt && (
            <div className="flex items-center gap-2 rounded-2xl bg-muted/65 p-3.5 text-xs text-muted-foreground">
              <Clock
                className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <span>
                Until{" "}
                {new Date(hazard.expiresAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}

          {/* Headline */}
          {hazard.headline && hazard.headline !== hazard.eventType && (
            <div className="rounded-2xl bg-muted/65 p-3.5">
              <h3 className="text-xs font-semibold text-muted-foreground">
                Summary
              </h3>
              <p className="mt-1.5 text-sm font-medium leading-snug">
                {hazard.headline}
              </p>
            </div>
          )}

          {/* Affected Counties / Areas */}
          {hazard.areaDesc && (
            <div className="rounded-2xl bg-muted/65 p-3.5">
              <h3 className="text-xs font-semibold text-muted-foreground">
                Affected areas
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {hazard.areaDesc}
              </p>
            </div>
          )}

          {/* Recommended Action / Instructions */}
          {hazard.instruction && (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/10 p-3.5 text-destructive dark:text-red-300">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
                Recommended action
              </div>
              <p className="mt-1.5 text-xs leading-relaxed">
                {hazard.instruction}
              </p>
            </div>
          )}

          {/* Detailed Description */}
          {hazard.description && (
            <div className="rounded-2xl bg-muted/65 p-3.5">
              <h3 className="text-xs font-semibold text-muted-foreground">
                Details
              </h3>
              <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {hazard.description}
              </p>
            </div>
          )}

          {/* Locate Button */}
          {hazard.hasGeometry && onLocate && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onLocate(hazard)}
              className="min-h-10 w-full gap-2 rounded-xl text-xs font-medium cursor-pointer"
            >
              <MapPin className="size-4" aria-hidden="true" />
              Show on map
            </Button>
          )}
        </TabsContent>

        {/* Tab 2: Community Chatter (Bluesky Posts) */}
        <TabsContent
          value="social"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm"
        >
          {nearbySocialPosts.length > 0 ? (
            <ul className="space-y-3">
              {nearbySocialPosts.map((post) => (
                <li
                  key={post.id}
                  className="rounded-2xl bg-muted/65 p-3.5 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">
                        {formatCategory(post.category)}
                      </Badge>
                      {isAidResourceCategory(post.category) && (
                        <Badge variant="outline" className="text-[10px]">
                          Community-reported aid
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">
                      {post.urgency} urgency
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{post.summary}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {post.authorHandle || "Community report"} •{" "}
                      {new Date(post.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {post.blueskyUri && (
                      <a
                        href={
                          post.blueskyUri.startsWith("http")
                            ? post.blueskyUri
                            : "https://bsky.app"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                      >
                        Bluesky <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              No location-based community reports are listed inside this alert
              area right now.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function ResourceDetailDrawer({
  hazard,
  onClose,
  onLocate,
  onBackToResources,
}: {
  hazard: UnifiedHazard;
  onClose: () => void;
  onLocate?: (hazard: UnifiedHazard) => void;
  onBackToResources?: () => void;
}) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [hazard.id]);

  const isVerified = hazard.verified ?? hazard.source === "osm";
  const groupKey: ResourceGroupKey =
    hazard.resourceGroup ?? (isVerified ? "shelters" : "community_aid");
  const groupConfig = getResourceGroupConfig(groupKey);
  const GroupIcon = RESOURCE_GROUP_ICONS[groupKey] || TentTree;

  const coords =
    hazard.coordinates ??
    (hazard.geometry?.type === "Point"
      ? (hazard.geometry.coordinates as [number, number])
      : undefined);

  const directionsUrl = coords
    ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`
    : hazard.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(hazard.address)}`
      : null;

  const handleCopyAddress = async (addressText: string) => {
    try {
      await navigator.clipboard.writeText(addressText);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 2000);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  };

  return (
    <aside className={PANEL_SHELL_CLASSES} aria-label="Resource details">
      <div
        className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden"
        aria-hidden="true"
      />

      {/* Unified Panel Header (Matches MapInformationPanel) */}
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <GroupIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {groupConfig.label}
              {hazard.resourceSubtype ? ` • ${hazard.resourceSubtype}` : ""}
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="line-clamp-2 text-lg font-semibold leading-snug outline-none"
            >
              {hazard.headline}
            </h2>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-11 shrink-0 rounded-full"
          aria-label="Close resource details"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {/* Unified Subbar (Matches "Show layer on map" bar in MapInformationPanel) */}
      <div className="flex items-center justify-between gap-2 border-y border-border/60 px-5 py-2.5 text-sm">
        {onBackToResources ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBackToResources}
            className="-ml-2 min-h-9 gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            See All Shelters and Aid
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {groupConfig.label}
          </span>
        )}

        {isVerified ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Verified
          </span>
        ) : (
          <Badge
            variant="outline"
            className="border-amber-500/35 bg-amber-500/10 text-[11px] text-amber-900 dark:text-amber-200"
          >
            Unverified
          </Badge>
        )}
      </div>

      {/* Resource Body (Matches MapInformationPanel px-5 py-4 & rounded-2xl bg-muted/65 p-3.5 cards) */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
        {/* Verification Overview Card */}
        <div className="rounded-2xl bg-muted/65 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn("text-xs font-medium", groupConfig.badgeClass)}
              >
                {hazard.resourceSubtype || groupConfig.shortLabel}
              </Badge>
            </div>
            {hazard.distanceMiles !== null &&
              hazard.distanceMiles !== undefined && (
                <span className="text-xs font-medium text-muted-foreground">
                  {hazard.distanceMiles} mi away
                </span>
              )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {isVerified
              ? "Verified OpenStreetMap Texas infrastructure record."
              : `Community-reported aid location shared by ${hazard.authorHandle || "a community member"}. Confirm operating status before traveling.`}
          </p>
        </div>

        {/* Address Card with Copy Button */}
        {hazard.address && (
          <div className="rounded-2xl bg-muted/65 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  Address
                </h3>
                <p className="mt-1 break-words text-sm font-medium leading-snug">
                  {hazard.address}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => handleCopyAddress(hazard.address!)}
                aria-label={copiedAddress ? "Address copied" : "Copy address"}
                title={copiedAddress ? "Copied!" : "Copy address"}
                className="shrink-0 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {copiedAddress ? (
                  <Check
                    className="size-4 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Phone Card */}
        {hazard.phone && (
          <div className="rounded-2xl bg-muted/65 p-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground">
              Phone
            </h3>
            <a
              href={`tel:${hazard.phone}`}
              className="mt-1.5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Phone className="size-3.5 shrink-0" aria-hidden="true" />
              {hazard.phone}
            </a>
          </div>
        )}

        {/* Community Report Summary Card */}
        {!isVerified && hazard.description && (
          <div className="rounded-2xl bg-muted/65 p-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground">
              Community report
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed">
              {hazard.description}
            </p>
          </div>
        )}

        {/* Coordinates Card */}
        {coords && (
          <div className="rounded-2xl bg-muted/65 p-3.5">
            <h3 className="text-xs font-semibold text-muted-foreground">
              Coordinates
            </h3>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {coords[1].toFixed(4)}, {coords[0].toFixed(4)}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 gap-2 border-t border-border/60 pt-4 sm:grid-cols-2">
          {hazard.hasGeometry && onLocate && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onLocate(hazard)}
              className="min-h-10 w-full gap-2 rounded-xl text-xs font-medium cursor-pointer"
            >
              <MapPin className="size-4" aria-hidden="true" />
              Show on map
            </Button>
          )}

          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: "default" }),
                "min-h-10 w-full gap-2 rounded-xl text-xs font-medium",
              )}
            >
              <Navigation className="size-3.5" aria-hidden="true" />
              Get directions
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}

function formatCategory(category: string) {
  return category
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceLabel(
  source: UnifiedHazard["source"],
  category: UnifiedHazard["category"],
) {
  if (source === "bluesky" && isAidResourceCategory(category)) {
    return "Community-reported aid location";
  }

  const labels: Record<UnifiedHazard["source"], string> = {
    nws: "Weather alert",
    txdot: "Road condition",
    osm: "Verified map resource",
    bluesky: "Community report",
  };

  return labels[source];
}
