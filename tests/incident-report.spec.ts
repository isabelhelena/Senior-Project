import { test, expect } from "@playwright/test";

test.describe("IncidentReportForm (/report)", () => {
  test.use({
    geolocation: { latitude: 29.4241, longitude: -98.4936 },
    permissions: ["geolocation"],
  });

  test("auto-populates latitude and longitude from active LocationContext", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    const latInput = page.locator("#latitude");
    const lngInput = page.locator("#longitude");

    // Expect coordinates to reflect active GPS location
    await expect(latInput).toHaveValue("29.4241", { timeout: 10_000 });
    await expect(lngInput).toHaveValue("-98.4936", { timeout: 10_000 });
  });

  test("displays validation errors when submitting an empty form", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    // Submit without filling category, severity, or description
    const validateBtn = page.getByRole("button", { name: /validate report/i });
    await expect(validateBtn).toBeVisible({ timeout: 10_000 });
    await validateBtn.click();

    // Verify alert banner is displayed
    const alertBanner = page.getByRole("alert");
    await expect(alertBanner).toBeVisible();
    await expect(alertBanner).toContainText("Please correct the following fields:");

    // Check specific error messages
    await expect(page.getByText("Select an incident category.")).toBeVisible();
    await expect(page.getByText("Select a severity level.")).toBeVisible();
  });

  test("validates description minimum character length", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    // Fill category and severity
    await page.locator("#category").selectOption("flood");
    await page.locator("#severity").selectOption("urgent");

    // Fill description with only 5 characters (minimum is 10)
    await page.locator("#description").fill("Rainy");

    const validateBtn = page.getByRole("button", { name: /validate report/i });
    await validateBtn.click();

    // Check for character length validation error
    await expect(
      page.getByText("Provide at least 10 characters describing the incident.")
    ).toBeVisible();
  });

  test("rejects coordinates located outside the state of Texas", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    await page.locator("#category").selectOption("tornado");
    await page.locator("#severity").selectOption("urgent");
    await page.locator("#description").fill("High wind warning and damaged road signs.");

    // Enter out-of-state coordinates (e.g., New York: 40.7128, -74.0060)
    await page.locator("#latitude").fill("40.7128");
    await page.locator("#longitude").fill("-74.0060");

    const validateBtn = page.getByRole("button", { name: /validate report/i });
    await validateBtn.click();

    await expect(
      page.getByText("Latitude must fall within the Texas coverage area.")
    ).toBeVisible();
    await expect(
      page.getByText("Longitude must fall within the Texas coverage area.")
    ).toBeVisible();
  });

  test("successfully validates and processes a complete incident report", async ({ page }) => {
    await page.goto("/report", { waitUntil: "domcontentloaded" });

    await page.locator("#category").selectOption("road_hazard");
    await page.locator("#severity").selectOption("moderate");
    await page.locator("#description").fill("Flash flooding on Highway 281 North, right lane impassable.");

    // Coordinates are valid Texas coordinates
    await page.locator("#latitude").fill("29.4241");
    await page.locator("#longitude").fill("-98.4936");

    const validateBtn = page.getByRole("button", { name: /validate report/i });
    await validateBtn.click();

    // Verify submission confirmation message
    const successMessage = page.getByText(/Report validated/i);
    await expect(successMessage).toBeVisible({ timeout: 10_000 });
  });
});
