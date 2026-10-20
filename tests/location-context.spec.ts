import { test, expect } from "@playwright/test";

test.describe("LocationContext and Geolocation Flow", () => {
  test("initializes with GPS coordinates when geolocation permission is granted", async ({ page, context }) => {
    // Set custom geolocation to Houston, TX
    await context.setGeolocation({ latitude: 29.7604, longitude: -95.3698 });
    await context.grantPermissions(["geolocation"]);

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Verify location city is marked as Current Location
    await expect(page.getByText("Current Location")).toBeVisible({ timeout: 10_000 });

    // Verify source badge indicates GPS (distinguish from GPS reset button)
    const gpsBadge = page.locator("[data-slot='badge']").filter({ hasText: /^gps$/i });
    await expect(gpsBadge).toBeVisible();

    // Verify coordinates match formatted Houston coordinates
    await expect(page.getByText("29.7604, -95.3698")).toBeVisible();
  });

  test("falls back to default San Antonio location when geolocation is denied", async ({ page, context }) => {
    await context.clearPermissions();

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Verify fallback city is displayed
    await expect(page.getByText("San Antonio (Default)")).toBeVisible({ timeout: 10_000 });

    // Verify fallback badge
    const fallbackBadge = page.locator("[data-slot='badge']").filter({ hasText: /^fallback$/i });
    await expect(fallbackBadge).toBeVisible();

    // Verify fallback coordinates
    await expect(page.getByText("29.4241, -98.4936")).toBeVisible();
  });

  test("geocodes a Texas 5-digit ZIP code and updates active coordinates", async ({ page, context }) => {
    await context.setGeolocation({ latitude: 29.4241, longitude: -98.4936 });
    await context.grantPermissions(["geolocation"]);

    // Intercept geocoding endpoint using regex to avoid glob query parameter issues
    await page.route(/\/api\/geocode\?.*zip=78701/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          city: "Austin",
          state: "TX",
          lat: 30.2711,
          lng: -97.7437,
        }),
      });
    });

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Wait for initial GPS settlement before submitting custom ZIP
    await expect(page.getByText("Current Location")).toBeVisible({ timeout: 10_000 });

    // Fill in ZIP input and submit
    const zipInput = page.getByPlaceholder("Enter 5-digit ZIP");
    await zipInput.fill("78701");
    await page.getByRole("button", { name: /go/i }).click();

    // Verify location changes to Austin, TX
    await expect(page.getByText("Austin, TX")).toBeVisible({ timeout: 10_000 });

    // Verify badge updates to ZIP
    const zipBadge = page.locator("[data-slot='badge']").filter({ hasText: /^zip$/i });
    await expect(zipBadge).toBeVisible();

    // Verify coordinates updated to Austin
    await expect(page.getByText("30.2711, -97.7437")).toBeVisible();
  });

  test("resets to GPS location when clicking the GPS button after ZIP geocoding", async ({ page, context }) => {
    const dallasCoords = { latitude: 32.7767, longitude: -96.7970 };
    await context.setGeolocation(dallasCoords);
    await context.grantPermissions(["geolocation"]);

    await page.route(/\/api\/geocode\?.*zip=78701/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          city: "Austin",
          state: "TX",
          lat: 30.2711,
          lng: -97.7437,
        }),
      });
    });

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Initially GPS Dallas
    await expect(page.getByText("32.7767, -96.797")).toBeVisible({ timeout: 10_000 });

    // Switch to Austin via ZIP
    const zipInput = page.getByPlaceholder("Enter 5-digit ZIP");
    await zipInput.fill("78701");
    await page.getByRole("button", { name: /go/i }).click();
    await expect(page.getByText("Austin, TX")).toBeVisible({ timeout: 10_000 });

    // Click the GPS reset button
    const gpsButton = page.getByRole("button", { name: "GPS", exact: true });
    await gpsButton.click();

    // Verify coordinates reset back to GPS Dallas
    await expect(page.getByText("Current Location")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("32.7767, -96.797")).toBeVisible();
  });

  test("handles invalid ZIP code geocoding error gracefully", async ({ page, context }) => {
    await context.setGeolocation({ latitude: 29.4241, longitude: -98.4936 });
    await context.grantPermissions(["geolocation"]);

    await page.route(/\/api\/geocode\?.*zip=99999/, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "ZIP code not found" }),
      });
    });

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Wait for initial GPS settlement
    await expect(page.getByText("Current Location")).toBeVisible({ timeout: 10_000 });

    const zipInput = page.getByPlaceholder("Enter 5-digit ZIP");
    await zipInput.fill("99999");
    await page.getByRole("button", { name: /go/i }).click();

    // Verify the page doesn't crash and retains current valid state
    await expect(page.getByText("Current Location")).toBeVisible();
  });
});
