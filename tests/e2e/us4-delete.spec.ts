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
