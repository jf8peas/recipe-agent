import { test, expect } from "@playwright/test";
import { startSession, expectNoA11yViolations } from "./helpers";

test("US1 cancel: cancelling a running stage writes no checkpoint", async ({ page }) => {
  // "e2e-slow" makes every stage that sees it (including this one, once
  // parseIngredients marks it usable) sleep ~2s before resolving, giving us
  // a reliable window to click Cancel before it would otherwise finish.
  await startSession(page, ["2 eggs", "e2e-slow"]);
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();

  // Deliberately not using the `clickStep` helper here — it waits for the
  // stage to fully settle, which would wait out the whole 2s delay and
  // leave no window to click Cancel.
  await page.getByRole("button", { name: "Step (proposeDirections)" }).click({ force: true });
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Back to the pre-stage tip — nothing advanced.
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dish directions" })).toHaveCount(0);
  await expectNoA11yViolations(page);
});
