import { test, expect } from "@playwright/test";

test.describe("Hazard Details Drawer and Alert Feed Table", () => {
  test.use({
    geolocation: { latitude: 29.4241, longitude: -98.4936 },
    permissions: ["geolocation"],
  });

  const mockNwsData = {
    type: "FeatureCollection",
    stale: false,
    features: [
      {
        type: "Feature",
        id: "nws-demo-alert-1",
        properties: {
          id: "nws-demo-alert-1",
          event: "Flash Flood Warning",
          severity: "Severe",
          urgency: "Immediate",
          certainty: "Observed",
          headline: "Flash Flood Warning issued for Bexar County",
          description: "Rapidly rising water impacting low-water crossings.",
          instruction: "Turn around, don't drown when encountering flooded roads.",
          areaDesc: "Bexar, TX",
          effective: "2026-10-27T12:00:00Z",
          expires: "2026-10-27T18:00:00Z",
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-98.60, 29.35],
              [-98.40, 29.35],
              [-98.40, 29.55],
              [-98.60, 29.55],
              [-98.60, 29.35],
            ],
          ],
        },
      },
    ],
  };

  test.beforeEach(async ({ page }) => {
    // Intercept alerts, roads, and emergency resources
    await page.route("**/api/alerts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockNwsData),
      });
    });

    await page.route("**/api/road-conditions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ type: "FeatureCollection", stale: false, features: [] }),
      });
    });

    await page.route("**/api/emergency-resources*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ resources: [] }),
      });
    });
  });

  test("renders AlertFeedTable under Technical Details accordion", async ({ page }) => {
    await page.goto("/test-map", { waitUntil: "domcontentloaded" });

    // Ensure map container is ready
    await expect(page.locator("[data-map-loaded]")).toHaveAttribute("data-map-loaded", "true", {
      timeout: 30_000,
    });

    // Locate the 'Technical Details' accordion summary
    const techDetailsSummary = page.getByText("Technical Details");
    await expect(techDetailsSummary).toBeVisible();

    // Click to expand the accordion
    await techDetailsSummary.click();

    // Verify AlertFeedTable header and filter input are mounted
    await expect(page.getByText("Texas Telemetry Feed & Data Inspector")).toBeVisible({
      timeout: 10_000,
    });
    const filterInput = page.getByPlaceholder("Filter county, route, shelter, or alert...");
    await expect(filterInput).toBeVisible();

    // In the table card, eventType ("Flash Flood Warning") and areaDesc ("Bexar, TX") are displayed
    await expect(page.getByRole("heading", { name: "Flash Flood Warning" })).toBeVisible();
    await expect(page.getByText("Bexar, TX")).toBeVisible();
  });

  test("opens HazardDrawer when clicking an item in AlertFeedTable", async ({ page }) => {
    await page.goto("/test-map", { waitUntil: "domcontentloaded" });

    await expect(page.locator("[data-map-loaded]")).toHaveAttribute("data-map-loaded", "true", {
      timeout: 30_000,
    });

    // Expand Technical Details to access the table
    await page.getByText("Technical Details").click();

    // Click on the alert card in the table
    const alertCard = page.getByRole("heading", { name: "Flash Flood Warning" });
    await expect(alertCard).toBeVisible();
    await alertCard.click();

    // Verify HazardDrawer slides open (<aside aria-label="Alert details">)
    const drawer = page.locator("aside[aria-label='Alert details']");
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // Verify drawer displays official headline and instructions
    await expect(drawer.getByText("Flash Flood Warning issued for Bexar County")).toBeVisible();
    await expect(drawer.getByText("Turn around, don't drown")).toBeVisible();

    // Verify close button dismisses drawer
    const closeBtn = drawer.getByRole("button", { name: "Close alert details" });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });
});
