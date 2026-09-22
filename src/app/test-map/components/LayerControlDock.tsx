"use client";

import { CloudRain, Construction, Layers, MessageSquare, TentTree } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LayerVisibility {
  nws: boolean;
  txdot: boolean;
  social: boolean;
  resources: boolean;
}

interface LayerControlDockProps {
  visibility: LayerVisibility;
  nwsCount: number;
  txdotCount: number;
  socialCount: number;
  resourceCount: number;
  onToggleLayer: (key: keyof LayerVisibility) => void;
}

export function LayerControlDock({
  visibility,
  nwsCount,
  txdotCount,
  socialCount,
  resourceCount,
  onToggleLayer,
}: LayerControlDockProps) {
  return (
    <div
      className="absolute bottom-3 left-3 z-10 flex w-[min(19rem,calc(100%-1.5rem))] flex-col gap-1.5 rounded-xl border border-border bg-card/95 p-2.5 text-sm shadow-lg backdrop-blur-md sm:bottom-4 sm:left-4"
      aria-label="Map layers"
    >
      <div className="mb-0.5 flex items-center gap-2 px-1 py-1 font-semibold">
        <Layers className="size-4" aria-hidden="true" /> Map layers
      </div>

      <Button
        variant={visibility.nws ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onToggleLayer("nws")}
        aria-pressed={visibility.nws}
        className={`min-h-11 w-full justify-between px-3 text-sm font-normal ${
          !visibility.nws ? "opacity-60 text-muted-foreground" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          <CloudRain className="size-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          Weather Alerts ({nwsCount})
        </span>
        <span className="text-xs font-medium">{visibility.nws ? "On" : "Off"}</span>
      </Button>

      <Button
        variant={visibility.txdot ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onToggleLayer("txdot")}
        aria-pressed={visibility.txdot}
        className={`min-h-11 w-full justify-between px-3 text-sm font-normal ${
          !visibility.txdot ? "opacity-60 text-muted-foreground" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          <Construction className="size-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          Road Closures ({txdotCount})
        </span>
        <span className="text-xs font-medium">{visibility.txdot ? "On" : "Off"}</span>
      </Button>

      <Button
        variant={visibility.social ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onToggleLayer("social")}
        aria-pressed={visibility.social}
        className={`min-h-11 w-full justify-between px-3 text-sm font-normal ${
          !visibility.social ? "opacity-60 text-muted-foreground" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          <MessageSquare className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          Community Reports ({socialCount})
        </span>
        <span className="text-xs font-medium">{visibility.social ? "On" : "Off"}</span>
      </Button>

      <Button
        variant={visibility.resources ? "secondary" : "ghost"}
        size="sm"
        disabled={resourceCount === 0}
        onClick={() => onToggleLayer("resources")}
        aria-pressed={resourceCount > 0 ? visibility.resources : undefined}
        className={`min-h-11 w-full justify-between px-3 text-sm font-normal ${
          !visibility.resources ? "opacity-60 text-muted-foreground" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          <TentTree className="size-4 text-green-700 dark:text-green-400" aria-hidden="true" />
          Shelters &amp; Aid ({resourceCount})
        </span>
        <span className="text-xs font-medium">
          {resourceCount === 0 ? "Unavailable" : visibility.resources ? "On" : "Off"}
        </span>
      </Button>
    </div>
  );
}
