import { Loader2 } from "lucide-react";

import type { WeatherData } from "@/hooks/use-current-weather";

interface CompactWeatherOverlayProps {
  locationLabel: string;
  data: WeatherData | null;
  loading: boolean;
  error: string | null;
}

export function CompactWeatherOverlay({
  locationLabel,
  data,
  loading,
  error,
}: CompactWeatherOverlayProps) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-10rem)] rounded-2xl bg-background/80 px-4 py-2.5 text-foreground shadow-lg ring-1 ring-black/5 backdrop-blur-xl dark:bg-background/75 dark:ring-white/10 sm:left-4 sm:top-4 sm:max-w-sm">
      <p className="truncate text-sm font-semibold leading-tight">
        {locationLabel}
      </p>
      <div className="mt-0.5 flex min-h-6 items-center gap-1.5 text-lg font-medium tracking-tight">
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">Checking weather…</span>
          </>
        ) : error || !data ? (
          <span className="text-sm text-muted-foreground">Weather unavailable</span>
        ) : (
          <>
            <span>{data.tempF !== null ? `${Math.round(data.tempF)}°` : "--"}</span>
            <span aria-hidden="true" className="text-muted-foreground">•</span>
            <span className="truncate text-sm font-normal">{data.condition}</span>
          </>
        )}
      </div>
    </div>
  );
}
