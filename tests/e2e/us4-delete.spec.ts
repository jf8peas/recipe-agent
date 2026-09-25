import { test, expect } from "@playwright/test";
import { startSession, expectNoA11yViolations } from "./helpers";

test("US4 delete: deleting a session removes it from the list and from /mine", async ({ page, request }) => {
  await startSession(page, ["2 eggs"]);
  const clientId = await page.evaluate(() => localStorage.getItem("recipe-agent.clientId"));
  const sessionId = await page.evaluate(() => localStorage.getItem("recipe-agent.currentSessionId"));
  expect(clientId).toBeTruthy();
  expect(sessionId).toBeTruthy();

  await page.evaluate(() => localStorage.removeItem("recipe-agent.currentSessionId"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: /^Delete session/ }).first().click();
  await expect(page.getByText("No sessions yet.")).toBeVisible();

  const res = await request.get("/api/recipe/mine", { headers: { "X-Client-Id": clientId! } });
  expect(res.ok()).toBe(true);
  const json = await res.json();
  expect(json.sessions.some((s: { sessionId: string }) => s.sessionId === sessionId)).toBe(false);
});

test("US4 delete: the delete button disables itself and shows a busy state while the request is in flight", async ({
  page,
}) => {
  await startSession(page, ["2 eggs"]);
  await page.evaluate(() => localStorage.removeItem("recipe-agent.currentSessionId"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();

  const deleteButton = page.getByRole("button", { name: /^Delete session/ }).first();
  const openButton = page.getByRole("button").filter({ hasText: "Untitled session" }).first();
  await expect(deleteButton).toBeVisible();

  // Artificially slow the delete request so the in-flight state is actually
  // observable instead of racing past it (same pattern used for "Generate
  // photo"'s own busy-state test).
  await page.route("**/api/recipe/*/delete", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await deleteButton.click();

  const busyButton = page.getByRole("button", { name: /^Deleting Delete session/ });
  await expect(busyButton).toBeVisible();
  await expect(busyButton).toBeDisabled();
  await expect(openButton).toBeDisabled();

  // Once the response lands, the row is gone entirely rather than reverting
  // to a stuck busy state.
  await expect(page.getByText("No sessions yet.")).toBeVisible();
});

test("US4 delete: two different sessions can be deleted at the same time, each independently", async ({ page }) => {
  await startSession(page, ["2 eggs"]);
  await page.getByRole("button", { name: "Back to your sessions" }).click();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();

  await page.getByRole("button", { name: "Start a new session" }).click();
  await page.getByLabel("Ingredients (one per line)").fill("3 eggs");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Step \(/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to your sessions" }).click();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();

  // Scoped to each row's own `<li>` rather than a single shared locator —
  // clicking row 0's delete button renames ITS accessible name to
  // "Deleting Delete session…", which would otherwise shift what a
  // re-evaluated `nth(1)` on a page-wide "Delete session" locator points at.
  const rows = page.locator("li");
  await expect(rows).toHaveCount(2);
  const deleteButton0 = rows.nth(0).getByRole("button", { name: /^Delete session/ });
  const deleteButton1 = rows.nth(1).getByRole("button", { name: /^Delete session/ });

  // Slow both delete requests so the two in-flight windows actually overlap.
  await page.route("**/api/recipe/*/delete", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await deleteButton0.click();
  await deleteButton1.click();

  // Before this fix, a single `deletingSessionId` meant the second click
  // overwrote the first's busy state — asserting both rows read as busy at
  // once is exactly the case that broke.
  const busyButtons = page.getByRole("button", { name: /^Deleting Delete session/ });
  await expect(busyButtons).toHaveCount(2);

  // Both resolve, and both rows are gone — neither one got stuck (the
  // second's completion incorrectly clearing the first's own busy flag) nor
  // silently skipped (the first's click overwriting the id the second
  // needed to track itself by).
  await expect(page.getByText("No sessions yet.")).toBeVisible();
});
