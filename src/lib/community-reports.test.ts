import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { NextRequest } from "next/server";
import { contentFlags, isTexasLocation, parseReportBounds, validateSubmission } from "./community-report-validation";
import { normalizeCommunityReport } from "./community-report-feed";
import { POST, GET } from "../app/api/community-reports/route";
import { GET as queue, PATCH as review } from "../app/api/moderation/reports/route";
import { POST as login, DELETE as logout } from "../app/api/moderation/session/route";
import { readReportJson, ReportError, submissionIdentity } from "./community-report-server";

const originalEnv = { ...process.env };
afterEach(() => {
  mock.restoreAll();
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

function configure() {
  Object.assign(process.env, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    COMMUNITY_REPORT_SECRET: "a".repeat(64), REPORT_CLIENT_IP_HEADER: "x-trusted-ip", APP_ORIGIN: "http://localhost:3000" });
}
function payload() { return { category: "road_hazard", severity: "high", description: "Floodwater is blocking the right lane near downtown.",
  latitude: 29.4241, longitude: -98.4936, locationSource: "gps", locationStatus: "ready",
  submissionId: "de1e5510-5ec4-4cce-939d-99032f2e03bb" }; }
function request(body: unknown, options: { origin?: string; cookie?: string; method?: string } = {}) {
  return new NextRequest("http://localhost:3000/api/community-reports", { method: options.method || "POST",
    headers: { origin: options.origin || "http://localhost:3000", "content-type": "application/json", "x-trusted-ip": "203.0.113.10", ...(options.cookie ? { cookie: options.cookie } : {}) },
    body: JSON.stringify(body) });
}

test("Texas shape accepts Texas cities and rejects neighboring states inside its rectangle", () => {
  for (const [lng, lat] of [[-98.4936, 29.4241], [-106.485, 31.7619], [-95.3698, 29.7604]]) assert.ok(isTexasLocation(lng, lat));
  for (const [lng, lat] of [[-97.5164, 35.4676], [-106.65, 35.08], [-93.75, 32.51], [-74, 40], [NaN, 29]]) assert.equal(isTexasLocation(lng, lat), false);
});

test("server rebuilds classification and rejects malformed or out-of-state payloads", () => {
  const valid = validateSubmission({ ...payload(), status: "approved", flags: [], urgency: "low" });
  assert.ok(valid); assert.equal(valid.urgency, "severe"); assert.equal("status" in valid, false);
  for (const body of [null, [], { ...payload(), latitude: null }, { ...payload(), longitude: "-98" },
    { ...payload(), latitude: 35.4676, longitude: -97.5164 }, { ...payload(), description: "short" },
    { ...payload(), severity: "urgent" }, { ...payload(), category: "invented" },
    { ...payload(), submissionId: "anything" }, { ...payload(), locationSource: "invented" }]) assert.equal(validateSubmission(body), null);
});

test("content review flags links, markup, contact details and repeated characters", () => {
  assert.deepEqual(contentFlags("Road flooded near downtown San Antonio."), []);
  assert.deepEqual(contentFlags('Call 210-555-0123 or a@example.com. https://spam.test <script>x</script> aaaaaaaaaaaaaaa'),
    ["external_link", "markup", "personal_contact", "repeated_content"]);
});

test("bounding boxes reject empty, inverted, nonfinite and unbounded coordinates", () => {
  assert.deepEqual(parseReportBounds(null), [-106.7, 25.8, -93.5, 36.6]);
  assert.deepEqual(parseReportBounds("-99,28,-98,30"), [-99, 28, -98, 30]);
  for (const value of ["", ",,,", "-99,30,-98,28", "-180,-90,180,90", "NaN,28,-98,30", "1,2,3"]) assert.equal(parseReportBounds(value), null);
});

test("submission gateway uses hashed IP and a restricted RPC, never a service key", async () => {
  configure();
  const fetch = mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.p_payload.urgency, "severe"); assert.equal(body.p_payload.status, undefined);
    assert.match(body.p_ip_hash, /^[0-9a-f]{64}$/); assert.notEqual(body.p_ip_hash, "203.0.113.10");
    assert.equal(new Headers(init?.headers).get("apikey"), "sb_publishable_test");
    return Response.json({ id: "saved-id", status: "pending" });
  });
  const response = await POST(request(payload()));
  assert.equal(response.status, 201); assert.equal((await response.json()).status, "pending");
  assert.equal(fetch.mock.calls.length, 1);
});

test("cross-origin and invalid submissions never reach storage", async () => {
  configure(); const fetch = mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network"); });
  assert.equal((await POST(request(payload(), { origin: "https://attacker.test" }))).status, 403);
  assert.equal((await POST(request({ ...payload(), description: "short" }))).status, 400);
  assert.equal(fetch.mock.calls.length, 0);
});

test("production fails closed without trusted ingress identity or shared secret", async () => {
  configure(); Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.REPORT_CLIENT_IP_HEADER;
  assert.throws(() => submissionIdentity(request(payload())), ReportError);
  delete process.env.COMMUNITY_REPORT_SECRET;
  assert.equal((await POST(request(payload()))).status, 503);
});

