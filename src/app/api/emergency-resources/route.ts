import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import {
  deduplicateEmergencyResources,
  getResourceGroupForOsmType,
  metersToMiles,
} from "@/lib/community-resources";
import type { EmergencyResource, EmergencyResourceType } from "@/types/hazard";

interface RawSupabaseResourceRow {
  id: string;
  osm_id: string;
  name: string;
  resource_type: string;
  address?: string | null;
  phone?: string | null;
  dist_meters: number;
  lon: number;
  lat: number;
}

let cachedWorkerEnv: Record<string, string> | null = null;

function readFallbackServerEnv(): Record<string, string> {
  if (cachedWorkerEnv) return cachedWorkerEnv;

  const parsed: Record<string, string> = {};
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "workers", "emergency_resources", ".env"),
    path.join(process.cwd(), "workers", "bluesky", ".env"),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && value && !parsed[key]) {
          parsed[key] = value;
        }
      }
    } catch {
      // Ignore unreadable env files
    }
  }

  cachedWorkerEnv = parsed;
  return parsed;
}

function getSupabaseCredentials(): { url: string; key: string } | null {
  const fallback = readFallbackServerEnv();
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    fallback.SUPABASE_URL ||
    fallback.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    fallback.SUPABASE_ANON_KEY ||
    fallback.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    fallback.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json(
      { error: "Valid lat and lng query parameters are required" },
      { status: 400 },
    );
  }

  const rawRadius = Number(searchParams.get("radiusMeters") || "25000");
  const radiusMeters = Number.isFinite(rawRadius)
    ? Math.max(3000, Math.min(65000, rawRadius))
    : 25000;

  const typesParam = searchParams.get("types")?.trim() || "";
  const filterTypes = typesParam
    ? typesParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : null;

  const searchQuery = searchParams.get("q")?.trim() || "";
  const includeUnnamed = searchParams.get("includeUnnamed") === "true";
  const rawLimit = Number(searchParams.get("limit") || "250");
  const resultLimit = Number.isFinite(rawLimit)
    ? Math.max(10, Math.min(500, rawLimit))
    : 250;

  if (filterTypes && filterTypes.length === 0) {
    return NextResponse.json({ resources: [], totalRaw: 0 });
  }

  const creds = getSupabaseCredentials();
  if (!creds) {
    return NextResponse.json(
      {
        error:
          "Supabase credentials are not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
      },
      { status: 503 },
    );
  }

  const rpcEndpoint = `${creds.url}/rest/v1/rpc/get_nearby_emergency_resources`;
  const headers = {
    apikey: creds.key,
    Authorization: `Bearer ${creds.key}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. Try the upgraded RPC signature first
    let res = await fetch(rpcEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_lon: lng,
        user_lat: lat,
        max_distance_meters: radiusMeters,
        filter_type:
          filterTypes && filterTypes.length === 1 ? filterTypes[0] : null,
        filter_types: filterTypes,
        search_query: searchQuery || null,
        include_unnamed: includeUnnamed,
        result_limit: resultLimit,
      }),
      next: { revalidate: 120 },
    });

    // 2. Fallback to the original 4-argument signature if the SQL migration hasn't been run yet
    if (!res.ok && (res.status === 404 || res.status === 400)) {
      res = await fetch(rpcEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_lon: lng,
          user_lat: lat,
          max_distance_meters: radiusMeters,
          filter_type:
            filterTypes && filterTypes.length === 1 ? filterTypes[0] : null,
        }),
        next: { revalidate: 120 },
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        {
          error: `Supabase RPC responded with status ${res.status}`,
          details: errText.slice(0, 200),
        },
        { status: res.status },
      );
    }

    const rawRows = (await res.json()) as RawSupabaseResourceRow[];
    if (!Array.isArray(rawRows)) {
      return NextResponse.json({ resources: [], totalRaw: 0 });
    }

    const typeSet = filterTypes ? new Set(filterTypes) : null;
    const lowerQuery = searchQuery.toLowerCase();

    const filteredRows = rawRows.filter((row) => {
      if (!row || !Number.isFinite(row.lon) || !Number.isFinite(row.lat)) {
        return false;
      }
      if (typeSet && !typeSet.has(row.resource_type)) {
        return false;
      }
      if (!includeUnnamed && row.name?.startsWith("Unnamed ")) {
        return false;
      }
      if (lowerQuery) {
        const nameMatch = row.name?.toLowerCase().includes(lowerQuery);
        const addrMatch = row.address?.toLowerCase().includes(lowerQuery);
        const typeMatch = row.resource_type
          ?.replaceAll("_", " ")
          .toLowerCase()
          .includes(lowerQuery);
        if (!nameMatch && !addrMatch && !typeMatch) {
          return false;
        }
      }
      return true;
    });

    const mapped: EmergencyResource[] = filteredRows.map((row) => ({
      id: row.id,
      osmId: row.osm_id,
      name: row.name,
      resourceType: (row.resource_type || "other") as EmergencyResourceType,
      group: getResourceGroupForOsmType(row.resource_type),
      address: row.address ?? null,
      phone: row.phone ?? null,
      distMeters: Math.round(row.dist_meters),
      distMiles: metersToMiles(row.dist_meters),
      coordinates: [row.lon, row.lat],
      verified: true,
    }));

    const deduped = deduplicateEmergencyResources(mapped).slice(0, resultLimit);

    return NextResponse.json({
      resources: deduped,
      totalRaw: rawRows.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch emergency resources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

