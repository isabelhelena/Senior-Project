"use client";

import { useState } from "react";
import { LocateFixed, MapPin, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "@/context/LocationContext";

export function SupportHeader() {
  const { location, setFromZip, resetToGps } = useLocation();
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const handleLocationSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedZip = zip.trim();
    if (!/^\d{5}$/.test(normalizedZip)) {
      setZipError("Enter a 5-digit ZIP code.");
      return;
    }
    setZipError("");
    await setFromZip(normalizedZip);
    setSearchOpen(false);
  };

  return (
    <header className="relative z-30 border-b border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-screen-2xl items-center gap-3 px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold tracking-tight sm:text-lg">Lone Star Support</p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{location.loading ? "Finding your location…" : location.city}</span>
          </p>
        </div>

        <Button type="button" variant="ghost" size="icon" onClick={() => setSearchOpen((open) => !open)} aria-expanded={searchOpen} aria-controls="location-search-panel" aria-label={searchOpen ? "Close location search" : "Search for a location"} className="size-11 rounded-full md:hidden">
          {searchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
        </Button>

        <LocationActions idSuffix="desktop" zip={zip} zipError={zipError} loading={location.loading} onZipChange={(value) => { setZip(value); setZipError(""); }} onSubmit={handleLocationSearch} onGps={resetToGps} className="hidden md:flex" />
      </div>

      {searchOpen && (
        <div id="location-search-panel" className="border-t border-border/60 px-4 py-3 md:hidden">
          <LocationActions idSuffix="mobile" zip={zip} zipError={zipError} loading={location.loading} onZipChange={(value) => { setZip(value); setZipError(""); }} onSubmit={handleLocationSearch} onGps={resetToGps} className="flex" />
        </div>
      )}

      {location.error && <p role="status" className="px-4 pb-2 text-xs text-amber-800 dark:text-amber-200 sm:px-6">{location.error}</p>}
      <div className="sr-only" aria-live="polite">{location.error || (!location.loading ? `Current location: ${location.city}` : "")}</div>
    </header>
  );
}

interface LocationActionsProps {
  idSuffix: string;
  zip: string;
  zipError: string;
  loading: boolean;
  className: string;
  onZipChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onGps: () => void;
}

function LocationActions({ idSuffix, zip, zipError, loading, className, onZipChange, onSubmit, onGps }: LocationActionsProps) {
  const inputId = `map-location-search-${idSuffix}`;
  const errorId = `map-location-error-${idSuffix}`;
  return (
    <div className={`${className} flex-col gap-2 sm:flex-row sm:items-start`}>
      <form onSubmit={onSubmit} className="flex min-w-0 items-start gap-2" noValidate>
        <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
          <label htmlFor={inputId} className="sr-only">Search by ZIP code</label>
          <Input id={inputId} name="zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={zip} onChange={(event) => onZipChange(event.target.value.replace(/\D/g, ""))} placeholder="ZIP code" aria-invalid={Boolean(zipError)} aria-describedby={zipError ? errorId : undefined} className="h-11 rounded-full bg-muted/70 px-4" />
          {zipError && <p id={errorId} className="mt-1 px-2 text-sm text-destructive">{zipError}</p>}
        </div>
        <Button type="submit" variant="secondary" disabled={loading} className="size-11 shrink-0 rounded-full px-0" aria-label="Search ZIP code"><Search aria-hidden="true" /></Button>
      </form>
      <Button type="button" variant="ghost" onClick={onGps} disabled={loading} className="min-h-11 justify-start gap-2 rounded-full px-4 sm:justify-center"><LocateFixed aria-hidden="true" />Use My Location</Button>
    </div>
  );
}
