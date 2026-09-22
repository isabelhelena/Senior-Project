'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface LocationState {
  lat: number;
  lng: number;
  city: string;
  source: 'gps' | 'zip' | 'map' | 'fallback';
  loading: boolean;
  error?: string;
}

interface LocationContextType {
  location: LocationState;
  setFromZip: (zip: string) => Promise<void>;
  setFromMap: (lat: number, lng: number) => void;
  resetToGps: () => void;
}

const DEFAULT_LOCATION: LocationState = {
  lat: 29.4241,
  lng: -98.4936,
  city: 'San Antonio (Default)',
  source: 'fallback',
  loading: true,
};

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LocationState>(DEFAULT_LOCATION);
  const activeMapSelection = useRef<string | null>(null);

  const applyGpsPosition = useCallback((pos: GeolocationPosition) => {
    activeMapSelection.current = null;
    const coords: LocationState = {
      lat: parseFloat(pos.coords.latitude.toFixed(4)),
      lng: parseFloat(pos.coords.longitude.toFixed(4)),
      city: 'Current Location',
      source: 'gps',
      loading: false,
    };
    setLocation(coords);
    try {
      localStorage.setItem('lss_cached_loc', JSON.stringify(coords));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleGpsError = useCallback((err?: GeolocationPositionError) => {
    if (err) {
      console.warn('Geolocation prompt rejected or timed out:', err.message);
    }

    let fallbackToUse = {
      ...DEFAULT_LOCATION,
      loading: false,
      error: 'Location access unavailable. Displaying default area.',
    };

    try {
      const cached = localStorage.getItem('lss_cached_loc');
      if (cached) {
        fallbackToUse = { ...JSON.parse(cached), loading: false };
      }
    } catch {
      // Ignore parse errors
    }

    setLocation(fallbackToUse);
  }, []);

  const resetToGps = useCallback(() => {
    activeMapSelection.current = null;
    setLocation((prev) => ({ ...prev, loading: true, error: undefined }));

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      handleGpsError();
      return;
    }

    navigator.geolocation.getCurrentPosition(applyGpsPosition, handleGpsError, {
      timeout: 8000,
      enableHighAccuracy: false,
    });
  }, [applyGpsPosition, handleGpsError]);

  const setFromZip = async (zip: string) => {
    activeMapSelection.current = null;
    setLocation((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const res = await fetch(`/api/geocode?zip=${encodeURIComponent(zip)}`);
      const data = (await res.json()) as { city: string; state: string; lat: number; lng: number; error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Failed to geocode ZIP code');
      }

      const updatedLoc: LocationState = {
        lat: data.lat,
        lng: data.lng,
        city: `${data.city}, ${data.state}`,
        source: 'zip',
        loading: false,
      };

      setLocation(updatedLoc);
      try {
        localStorage.setItem('lss_cached_loc', JSON.stringify(updatedLoc));
      } catch {
        // Ignore storage errors
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error resolving ZIP code';
      setLocation((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    }
  };

  const setFromMap = useCallback((lat: number, lng: number) => {
    const roundedLat = parseFloat(lat.toFixed(4));
    const roundedLng = parseFloat(lng.toFixed(4));
    const selectionKey = `${roundedLat},${roundedLng}`;
    activeMapSelection.current = selectionKey;
    const selectedLocation: LocationState = {
      lat: roundedLat,
      lng: roundedLng,
      city: 'Selected location',
      source: 'map',
      loading: false,
    };

    setLocation(selectedLocation);
    try {
      localStorage.setItem('lss_cached_loc', JSON.stringify(selectedLocation));
    } catch {
      // Ignore storage errors
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/geocode?lat=${encodeURIComponent(roundedLat)}&lng=${encodeURIComponent(roundedLng)}`
        );
        const data = (await res.json()) as {
          city?: string;
          state?: string;
        };

        if (!res.ok || !data.city) return;

        if (activeMapSelection.current !== selectionKey) return;

        const placeLabel = data.state ? `${data.city}, ${data.state}` : data.city;
        const namedLocation = { ...selectedLocation, city: placeLabel };
        setLocation(namedLocation);
        try {
          localStorage.setItem('lss_cached_loc', JSON.stringify(namedLocation));
        } catch {
          // Ignore storage errors
        }
      } catch {
        // Keep the user-friendly fallback label when reverse geocoding is unavailable.
      }
    })();
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      // Defer execution out of the current synchronous render cycle
      queueMicrotask(() => {
        handleGpsError();
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(applyGpsPosition, handleGpsError, {
      timeout: 8000,
      enableHighAccuracy: false,
    });
  }, [applyGpsPosition, handleGpsError]);

  return (
    <LocationContext.Provider value={{ location, setFromZip, setFromMap, resetToGps }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return ctx;
}
