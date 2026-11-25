import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  getPublicSupabaseConfig,
  isSafePublicSupabaseKey,
  supabasePublicHeaders,
} from "./supabase-public";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

const originalEnv = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

function clearSupabaseEnv() {
  for (const key of [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    delete process.env[key];
  }
}

test("accepts publishable and anon JWT keys with valid URLs", () => {
  clearSupabaseEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co/";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  assert.deepEqual(getPublicSupabaseConfig(), {
    url: "https://example.supabase.co",
    key: "sb_publishable_test",
  });

  clearSupabaseEnv();
  const anonJwt = fakeJwt({ role: "anon", iss: "supabase" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonJwt;
  assert.deepEqual(getPublicSupabaseConfig(), {
    url: "http://127.0.0.1:54321",
    key: anonJwt,
  });
});

test("rejects secret, service-role, placeholder, and malformed keys", () => {
  clearSupabaseEnv();
  const serviceJwt = fakeJwt({ role: "service_role", iss: "supabase" });
  const authenticatedJwt = fakeJwt({ role: "authenticated" });
  const anonJwt = fakeJwt({ role: "anon" });

  process.env.SUPABASE_SERVICE_ROLE_KEY = anonJwt;
  for (const bad of [
    "",
    "   ",
    "short",
    "YOUR_PUBLISHABLE_KEY",
    "<ANON_KEY>",
    "sb_secret_1234567890",
    serviceJwt,
    authenticatedJwt,
    "eyJinvalid.notbase64.sig",
    anonJwt, // matches SUPABASE_SERVICE_ROLE_KEY
  ]) {
    assert.equal(isSafePublicSupabaseKey(bad), false);
  }
});

test("rejects unsafe fallback keys and refuses to bypass unsafe primary keys", () => {
  clearSupabaseEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_server_only";
  process.env.SUPABASE_ANON_KEY = "sb_secret_server_only";
  assert.equal(getPublicSupabaseConfig(), null);

  clearSupabaseEnv();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = fakeJwt({ role: "service_role" });
  process.env.SUPABASE_ANON_KEY = fakeJwt({ role: "anon" });
  assert.equal(getPublicSupabaseConfig(), null);
});

test("rejects placeholder or insecure non-loopback HTTP URLs", () => {
  clearSupabaseEnv();
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  for (const badUrl of [
    "https://YOUR_PROJECT.supabase.co",
    "http://example.supabase.co",
    "not-a-url",
    "https://user:pass@example.supabase.co",
  ]) {
    process.env.SUPABASE_URL = badUrl;
    assert.equal(getPublicSupabaseConfig(), null);
  }
});

test("headers never put sb_publishable keys into Authorization Bearer", () => {
  assert.deepEqual(supabasePublicHeaders("sb_publishable_test"), {
    apikey: "sb_publishable_test",
    "Content-Type": "application/json",
  });

  const anonJwt = fakeJwt({ role: "anon" });
  assert.deepEqual(supabasePublicHeaders(anonJwt), {
    apikey: anonJwt,
    Authorization: `Bearer ${anonJwt}`,
    "Content-Type": "application/json",
  });

  assert.deepEqual(supabasePublicHeaders("sb_publishable_test", "user-jwt"), {
    apikey: "sb_publishable_test",
    Authorization: "Bearer user-jwt",
    "Content-Type": "application/json",
  });
});
