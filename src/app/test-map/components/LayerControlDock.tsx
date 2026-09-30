"use client";

import { CloudSun, Construction, MessageSquare, TentTree } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LayerVisibility {
  nws: boolean;
  txdot: boolean;
  social: boolean;
  resources: boolean;
}

export type InformationSection = "weather" | "roads" | "resources" | "community";

interface LayerControlDockProps {
  activeSection: InformationSection | null;
  onSelect: (section: InformationSection) => void;
}

const controls = [
  { key: "weather", label: "Weather", icon: CloudSun },
  { key: "roads", label: "Roads", icon: Construction },
  { key: "resources", label: "Shelters & Aid", icon: TentTree },
  { key: "community", label: "Community", icon: MessageSquare },
] as const;

export function LayerControlDock({ activeSection, onSelect }: LayerControlDockProps) {
  return (
    <nav aria-label="Map information" className="absolute inset-x-3 bottom-3 z-10 mx-auto grid max-w-md grid-cols-4 gap-1.5 rounded-2xl bg-background/78 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:bg-background/72 dark:ring-white/10 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:mx-0 sm:gap-2 sm:p-2">
      {controls.map(({ key, label, icon: Icon }) => {
        const active = activeSection === key;
        return (
          <Button
            key={key}
            type="button"
            variant="ghost"
            onClick={() => onSelect(key)}
            aria-expanded={active}
            aria-controls="map-information-panel"
            className={`h-14 min-w-0 flex-col gap-1 rounded-xl px-1.5 text-[11px] font-medium leading-none sm:h-16 sm:min-w-20 sm:px-2 sm:text-xs ${active ? "bg-foreground text-background shadow-sm hover:bg-foreground/90 hover:text-background" : "text-foreground hover:bg-background/70"}`}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="max-w-full whitespace-normal text-center leading-tight">{label}</span>
          </Button>
        );
      })}
    </nav>
  );
}
