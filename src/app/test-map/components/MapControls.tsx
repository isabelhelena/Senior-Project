"use client";

import { RefreshCw, Compass } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

interface MapControlsProps {
  refreshing: boolean;
  onRefresh: () => void;
  onResetView: () => void;
}

export function MapControls({
  refreshing,
  onRefresh,
  onResetView,
}: MapControlsProps) {
  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
      {/* Brand Badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-md border border-border shadow-md">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs font-semibold tracking-tight">
          Lone Star CrisisMap
        </span>
      </div>

      <ThemeToggle />

      <Button
        variant="outline"
        size="icon-sm"
        onClick={onRefresh}
        disabled={refreshing}
        className="w-8 h-8 rounded-full border-border bg-card/90 backdrop-blur-md shadow-md cursor-pointer hover:bg-muted"
        title="Refresh active telemetry"
        aria-label="Refresh telemetry"
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
        />
      </Button>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={onResetView}
        className="w-8 h-8 rounded-full border-border bg-card/90 backdrop-blur-md shadow-md cursor-pointer hover:bg-muted"
        title="Reset view to Texas"
        aria-label="Reset view to Texas"
      >
        <Compass className="w-4 h-4 text-primary" />
      </Button>
    </div>
  );
}
