import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

test("US3 invalid edit: an invalid edit is blocked, with the offending field named", async ({ page }) => {
  await startSession(page, ["2 eggs"]);
  await clickStep(page); // proposeDirections — directions now populated

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const directionsTextarea = page.locator("textarea").nth(1); // Ingredients(0), Directions(1)
  await directionsTextarea.fill("not valid json");

  await expect(page.getByText("Not valid JSON.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try this version" })).toBeDisabled();
  await expectNoA11yViolations(page);

  // Fixing it re-enables saving.
  await directionsTextarea.fill("[]");
  await expect(page.getByText("Not valid JSON.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try this version" })).toBeEnabled();
});
