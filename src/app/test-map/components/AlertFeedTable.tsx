"use client";

import { useState, useMemo } from "react";
import {
  MapPin,
  Search,
  Filter,
  AlertTriangle,
  Clock,
  ExternalLink,
  Info,
  Car,
  CloudRain,
  Flame,
} from "lucide-react";
import type { UnifiedHazard, UrgencyLevel, DisasterCategory } from "@/types/hazard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AlertFeedTableProps {
  hazards: UnifiedHazard[];
  selectedHazardId?: string | null;
  onSelectHazard: (hazard: UnifiedHazard) => void;
  onLocate: (hazard: UnifiedHazard) => void;
}

const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  critical: "bg-red-600 hover:bg-red-700 text-white",
  severe: "bg-orange-500 hover:bg-orange-600 text-white",
  medium: "bg-amber-500 hover:bg-amber-600 text-black",
  low: "bg-blue-600 hover:bg-blue-700 text-white",
  unknown: "bg-muted text-muted-foreground",
};

export function AlertFeedTable({
  hazards,
  selectedHazardId,
  onSelectHazard,
  onLocate,
}: AlertFeedTableProps) {
  const [filterSource, setFilterSource] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const filteredHazards = useMemo(() => {
    return hazards.filter((h) => {
      // Source filter
      if (filterSource === "nws" && h.source !== "nws") return false;
      if (filterSource === "txdot" && h.source !== "txdot") return false;
      if (filterSource === "polygon" && !h.hasGeometry) return false;
      if (filterSource === "bulletin" && h.hasGeometry) return false;

      // Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchHeadline = h.headline.toLowerCase().includes(term);
        const matchArea = h.areaDesc?.toLowerCase().includes(term);
        const matchEvent = h.eventType?.toLowerCase().includes(term);
        const matchDesc = h.description?.toLowerCase().includes(term);
        return matchHeadline || matchArea || matchEvent || matchDesc;
      }

      return true;
    });
  }, [hazards, filterSource, searchTerm]);

  // Counts
  const counts = useMemo(() => {
    const nwsCount = hazards.filter((h) => h.source === "nws").length;
    const txdotCount = hazards.filter((h) => h.source === "txdot").length;
    const polygonCount = hazards.filter((h) => h.hasGeometry).length;
    const bulletinCount = hazards.filter((h) => !h.hasGeometry).length;
    return { all: hazards.length, nws: nwsCount, txdot: txdotCount, polygon: polygonCount, bulletin: bulletinCount };
  }, [hazards]);

  return (
    <div className="w-full bg-card text-card-foreground border-t border-border p-4 md:p-6 space-y-4">
      {/* Feed Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Texas Telemetry Feed & Data Inspector
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time feed across Texas: {counts.all} total records ({counts.polygon} with map geometry, {counts.bulletin} county advisories)
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter county, route, or alert..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <Tabs
        value={filterSource}
        onValueChange={setFilterSource}
        className="w-full"
      >
        <TabsList className="w-full sm:w-auto flex flex-wrap h-auto gap-1 p-1 bg-muted/60">
          <TabsTrigger value="all" className="text-xs">
            All ({counts.all})
          </TabsTrigger>
          <TabsTrigger value="nws" className="text-xs flex items-center gap-1">
            <CloudRain className="w-3.5 h-3.5" /> NWS Weather ({counts.nws})
          </TabsTrigger>
          <TabsTrigger value="txdot" className="text-xs flex items-center gap-1">
            <Car className="w-3.5 h-3.5" /> TxDOT Roads ({counts.txdot})
          </TabsTrigger>
          <TabsTrigger value="polygon" className="text-xs">
            Polygons Only ({counts.polygon})
          </TabsTrigger>
          <TabsTrigger value="bulletin" className="text-xs">
            County Advisories ({counts.bulletin})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Feed Cards / Rows */}
      {filteredHazards.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground bg-muted/20 border border-dashed border-border rounded-lg text-xs">
          No active hazards match the selected filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredHazards.map((hazard) => {
            const isSelected = selectedHazardId === hazard.id;
            const urgencyClass = URGENCY_COLORS[hazard.urgency] || URGENCY_COLORS.unknown;

            return (
              <div
                key={hazard.id}
                onClick={() => onSelectHazard(hazard)}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-3 text-left
                  ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                      : "border-border bg-card/60 hover:bg-muted/50"
                  }
                `}
              >
                {/* Card Top */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className={urgencyClass}>
                        {hazard.urgency.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {hazard.source}
                      </Badge>
                    </div>

                    {hazard.hasGeometry ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                      >
                        <MapPin className="w-3 h-3" /> On Map
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[10px] flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                      >
                        <Info className="w-3 h-3" /> County Zone
                      </Badge>
                    )}
                  </div>

                  <h4 className="font-semibold text-xs leading-snug line-clamp-2">
                    {hazard.eventType || hazard.headline}
                  </h4>

                  {hazard.areaDesc && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {hazard.areaDesc}
                    </p>
                  )}
                </div>

                {/* Card Bottom / Action */}
                <div className="pt-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1 truncate max-w-[150px]">
                    {hazard.expiresAt ? (
                      <>
                        <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                        Expires {new Date(hazard.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </>
                    ) : (
                      <span>Active</span>
                    )}
                  </span>

                  {hazard.hasGeometry ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLocate(hazard);
                      }}
                      className="text-primary hover:text-primary hover:bg-primary/10 gap-1 font-medium cursor-pointer"
                    >
                      <MapPin className="w-3 h-3" /> Locate on Map
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectHazard(hazard);
                      }}
                      className="text-muted-foreground hover:text-foreground gap-1 font-medium cursor-pointer"
                    >
                      View Details
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

