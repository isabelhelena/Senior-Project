'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CloudSun,
  CloudRain,
  Wind,
  Droplets,
  Compass,
  Loader2,
  CloudLightning,
  Sun,
  MapPin
} from 'lucide-react';

interface WeatherData {
  station: string;
  stationName: string;
  condition: string;
  tempF: number | null;
  windMph: number | null;
  windDirection: number | null;
  humidity: number | null;
  timestamp: string;
}

interface WeatherSummaryCardProps {
  lat?: number;
  lng?: number;
  locationLabel?: string;
  compact?: boolean;
}

export function WeatherSummaryCard({ lat, lng, locationLabel, compact = false }: WeatherSummaryCardProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadWeather() {
      if (lat === undefined || lng === undefined) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/weather-current?lat=${lat}&lng=${lng}`);
        const result = (await res.json()) as WeatherData & { error?: string };

        if (!res.ok) {
          throw new Error(result.error || 'Failed to load weather');
        }

        if (isMounted) {
          setData(result);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Error fetching weather');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadWeather();

    return () => {
      isMounted = false;
    };
  }, [lat, lng]);

  const getWeatherIcon = (condition: string) => {
    const lower = condition.toLowerCase();
    if (lower.includes('rain') || lower.includes('shower')) return <CloudRain className="h-8 w-8 text-blue-500" />;
    if (lower.includes('storm') || lower.includes('thunder')) return <CloudLightning className="h-8 w-8 text-amber-500" />;
    if (lower.includes('clear') || lower.includes('sunny')) return <Sun className="h-8 w-8 text-amber-400" />;
    return <CloudSun className="h-8 w-8 text-slate-400" />;
  };

  if (loading) {
    return (
      <Card className="w-full shadow-md">
        <CardContent className="flex items-center justify-center p-6 space-x-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Checking current weather…</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="w-full border-destructive/30">
        <CardContent className="p-4 text-xs text-destructive">
          Current weather is temporarily unavailable. Please try again soon.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full shadow-md border-border/60 bg-card/95 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-semibold tracking-tight">Current weather</CardTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[220px]">{locationLabel || data.stationName}</span>
          </div>
        </div>
        <Badge variant="outline" className="text-xs font-normal">
          {data.condition}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between my-2">
          <div className="flex items-center gap-2">
            {getWeatherIcon(data.condition)}
            <span className="text-3xl font-bold tracking-tight">
              {data.tempF !== null ? `${data.tempF}°F` : '--'}
            </span>
          </div>
        </div>

        {!compact && <div className="grid grid-cols-3 gap-2 border-t pt-3 mt-3 text-xs text-muted-foreground">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <Wind className="h-3.5 w-3.5" />
              <span>Wind</span>
            </div>
            <span className="font-medium text-foreground mt-0.5">
              {data.windMph !== null ? `${data.windMph} mph` : '--'}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <Droplets className="h-3.5 w-3.5" />
              <span>Humidity</span>
            </div>
            <span className="font-medium text-foreground mt-0.5">
              {data.humidity !== null ? `${data.humidity}%` : '--'}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <Compass className="h-3.5 w-3.5" />
              <span>Heading</span>
            </div>
            <span className="font-medium text-foreground mt-0.5">
              {data.windDirection !== null ? `${data.windDirection}°` : '--'}
            </span>
          </div>
        </div>}
      </CardContent>
    </Card>
  );
}
