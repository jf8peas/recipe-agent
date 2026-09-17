import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

test("US4 resume: closing and reopening the browser resumes the exact same session", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  await clickStep(page); // proposeDirections

  await expect(page.getByRole("heading", { name: "Dish directions" })).toBeVisible();
  await expect(page.getByText("Spinach Frittata")).toBeVisible();
  await expect(page.getByRole("button", { name: "Step (selectDirection)" })).toBeVisible();

  // Simulates closing and reopening the browser: a fresh load of `/`, same
  // localStorage (page.reload() preserves it, same as relaunching against
  // the same profile).
  await page.reload();

  await expect(page.getByRole("heading", { name: "Dish directions" })).toBeVisible();
  await expect(page.getByText("Spinach Frittata")).toBeVisible();
  await expect(page.getByRole("button", { name: "Step (selectDirection)" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("US4 resume: the session list shows a started session and reopens it", async ({ page }) => {
  await startSession(page, ["2 eggs"]);
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();

  // No explicit "back to list" while a session is active — simulate a fresh
  // visit (no `currentSessionId`) that still has this session in its list.
  await page.evaluate(() => localStorage.removeItem("recipe-agent.currentSessionId"));
  await page.reload();

  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();
  const entry = page.getByRole("button").filter({ hasText: "Untitled session" }).first();
  await expect(entry).toBeVisible();
  await expectNoA11yViolations(page);
  await entry.click();

  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();
});
