"use client";

import { Layers, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LayerVisibility {
  nws: boolean;
  txdot: boolean;
  social: boolean;
}

interface LayerControlDockProps {
  visibility: LayerVisibility;
  nwsCount: number;
  txdotCount: number;
  socialCount: number;
  onToggleLayer: (key: keyof LayerVisibility) => void;
}

export function LayerControlDock({
  visibility,
  nwsCount,
  txdotCount,
  socialCount,
  onToggleLayer,
}: LayerControlDockProps) {
  return (
    <div className="absolute bottom-6 left-4 z-10 bg-card/90 backdrop-blur-md border border-border rounded-xl p-2.5 shadow-lg flex flex-col gap-1.5 text-xs">
      <div className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5 flex items-center gap-1.5 px-1">
        <Layers className="w-3.5 h-3.5" /> Overlays
      </div>

      <Button
        variant={visibility.nws ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onToggleLayer("nws")}
        className={`w-full justify-between h-7 px-2 text-[11px] font-normal cursor-pointer ${
          !visibility.nws ? "opacity-60 text-muted-foreground" : ""
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />
          NWS Alerts ({nwsCount})
        </span>
        {visibility.nws ? (
          <Eye className="w-3 h-3 text-primary" />
        ) : (
          <EyeOff className="w-3 h-3 text-muted-foreground" />
        )}
      </Button>

      <Button
        variant={visibility.txdot ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onToggleLayer("txdot")}
        className={`w-full justify-between h-7 px-2 text-[11px] font-normal cursor-pointer ${
          !visibility.txdot ? "opacity-60 text-muted-foreground" : ""
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 bg-red-500 rounded" />
          TxDOT Roads ({txdotCount})
        </span>
        {visibility.txdot ? (
          <Eye className="w-3 h-3 text-primary" />
        ) : (
          <EyeOff className="w-3 h-3 text-muted-foreground" />
        )}
      </Button>

      <Button
        variant={visibility.social ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onToggleLayer("social")}
        className={`w-full justify-between h-7 px-2 text-[11px] font-normal cursor-pointer ${
          !visibility.social ? "opacity-60 text-muted-foreground" : ""
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          Community ({socialCount})
        </span>
        {visibility.social ? (
          <Eye className="w-3 h-3 text-primary" />
        ) : (
          <EyeOff className="w-3 h-3 text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}
