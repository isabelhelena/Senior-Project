"use client";

import { useMemo, useState } from "react";
import {
  X,
  Clock,
  ShieldAlert,
  MapPin,
  MessageSquare,
  AlertTriangle,
  Info,
  ExternalLink,
} from "lucide-react";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { UnifiedHazard, SocialAlert, UrgencyLevel } from "@/types/hazard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface HazardDrawerProps {
  hazard: UnifiedHazard | null;
  socialAlerts?: SocialAlert[];
  onClose: () => void;
  onLocate?: (hazard: UnifiedHazard) => void;
}

const URGENCY_BADGE_STYLES: Record<UrgencyLevel, string> = {
  critical: "bg-red-600 hover:bg-red-700 text-white border-transparent",
  severe: "bg-orange-500 hover:bg-orange-600 text-white border-transparent",
  medium: "bg-amber-500 hover:bg-amber-600 text-black border-transparent",
  low: "bg-blue-600 hover:bg-blue-700 text-white border-transparent",
  unknown: "bg-muted text-muted-foreground",
};

export function HazardDrawer({
  hazard,
  socialAlerts = [],
  onClose,
  onLocate,
}: HazardDrawerProps) {
  const [activeTab, setActiveTab] = useState<string>("details");

  // Spatially intersect social alerts if the hazard has a Polygon or MultiPolygon geometry
  const nearbySocialPosts = useMemo(() => {
    if (!hazard || !hazard.geometry) return [];
    if (hazard.geometry.type !== "Polygon" && hazard.geometry.type !== "MultiPolygon") {
      return [];
    }

    try {
      return socialAlerts.filter((post) => {
        return booleanPointInPolygon(post.coordinates, hazard.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
      });
    } catch (err) {
      console.error("Spatial filter failed:", err);
      return [];
    }
  }, [hazard, socialAlerts]);

  if (!hazard) return null;

  const urgencyStyle = URGENCY_BADGE_STYLES[hazard.urgency] || URGENCY_BADGE_STYLES.unknown;

  return (
    <aside
      className="absolute top-4 right-4 z-20 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] 
                 flex flex-col bg-card/95 text-card-foreground backdrop-blur-md border border-border 
                 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 animate-in slide-in-from-right"
      aria-label="Hazard Details Drawer"
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-start justify-between bg-muted/40">
        <div className="space-y-1.5 pr-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={urgencyStyle}>
              {hazard.urgency.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
              {hazard.source}
            </Badge>
            <Badge variant="secondary" className="text-[10px] uppercase">
              {hazard.category.replace("_", " ")}
            </Badge>
          </div>
          <h2 className="text-base font-semibold leading-snug">
            {hazard.eventType || hazard.headline}
          </h2>
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground cursor-pointer -mt-1 -mr-1"
          aria-label="Close drawer"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs Switcher */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="px-4 pt-3 border-b border-border bg-card">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="details" className="text-xs">
              Official Alert
            </TabsTrigger>
            <TabsTrigger value="social" className="text-xs flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Community ({nearbySocialPosts.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Official Alert Details */}
        <TabsContent
          value="details"
          className="p-4 overflow-y-auto space-y-3.5 text-sm flex-1"
        >
          {/* Non-geometry bulletin warning */}
          {!hazard.hasGeometry && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs">
              <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">County-Wide Bulletin</span>
                This watch/advisory covers regional zones without a localized radar polygon.
              </div>
            </div>
          )}

          {/* Expiration Timer */}
          {hazard.expiresAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg border border-border">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                Expires: {new Date(hazard.expiresAt).toLocaleString(undefined, {
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
            <div>
              <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
                Headline
              </span>
              <p className="text-xs leading-relaxed">{hazard.headline}</p>
            </div>
          )}

          {/* Affected Counties / Areas */}
          {hazard.areaDesc && (
            <div>
              <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
                Affected Areas
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {hazard.areaDesc}
              </p>
            </div>
          )}

          {/* Recommended Action / Instructions */}
          {hazard.instruction && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive dark:text-red-300">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1">
                <ShieldAlert className="w-3.5 h-3.5" /> Recommended Action
              </div>
              <p className="text-xs leading-relaxed">{hazard.instruction}</p>
            </div>
          )}

          {/* Detailed Description */}
          {hazard.description && (
            <div>
              <span className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
                Description
              </span>
              <div className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto pr-1 bg-muted/20 p-2.5 rounded-md border border-border">
                {hazard.description}
              </div>
            </div>
          )}

          {/* Locate Button */}
          {hazard.hasGeometry && onLocate && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onLocate(hazard)}
                className="w-full flex items-center justify-center gap-1.5 text-xs cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5" /> Focus on Map
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Community Chatter (Bluesky Posts) */}
        <TabsContent
          value="social"
          className="p-4 overflow-y-auto space-y-3 text-sm flex-1"
        >
          {nearbySocialPosts.length > 0 ? (
            <div className="space-y-2.5">
              <div className="text-xs text-muted-foreground flex items-center justify-between pb-1">
                <span>{nearbySocialPosts.length} report(s) inside this warning polygon</span>
              </div>
              {nearbySocialPosts.map((post) => (
                <div
                  key={post.id}
                  className="p-3 rounded-lg bg-muted/40 border border-border space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-primary">
                      {post.authorHandle || "Citizen Report"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {post.urgency.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed">{post.summary}</p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                    <span>{new Date(post.createdAt).toLocaleTimeString()}</span>
                    {post.blueskyUri && (
                      <a
                        href={post.blueskyUri.startsWith("http") ? post.blueskyUri : `https://bsky.app`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                      >
                        Bluesky <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center space-y-2 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto stroke-1 opacity-60" />
              <p className="text-xs font-medium text-foreground">No Community Reports Inside Polygon</p>
              <p className="text-[11px] leading-relaxed max-w-[240px] mx-auto">
                No geotagged Bluesky posts were detected inside this polygon yet. The AI worker is actively monitoring the firehose.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}

