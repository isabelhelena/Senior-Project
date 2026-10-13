import { NextResponse } from "next/server";

/** Server-side read access through a narrowly scoped public RPC. */
export async function officialAlerts(source: "nws" | "txdot") {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Stored alerts are not configured." }, { status: 503 });
  }
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/read_official_alerts`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_source: source }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Database read failed");
    const data = await response.json();
    if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
      throw new Error("Invalid stored feed");
    }
    if (!data.fetchedAt) {
      return NextResponse.json({ error: "The first alert ingestion has not completed yet." }, { status: 503 });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Stored alerts are temporarily unavailable." }, { status: 503 });
  }
}
