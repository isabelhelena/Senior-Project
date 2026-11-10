import { test, expect } from "@playwright/test";

test.describe("Feed Diagnostics Page (/test-feed)", () => {
  test.use({
    geolocation: { latitude: 29.4241, longitude: -98.4936 },
    permissions: ["geolocation"],
  });

  test("renders diagnostics page header and inspection tabs", async ({ page }) => {
    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Verify page title
    await expect(page.getByText("Phase 2 Ingestion Diagnostics")).toBeVisible();

    // Verify Inspector tabs
    const nwsTab = page.getByRole("tab", { name: "Stored NWS Feature" });
    const txdotTab = page.getByRole("tab", { name: "Stored TxDOT Feature" });

    await expect(nwsTab).toBeVisible();
    await expect(txdotTab).toBeVisible();

    // Switch tabs and verify aria-selected
    await txdotTab.click();
    await expect(txdotTab).toHaveAttribute("aria-selected", "true");

    await nwsTab.click();
    await expect(nwsTab).toHaveAttribute("aria-selected", "true");
  });

  test("probes stored NWS alerts successfully when mocked", async ({ page }) => {
    await page.route("**/api/alerts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "nws-test-1",
              properties: {
                event: "Severe Thunderstorm Warning",
                severity: "Severe",
                headline: "Severe storm approaching Bexar County",
              },
              geometry: null,
            },
          ],
        }),
      });
    });

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Wait for initial hydration
    await expect(page.getByText("Phase 2 Ingestion Diagnostics")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Current Location")).toBeVisible({ timeout: 10_000 });

    // Click Read Stored NWS Alerts
    const readNwsBtn = page.getByRole("button", { name: /read stored nws alerts/i });
    await readNwsBtn.click();

    // Verify connected status badge appears
    await expect(page.getByText("Connected").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("1 active alerts")).toBeVisible();
  });

  test("probes stored TxDOT road conditions successfully when mocked", async ({ page }) => {
    await page.route("**/api/road-conditions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "txdot-test-1",
              properties: {
                headline: "I-35 Northbound lane closure",
              },
              geometry: null,
            },
            {
              type: "Feature",
              id: "txdot-test-2",
              properties: {
                headline: "Loop 1604 construction delay",
              },
              geometry: null,
            },
          ],
        }),
      });
    });

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Wait for initial hydration
    await expect(page.getByText("Phase 2 Ingestion Diagnostics")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Current Location")).toBeVisible({ timeout: 10_000 });

    // Click Read Stored TxDOT Conditions
    const readTxdotBtn = page.getByRole("button", { name: /read stored txdot conditions/i });
    await readTxdotBtn.click();

    // Verify connected badge and count
    await expect(page.getByText("Connected").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("2 features")).toBeVisible();
  });
});
