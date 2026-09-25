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
