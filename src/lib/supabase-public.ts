const PLACEHOLDER_PATTERN = /^(your[_-]|<|replace[_-]|changeme|example$)/i;

function isSafeSupabaseUrl(rawUrl: string | undefined): string | null {
  const trimmed = rawUrl?.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed.includes("YOUR_PROJECT")) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return null;
    if (parsed.protocol === "https:") return trimmed;
    const isLoopback =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "[::1]";
    if (parsed.protocol === "http:" && isLoopback) return trimmed;
  } catch {
    return null;
  }
  return null;
}

export function isJwtFormat(key: string): boolean {
  const parts = key.split(".");
  return parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
}

function inspectJwtRole(key: string): { valid: boolean; role?: string } {
  const parts = key.split(".");
  if (parts.length !== 3) return { valid: false };
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { valid: false };
    }
    const role = typeof payload.role === "string" ? payload.role : undefined;
    return { valid: true, role };
  } catch {
    return { valid: false };
  }
}

export function isSafePublicSupabaseKey(rawKey: string | undefined): boolean {
  const key = rawKey?.trim();
  if (!key || key.length < 10 || PLACEHOLDER_PATTERN.test(key)) {
    return false;
  }
  const lower = key.toLowerCase();
  if (lower.startsWith("sb_secret_") || lower.includes("service_role")) {
    return false;
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey && key === serviceKey) {
    return false;
  }
  if (isJwtFormat(key) || key.startsWith("eyJ")) {
    const { valid, role } = inspectJwtRole(key);
    if (!valid || role !== "anon") {
      return false;
    }
  }
  return true;
}

export interface PublicSupabaseConfig {
  url: string;
  key: string;
}

/**
 * Resolve Supabase URL and a non-privileged public API key from process.env only.
 * Never loads worker .env files or accepts service-role / sb_secret_ keys.
 */
export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = isSafeSupabaseUrl(
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  );
  if (!url) return null;

  const candidates = [
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    return isSafePublicSupabaseKey(trimmed) ? { url, key: trimmed } : null;
  }

  return null;
}

export function supabasePublicHeaders(key: string, userToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  };
  if (userToken) {
    headers.Authorization = `Bearer ${userToken}`;
  } else if (isJwtFormat(key)) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}
