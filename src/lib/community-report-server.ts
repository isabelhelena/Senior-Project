import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

const MAX_REQUEST_BYTES = 8 * 1024;
const UNAVAILABLE_MESSAGE = "Community reports are temporarily unavailable. Please try again.";

export class ReportError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function reportResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function reportError(error: unknown) {
  const status = error instanceof ReportError ? error.status : 503;
  const message = error instanceof ReportError ? error.message : UNAVAILABLE_MESSAGE;
  const response = reportResponse({ error: message }, status);
  if (status === 429) response.headers.set("Retry-After", "3600");
  return response;
}

export function requireSameOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (request.headers.get("origin") !== expected) {
    throw new ReportError(403, "Please submit from this website.");
  }
}

/** All report endpoints expect a JSON object, so check that once here. */
export async function readReportJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ReportError(415, "Send a JSON request.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ReportError(400, "A request body is required.");

  // Stop oversized requests while reading, before buffering the entire body.
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new ReportError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ReportError(400, "Invalid JSON request.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ReportError(400, "Send a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function submissionIdentity(request: Request) {
  const secret = process.env.COMMUNITY_REPORT_SECRET;
  if (!secret || secret.length < 32) {
    throw new ReportError(503, "Community submissions are not configured.");
  }
  const header = process.env.REPORT_CLIENT_IP_HEADER;
  // Only a header replaced by the deployment's trusted ingress is suitable here.
  let ip: string | undefined;
  if (header) {
    ip = request.headers.get(header)?.trim();
  } else if (process.env.NODE_ENV !== "production") {
    ip = "127.0.0.1";
  }
  if (!ip || !isIP(ip)) {
    throw new ReportError(503, "Community submission rate limiting is not configured.");
  }
  return { secret, ipHash: createHmac("sha256", secret).update(ip).digest("hex") };
}

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ReportError(503, "Community reports are not configured.");
  return { url: url.replace(/\/$/, ""), key };
}

export async function reportRpc(name: string, body: Record<string, unknown>, token?: string) {
  const { url, key } = supabaseConfig();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.code === "PT429") throw new ReportError(429, "Submission limit reached. Please try again in one hour.");
    if (error.code === "PT409") throw new ReportError(409, "This report changed. Reload the queue or start a new submission.");
    if (error.code === "22023") throw new ReportError(400, "Invalid report or location. Reports must be within Texas.");
    if (token && response.status === 401) throw new ReportError(401, "Your session expired. Please sign in again.");
    if (token && response.status === 403) throw new ReportError(403, "Moderator access is required.");
    throw new ReportError(503, UNAVAILABLE_MESSAGE);
  }
  return response.json();
}
