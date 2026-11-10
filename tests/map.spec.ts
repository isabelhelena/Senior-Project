import { test, expect } from "@playwright/test";

test.use({
  geolocation: { latitude: 29.3388, longitude: -98.5362 },
  permissions: ["geolocation"],
});

test("detects MapLibre canvas and readiness state", async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto("/test-map", { waitUntil: "domcontentloaded" });

  // 1. Locate the canvas element
  const mapCanvas = page.locator(".maplibregl-canvas");
  await expect(mapCanvas).toBeAttached({ timeout: 20_000 });

  // 2. Locate the ready state container
  const mapContainer = page.locator("[data-map-loaded]");
  await expect(mapContainer).toHaveAttribute("data-map-loaded", "true", {
    timeout: 30_000,
  });
});

test("renders map controls and layer dock toggles", async ({ page }) => {
  await page.goto("/test-map", { waitUntil: "domcontentloaded" });

  // Verify Reset View / Show all of Texas control button
  const resetBtn = page.getByRole("button", { name: "Show all of Texas" });
  await expect(resetBtn).toBeVisible({ timeout: 15_000 });

  // Verify Refresh control button
  const refreshBtn = page.getByRole("button", { name: "Refresh map information" });
  await expect(refreshBtn).toBeVisible();

  // Verify Layer dock section
  const layerSection = page.locator("section[aria-label='Disaster information map']");
  await expect(layerSection).toBeVisible();

  // Verify Report incident link
  const reportLink = page.getByRole("link", { name: /report/i });
  await expect(reportLink).toBeVisible();
  await expect(reportLink).toHaveAttribute("href", "/report");
});
