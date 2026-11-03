import { test, expect } from "@playwright/test";

test("approved submissions appear separately from intentional Bluesky fixtures", async ({ page }) => {
  await page.route("**/api/alerts", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [], stale: false } }));
  await page.route("**/api/road-conditions", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [], stale: false } }));
  await page.route("**/api/community-reports", (route) => route.fulfill({ json: {
    type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-98.4936, 29.4241] },
      properties: { id: "community-approved-fixture", report_id: "approved-fixture", category: "road_hazard", urgency: "severe",
        description: "Approved submission: water is blocking the downtown road.", created_at: "2026-11-02T12:00:00Z", expires_at: "2099-11-03T12:00:00Z",
        source_classification: { category: "road_hazard", urgency: "high" } } }],
  } }));
  await page.route("**/api/emergency-resources?*", (route) => route.fulfill({ json: { resources: [] } }));
  await page.route("**/api/weather-current?*", (route) => route.fulfill({ status: 503, json: { error: "Offline test" } }));
  await page.route("**/api/geocode?*", (route) => route.fulfill({ json: { city: "San Antonio", state: "TX", lat: 29.4241, lng: -98.4936 } }));
  await page.route("**/style.json*", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e5e7eb" } }] } }));
  await page.goto("/test-map");
  await page.getByRole("navigation", { name: "Map information" }).getByRole("button", { name: "Community", exact: true }).click();
  const panel = page.locator("#map-information-panel");
  await expect(panel.getByText("Reviewed submissions", { exact: true })).toBeVisible();
  await expect(panel.getByText("Approved submission: water is blocking the downtown road.")).toBeVisible();
  await expect(panel.getByText("Bluesky demo reports", { exact: true })).toBeVisible();
  await panel.getByRole("article").getByRole("button", { name: "Show on map" }).click();
  const drawer = page.getByRole("complementary", { name: "Alert details" });
  await expect(drawer.getByText("Reviewed community submission", { exact: true })).toBeVisible();
  await expect(drawer.getByText(/not been independently verified/)).toBeVisible();
});
