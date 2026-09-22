"use client";

import Link from "next/link";
import { useState } from "react";
import { LocateFixed, MapPin, Search, TriangleAlert } from "lucide-react";

import { useLocation } from "@/context/LocationContext";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SupportHeader() {
  const { location, setFromZip, resetToGps } = useLocation();
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState("");

  const handleLocationSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedZip = zip.trim();

    if (!/^\d{5}$/.test(normalizedZip)) {
      setZipError("Enter a 5-digit ZIP code.");
      return;
    }

    setZipError("");
    await setFromZip(normalizedZip);
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold tracking-tight">Lone Star Support</p>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {location.loading ? "Finding your location…" : `Current location: ${location.city}`}
              </span>
            </div>
            {location.error && (
              <p className="mt-1 max-w-sm text-xs text-amber-800 dark:text-amber-200">
                {location.error}
              </p>
            )}
          </div>

          <Link
            href="/report"
            className={cn(
              buttonVariants(),
              "min-h-11 shrink-0 gap-2 lg:hidden",
            )}
          >
            <TriangleAlert aria-hidden="true" />
            Report an Issue
          </Link>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <form
            onSubmit={handleLocationSearch}
            className="flex min-w-0 flex-1 items-start gap-2"
            noValidate
          >
            <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
              <label htmlFor="map-location-search" className="sr-only">
                Search by ZIP code
              </label>
              <Input
                id="map-location-search"
                name="zip"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                value={zip}
                onChange={(event) => {
                  setZip(event.target.value.replace(/\D/g, ""));
                  setZipError("");
                }}
                placeholder="ZIP code"
                aria-invalid={Boolean(zipError)}
                aria-describedby={zipError ? "map-location-error" : undefined}
                className="h-11"
              />
              {zipError && (
                <p id="map-location-error" className="mt-1 text-sm text-destructive">
                  {zipError}
                </p>
              )}
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={location.loading}
              className="min-h-11 shrink-0 gap-2 px-4"
            >
              <Search aria-hidden="true" />
              <span className="hidden sm:inline">Search</span>
              <span className="sr-only sm:hidden">Search location</span>
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            onClick={resetToGps}
            disabled={location.loading}
            className="min-h-11 gap-2"
          >
            <LocateFixed aria-hidden="true" />
            Use my location
          </Button>

          <Link
            href="/report"
            className={cn(
              buttonVariants(),
              "hidden min-h-11 gap-2 lg:inline-flex",
            )}
          >
            <TriangleAlert aria-hidden="true" />
            Report an Issue
          </Link>
        </div>

        <div className="sr-only" aria-live="polite">
          {location.error || (!location.loading ? `Current location: ${location.city}` : "")}
        </div>
      </div>
    </header>
  );
}
