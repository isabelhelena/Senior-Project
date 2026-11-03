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

  test("validates description length and actual Texas coverage before sending", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/community-reports", (route) => { requests++; return route.fulfill({ json: { id: "unexpected" } }); });
    await fillReport(page);
    await page.locator("#description").fill("Rainy");
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Use at least 20 characters");
    await page.locator("#description").fill("Flash flooding is blocking the main road.");
    await page.locator("#latitude").fill("35.4676");
    await page.locator("#longitude").fill("-97.5164");
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Choose a location within Texas.");
    expect(requests).toBe(0);
  });

  test("shows a saved pending receipt and sends raw choices", async ({ page }) => {
    await page.route("**/api/community-reports", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({ category: "road_hazard", severity: "high", latitude: 29.4241, longitude: -98.4936 });
      await route.fulfill({ status: 201, json: { id: "saved-report", status: "pending" } });
    });
    await fillReport(page);
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText(/Report received \(saved-report\)/)).toBeVisible();
    await expect(page.getByText(/only after moderator approval/)).toBeVisible();
  });

  test("retries failures with the same key and changes the key after an edit", async ({ page }) => {
    const keys: string[] = [];
    await page.route("**/api/community-reports", async (route) => {
      keys.push(route.request().postDataJSON().submissionId);
      await route.fulfill(keys.length === 1 ? { status: 503, json: { error: "Storage unavailable. Please retry." } } : { status: 201, json: { id: "saved-report", status: "pending" } });
    });
    await fillReport(page);
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText("Storage unavailable. Please retry.")).toBeVisible();
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText(/Report received/)).toBeVisible();
    expect(keys[0]).toBe(keys[1]);
    await page.locator("#description").fill("Another road is impassable near the town center.");
    await page.getByRole("button", { name: "Submit report" }).click();
    await expect(page.getByText(/Report received/)).toBeVisible();
    expect(keys[2]).not.toBe(keys[0]);
  });
});
