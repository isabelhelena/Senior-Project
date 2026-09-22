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
        className="size-11 rounded-full border-transparent bg-background/78 shadow-md ring-1 ring-black/5 backdrop-blur-xl hover:bg-background/90 dark:ring-white/10"
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
        className="size-11 rounded-full border-transparent bg-background/78 shadow-md ring-1 ring-black/5 backdrop-blur-xl hover:bg-background/90 dark:ring-white/10"
        title="Show all of Texas"
        aria-label="Show all of Texas"
      >
        <Map className="text-primary" aria-hidden="true" />
      </Button>
    </div>
  );
}
