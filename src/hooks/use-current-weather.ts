"use client";

import { useEffect, useState } from "react";

export interface WeatherData {
  station: string;
  stationName: string;
  condition: string;
  tempF: number | null;
  windMph: number | null;
  windDirection: number | null;
  humidity: number | null;
  timestamp: string;
}

export function useCurrentWeather(lat?: number, lng?: number) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWeather() {
      if (lat === undefined || lng === undefined) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/weather-current?lat=${lat}&lng=${lng}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as WeatherData & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(result.error || "Failed to load weather");
        }

        setData(result);
      } catch (weatherError: unknown) {
        if (controller.signal.aborted) return;
        setError(
          weatherError instanceof Error
            ? weatherError.message
            : "Error fetching weather",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadWeather();
    return () => controller.abort();
  }, [lat, lng]);

  return { data, loading, error };
}
