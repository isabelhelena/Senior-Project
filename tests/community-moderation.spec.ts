import { test, expect } from "@playwright/test";

function reportFixture(id: string, status = "pending") {
  return {
    id, status, category: "road_hazard", urgency: "severe",
    description: `Report ${id}: flooding has blocked the right lane.`,
    source_classification: { category: "road_hazard" }, flags: [],
    latitude: 29.4241, longitude: -98.4936,
    created_at: "2026-11-02T12:00:00Z", expires_at: "2099-11-03T12:00:00Z", review_notes: null,
  };
}

test("moderator signs in, reviews a report, and signs out", async ({ page }) => {
  let signedIn = false;
  let approved = false;
  await page.route("**/api/moderation/session", async (route) => {
    signedIn = route.request().method() === "POST";
    await route.fulfill({ json: { signedIn } });
  });
  await page.route("**/api/moderation/reports**", async (route) => {
    if (!signedIn) return route.fulfill({ status: 401, json: { error: "Please sign in as a moderator." } });
    if (route.request().method() === "PATCH") {
      expect(route.request().postDataJSON()).toMatchObject({ id: "fixture-report", status: "approved", expectedStatus: "pending", notes: "Location checked; suitable for publication." });
      approved = true;
      return route.fulfill({ json: { status: "approved" } });
    }
    return route.fulfill({ json: { reports: approved ? [] : [{ id: "fixture-report", category: "road_hazard", urgency: "severe", description: "Flooding has blocked the right lane near downtown.",
      status: "pending", source_classification: { category: "road_hazard" }, flags: ["external_link"], latitude: 29.4241, longitude: -98.4936,
      created_at: "2026-11-02T12:00:00Z", expires_at: "2099-11-03T12:00:00Z", review_notes: null }] } });
  });
  await page.goto("/moderation");
  await page.getByLabel("Email", { exact: true }).fill("moderator@example.test");
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Flags: external_link")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await page.getByLabel("Review note for fixture-report").fill("Location checked; suitable for publication.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Report approved.", { exact: true })).toBeVisible();
  await expect(page.getByText("No pending reports on this page.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("queue pagination, filters, and refresh load the requested reports", async ({ page }) => {
  await page.route("**/api/moderation/reports**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const status = params.get("status") || "pending";
    const reportPage = Number(params.get("page"));
    const reports = status === "pending" && reportPage === 0
      ? Array.from({ length: 50 }, (_, index) => reportFixture(`first-page-${index}`))
      : [reportFixture(`${status}-page-${reportPage}`, status)];
    return route.fulfill({ json: { reports } });
  });
  await page.goto("/moderation");
  await expect(page.getByRole("article")).toHaveCount(50);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("pending-page-1");
  await page.getByLabel("Report status").selectOption("rejected");
  await expect(page.getByRole("article")).toContainText("rejected-page-0");
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  await expect(page.getByRole("article")).toContainText("rejected-page-0");
});

test("failed refresh stays visible and an expired session clears the queue", async ({ page }) => {
  let approved = false;
  let failedRefresh = false;
  await page.route("**/api/moderation/reports**", (route) => {
    if (route.request().method() === "PATCH") {
      approved = true;
      return route.fulfill({ json: { status: "approved" } });
    }
    if (!approved) return route.fulfill({ json: { reports: [reportFixture("review-report")] } });
    if (!failedRefresh) {
      failedRefresh = true;
      return route.fulfill({ status: 503, json: { error: "Queue refresh failed. Please retry." } });
    }
    return route.fulfill({ status: 401, json: { error: "Your session expired. Please sign in again." } });
  });
  await page.goto("/moderation");
  await page.getByLabel("Review note for review-report").fill("Location checked for publication.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Queue refresh failed. Please retry.");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
});
