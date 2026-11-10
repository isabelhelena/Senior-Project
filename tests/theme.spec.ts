import { test, expect } from "@playwright/test";

test.describe("Theme Toggle Component", () => {
  test.use({
    geolocation: { latitude: 29.4241, longitude: -98.4936 },
    permissions: ["geolocation"],
  });

  test("toggles theme between light and dark modes", async ({ page }) => {
    await page.goto("/test-map", { waitUntil: "domcontentloaded" });

    // Locate the ThemeToggle button
    const themeBtn = page.getByRole("button", { name: "Toggle theme" });
    await expect(themeBtn).toBeVisible({ timeout: 10_000 });

    const html = page.locator("html");

    // Check initial state
    const initialIsDark = await html.evaluate((el) => el.classList.contains("dark"));

    // Toggle theme
    await themeBtn.click();

    if (initialIsDark) {
      await expect(html).not.toHaveClass(/dark/);
    } else {
      await expect(html).toHaveClass(/dark/);
    }

    // Toggle back
    await themeBtn.click();

    if (initialIsDark) {
      await expect(html).toHaveClass(/dark/);
    } else {
      await expect(html).not.toHaveClass(/dark/);
    }
  });
});
