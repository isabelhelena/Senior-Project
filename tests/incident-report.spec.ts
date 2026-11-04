import { test, expect, type Page } from "@playwright/test";

async function fillReport(page: Page) {
  await page.locator("#category").selectOption("road_hazard");
  await page.locator("#severity").selectOption("high");
  await page.locator("#description").fill("Flash flooding on Highway 281 North, right lane impassable.");
  await page.locator("#latitude").fill("29.4241");
  await page.locator("#longitude").fill("-98.4936");
}

test.describe("Community report submission", () => {
  test.use({ geolocation: { latitude: 29.4241, longitude: -98.4936 }, permissions: ["geolocation"] });
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/geocode?*", (route) => route.fulfill({ json: { city: "San Antonio", state: "TX", lat: 29.4241, lng: -98.4936 } }));
    await page.goto("/report");
  });

  test("prefills coordinates and rejects missing fields", async ({ page }) => {
    await expect(page.locator("#latitude")).toHaveValue("29.4241");
    await expect(page.locator("#longitude")).toHaveValue("-98.4936");
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Select an incident category.");
    await expect(page.locator("form").getByRole("alert")).toContainText("Select a severity level.");
  });

  test("displays validation errors when submitting an empty form", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    // Wait for initial GPS settlement before clearing
    await expect(page.locator("#latitude")).toHaveValue("29.4241", { timeout: 10_000 });

    // Clear auto-populated fields to test empty submission
    await page.locator("#latitude").clear();
    await page.locator("#longitude").clear();

    const validateBtn = page.getByRole("button", { name: /validate report/i });
    await expect(validateBtn).toBeVisible({ timeout: 10_000 });
    await validateBtn.click();

    // Verify alert summary banner
    const alertBanner = page.locator("div[role='alert']").filter({
      hasText: "Please correct the following fields:",
    });
    await expect(alertBanner).toBeVisible();

    // Check specific error message elements (targeted by ID)
    await expect(page.locator("#category-error")).toHaveText("Select an incident category.");
    await expect(page.locator("#severity-error")).toHaveText("Select a severity level.");
  });

  test("validates description minimum character length", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    // Wait for initial GPS settlement
    await expect(page.locator("#latitude")).toHaveValue("29.4241", { timeout: 10_000 });

    // Fill category and severity with valid schema options
    await page.locator("#category").selectOption("flood");
    await page.locator("#severity").selectOption("high");

    // Fill description with only 11 characters (minimum is 20)
    await page.locator("#description").fill("Rainy flood");

    const validateBtn = page.getByRole("button", { name: /validate report/i });
    await validateBtn.click();

    // Check for character length validation error
    await expect(page.locator("#description-error")).toContainText(
      "Use at least 20 characters so responders have enough detail."
    );
  });

  test("rejects invalid coordinate bounds", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    // Wait for initial GPS settlement
    await expect(page.locator("#latitude")).toHaveValue("29.4241", { timeout: 10_000 });

    await page.locator("#category").selectOption("other_disaster_hazard");
    await page.locator("#severity").selectOption("critical");
    await page.locator("#description").fill("High wind warning and damaged road signs throughout area.");

    // Enter out-of-bounds coordinates (valid is -90 to 90 and -180 to 180)
    await page.locator("#latitude").fill("95.0");
    await page.locator("#longitude").fill("-200.0");

    const validateBtn = page.getByRole("button", { name: /validate report/i });
    await validateBtn.click();

    await expect(page.locator("#latitude-error")).toHaveText("Enter a latitude from -90 to 90.");
    await expect(page.locator("#longitude-error")).toHaveText("Enter a longitude from -180 to 180.");
  });

  test("successfully validates and processes a complete incident report", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    // Wait for initial GPS settlement
    await expect(page.locator("#latitude")).toHaveValue("29.4241", { timeout: 10_000 });

    await page.locator("#category").selectOption("road_hazard");
    await page.locator("#severity").selectOption("moderate");
    await page.locator("#description").fill("Flash flooding on Highway 281 North, right lane impassable.");

    const validateBtn = page.getByRole("button", { name: /validate report/i });
    await validateBtn.click();

    // Verify submission confirmation message
    const successMessage = page.getByText(/Report validated/i);
    await expect(successMessage).toBeVisible({ timeout: 10_000 });
  });
});