test("oversized and malformed JSON are rejected", async () => {
  await assert.rejects(readReportJson(request({ text: "x".repeat(9000) })), (e: unknown) => e instanceof ReportError && e.status === 413);
  await assert.rejects(readReportJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })),
    (e: unknown) => e instanceof ReportError && e.status === 400);
});

test("all report endpoints require a JSON object, not an array or primitive", async () => {
  configure();
  const fetch = mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network"); });
  for (const value of [null, [], ["gps"], "text", 42, true]) {
    await assert.rejects(readReportJson(request(value)),
      (error: unknown) => error instanceof ReportError && error.status === 400);
    assert.equal((await POST(request(value))).status, 400);
    assert.equal((await login(request(value))).status, 400);
    assert.equal((await review(request(value, { method: "PATCH", cookie: "lss_moderator=token" }))).status, 400);
  }
  assert.equal(fetch.mock.calls.length, 0);
});

test("database rate limits and idempotency conflicts map to useful responses", async () => {
  configure();
  mock.method(globalThis, "fetch", async () => Response.json({ code: "PT429" }, { status: 429 }));
  const limited = await POST(request(payload()));
  assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "3600");
  mock.restoreAll(); mock.method(globalThis, "fetch", async () => Response.json({ code: "PT409" }, { status: 409 }));
  assert.equal((await POST(request(payload()))).status, 409);
});

test("public feed calls approved-only RPC with validated bounds and hides database errors", async () => {
  configure();
  mock.method(globalThis, "fetch", async (url: unknown) => {
    assert.ok(String(url).endsWith("/read_community_reports"));
    return Response.json({ type: "FeatureCollection", features: [] });
  });
  assert.equal((await GET(new Request("http://localhost/api/community-reports"))).status, 200);
  assert.equal((await GET(new Request("http://localhost/api/community-reports?bbox=,,,"))).status, 400);
  mock.restoreAll(); mock.method(globalThis, "fetch", async () => Response.json({ message: "private database details" }, { status: 500 }));
  const failed = await GET(new Request("http://localhost/api/community-reports"));
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("private database details"));
});

test("queue and decision require session; SQL authorization failures cannot be bypassed", async () => {
  configure();
  assert.equal((await queue(new NextRequest("http://localhost/api/moderation/reports"))).status, 401);
  mock.method(globalThis, "fetch", async () => Response.json({ code: "42501" }, { status: 403 }));
  assert.equal((await queue(new NextRequest("http://localhost/api/moderation/reports", { headers: { cookie: "lss_moderator=not-an-admin" } }))).status, 403);
  const decision = { id: payload().submissionId, expectedStatus: "pending", status: "approved", notes: "Reviewed location." };
  assert.equal((await review(request(decision, { method: "PATCH" }))).status, 401);
  assert.equal((await review(request({ ...decision, notes: "" }, { method: "PATCH", cookie: "lss_moderator=token" }))).status, 400);
});

test("moderation forwards the user token and expected status to the database", async () => {
  configure();
  mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer user-token");
    assert.equal(JSON.parse(String(init?.body)).p_expected_status, "pending");
    return Response.json({ status: "approved" });
  });
  const response = await review(request({ id: payload().submissionId, expectedStatus: "pending", status: "approved", notes: "Reviewed location." }, { method: "PATCH", cookie: "lss_moderator=user-token" }));
  assert.equal(response.status, 200);
});

test("login checks moderator allowlist before setting an HttpOnly scoped cookie", async () => {
  configure(); let calls = 0;
  mock.method(globalThis, "fetch", async () => ++calls === 1 ? Response.json({ access_token: "user-token", expires_in: 3600 }) : Response.json({ reports: [] }));
  const result = await login(request({ email: "moderator@example.test", password: "not-a-real-password" }));
  assert.equal(result.status, 200); assert.equal(calls, 2);
  assert.match(result.headers.get("set-cookie") || "", /HttpOnly/i);
  assert.match(result.headers.get("set-cookie") || "", /Path=\/api\/moderation/i);
  assert.ok(!(await result.text()).includes("user-token"));
  const signedOut = await logout(request({}, { method: "DELETE" }));
  assert.match(signedOut.headers.get("set-cookie") || "", /Max-Age=0/i);
});

test("non-moderator login receives no session cookie", async () => {
  configure(); let calls = 0;
  mock.method(globalThis, "fetch", async () => ++calls === 1 ? Response.json({ access_token: "ordinary-user", expires_in: 3600 }) : Response.json({ code: "42501" }, { status: 403 }));
  const result = await login(request({ email: "user@example.test", password: "not-a-real-password" }));
  assert.equal(result.status, 403); assert.equal(result.headers.get("set-cookie"), null);
});

test("public map adapter keeps community identity separate from Bluesky and verification", () => {
  const report = normalizeCommunityReport({ type: "Feature", geometry: { type: "Point", coordinates: [-98.4936, 29.4241] },
    properties: { id: "community-test", report_id: "test", category: "road_hazard", urgency: "severe", description: "Road flooding reported downtown.",
      created_at: "2026-11-02T12:00:00Z", expires_at: "2026-11-03T12:00:00Z", source_classification: { category: "road_hazard", urgency: "high" } } });
  assert.equal(report.source, "community"); assert.equal(report.verified, false);
  assert.equal(report.sourceClassification?.urgency, "high");
  assert.ok(report.instruction?.includes("not been independently verified"));
});
