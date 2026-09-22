"use client";

import { RefreshCw, Map } from "lucide-react";
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
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2 sm:right-4 sm:top-4">
      <ThemeToggle />

      <Button
        variant="outline"
        size="icon"
        onClick={onRefresh}
        disabled={refreshing}
        className="size-11 rounded-full border-border bg-card/95 shadow-md backdrop-blur-md hover:bg-muted"
        title="Refresh map information"
        aria-label="Refresh map information"
      >
        <RefreshCw
          className={refreshing ? "animate-spin" : ""}
          aria-hidden="true"
        />
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={onResetView}
        className="size-11 rounded-full border-border bg-card/95 shadow-md backdrop-blur-md hover:bg-muted"
        title="Show all of Texas"
        aria-label="Show all of Texas"
      >
        <Map className="text-primary" aria-hidden="true" />
      </Button>
    </div>
  );
}
