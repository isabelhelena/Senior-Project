import { test, expect } from "@playwright/test";

test.describe("WeatherSummaryCard and Weather Overlays", () => {
  test.use({
    geolocation: { latitude: 29.3388, longitude: -98.5362 },
    permissions: ["geolocation"],
  });

  const mockWeatherData = {
    station: "KSAT",
    stationName: "San Antonio International Airport",
    condition: "Partly Cloudy",
    tempF: 78,
    windMph: 12,
    windDirection: 160,
    humidity: 55,
    timestamp: "2026-10-19T15:00:00Z",
  };

  test("renders weather metrics successfully when API returns data", async ({ page }) => {
    await page.route("**/api/weather-current*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockWeatherData),
      });
    });

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    // Weather Card header & location label
    const weatherHeading = page.getByText("Current weather", { exact: true });
    await expect(weatherHeading).toBeVisible();

    const stationLabel = page.getByText("San Antonio International Airport");
    await expect(stationLabel).toBeVisible();

    // Condition badge
    const conditionBadge = page.getByText("Partly Cloudy");
    await expect(conditionBadge).toBeVisible();

    // Temperature metric (WeatherSummaryCard renders "78°F")
    const temperature = page.getByText("78°F");
    await expect(temperature).toBeVisible();

    // Detailed metrics: Wind, Humidity, Heading
    await expect(page.getByText("12 mph")).toBeVisible();
    await expect(page.getByText("55%")).toBeVisible();
    await expect(page.getByText("160°")).toBeVisible();
  });

  test("displays graceful error state when weather API fails", async ({ page }) => {
    await page.route("**/api/weather-current*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Weather station service unavailable" }),
      });
    });

    await page.goto("/test-feed", { waitUntil: "domcontentloaded" });

    const errorMessage = page.getByText(
      "Current weather is temporarily unavailable. Please try again soon."
    );
    await expect(errorMessage).toBeVisible({ timeout: 10_000 });
  });

  test("displays loading spinner while fetching weather data", async ({ page }) => {
    await page.route("**/api/weather-current*", async (route) => {
      // Intentionally delay the response to verify loading state
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockWeatherData),
      });
    });

    await page.goto("/test-feed", { waitUntil: "commit" });

    const loadingText = page.getByText("Checking current weather…");
    await expect(loadingText).toBeVisible({ timeout: 5_000 });

    // Eventually resolves to weather data
    await expect(page.getByText("78°F")).toBeVisible({ timeout: 10_000 });
  });

  test("renders compact weather overlay on the map view", async ({ page }) => {
    await page.route("**/api/weather-current*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockWeatherData),
      });
    });

    await page.goto("/test-map", { waitUntil: "domcontentloaded" });

    // Compact weather overlay renders rounded degrees (78°) and condition
    await expect(page.getByText("Partly Cloudy")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("78°")).toBeVisible();
  });
});
