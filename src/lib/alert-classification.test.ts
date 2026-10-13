import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DISASTER_CATEGORIES, STORED_URGENCY_LEVELS } from "../types/hazard";
import { normalizeCategory, normalizeClassification, normalizeUrgency } from "./alert-classification";
import { normalizeNwsAlert, normalizeSocialAlert } from "./normalizers";
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES, validateIncidentReport } from "./report-validation";

test("canonical vocabulary matches the existing database enums", () => {
  const schema = readFileSync(new URL("../../schema.sql", import.meta.url), "utf8");
  for (const [name, values] of [["disaster_category", DISASTER_CATEGORIES], ["urgency_level", STORED_URGENCY_LEVELS]] as const) {
    const body = schema.match(new RegExp(`CREATE TYPE "public"\\."${name}" AS ENUM \\(([\\s\\S]*?)\\);`))?.[1];
    assert.ok(body, `Missing database enum ${name}`);
    assert.deepEqual([...body.matchAll(/'([^']+)'/g)].map((match) => match[1]), [...values]);
  }
});

test("canonical values pass through unchanged", () => {
  for (const category of DISASTER_CATEGORIES) assert.equal(normalizeCategory(category), category);
  for (const urgency of STORED_URGENCY_LEVELS) assert.equal(normalizeUrgency(urgency), urgency);
});

test("every Bluesky extraction value has a deliberate mapping", () => {
  const source = readFileSync(new URL("../../workers/bluesky/core.py", import.meta.url), "utf8");
  const categories = { flood: "flood", severe_weather: "other", wildfire: "other", power_outage: "power_outage", road_hazard: "road_hazard", shelter: "shelter", mutual_aid: "other" };
  const urgencies = { low: "low", moderate: "medium", critical: "critical" };
  for (const [name, expected, normalize] of [
    ["CATEGORIES", categories, normalizeCategory],
    ["URGENCIES", urgencies, normalizeUrgency],
  ] as const) {
    const declared = source.match(new RegExp(`^${name} = (\\[.*\\])$`, "m"))?.[1];
    assert.ok(declared);
    assert.deepEqual(JSON.parse(declared), Object.keys(expected));
    for (const [raw, canonical] of Object.entries(expected)) assert.equal(normalize(raw), canonical);
  }
});

test("source labels survive fallback and urgency conversion", () => {
  assert.deepEqual(normalizeClassification("wildfire", "moderate"), {
    category: "other", urgency: "medium",
    sourceClassification: { category: "wildfire", urgency: "moderate" },
  });
  assert.equal(normalizeCategory("water_relief_resource"), "other");
  assert.equal(normalizeCategory("mutual_aid"), "other");
  assert.equal(normalizeCategory("medical"), "other");
});

test("case and whitespace normalize; unknown urgency is never assumed low", () => {
  assert.equal(normalizeCategory(" FLOOD "), "flood");
  assert.equal(normalizeUrgency(" Moderate "), "medium");
  assert.equal(normalizeUrgency("HIGH"), "severe");
  for (const invalid of [null, undefined, "", "Immediate", "__proto__", 5, {}]) {
    assert.equal(normalizeCategory(invalid), "other");
    assert.equal(normalizeUrgency(invalid), "unknown");
  }
});

test("social adapter preserves identity, location, content, and source detail", () => {
  const input = { id: "one", blueskyUri: "at://example/post/one", summary: "Wildfire near town",
    coordinates: [-98, 29] as [number, number], createdAt: "2026-01-01T00:00:00Z",
    category: "wildfire", urgency: "moderate" };
  const normalized = normalizeSocialAlert(input);
  assert.equal(normalized.category, "other");
  assert.equal(normalized.urgency, "medium");
  assert.deepEqual(normalized.sourceClassification, { category: "wildfire", urgency: "moderate" });
  assert.equal(normalized.id, input.id);
  assert.equal(normalized.summary, input.summary);
  assert.deepEqual(normalized.coordinates, input.coordinates);
  assert.equal(input.urgency, "moderate");
});

test("NWS uses severity rather than its separate urgency field", () => {
  for (const [severity, expected] of Object.entries({ Extreme: "critical", Severe: "severe", Moderate: "medium", Minor: "low", Unknown: "unknown" })) {
    const properties = { id: "nws-one", event: "Flood Warning", severity, urgency: "Immediate" };
    const normalized = normalizeNwsAlert({ type: "Feature", geometry: null, properties });
    assert.equal(normalized.urgency, expected);
    assert.equal(normalized.category, "flood");
    assert.deepEqual(normalized.rawProperties, properties);
  }
});

test("every valid report option produces canonical fields and keeps original choices", () => {
  const categoryMap = { flood: "flood", shelter: "shelter", water_relief_resource: "other", medical: "other", road_hazard: "road_hazard", other_disaster_hazard: "other" };
  const urgencyMap = { low: "low", moderate: "medium", high: "severe", critical: "critical" };
  for (const { value: category } of INCIDENT_CATEGORIES) {
    for (const { value: severity } of INCIDENT_SEVERITIES) {
      const result = validateIncidentReport({ category, severity,
        description: "Road flooded near the town center.", latitude: "29", longitude: "-98" });
      assert.ok(result.success);
      assert.equal(result.data.category, categoryMap[category]);
      assert.equal(result.data.urgency, urgencyMap[severity]);
      assert.deepEqual(result.data.sourceClassification, { category, urgency: severity });
      assert.equal("severity" in result.data, false);
    }
  }
});

test("report validation still rejects unsupported choices", () => {
  const result = validateIncidentReport({ category: "invented", severity: "unknown",
    description: "Road flooded near the town center.", latitude: "29", longitude: "-98" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.errors.category);
    assert.ok(result.errors.severity);
  }
});
