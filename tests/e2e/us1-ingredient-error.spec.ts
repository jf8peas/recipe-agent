import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

test("US1 ingredient error: an unusable ingredient ends in the error outcome, no recipe content", async ({ page }) => {
  await startSession(page, ["2 eggs", "rock"]);
  await expect(page.getByRole("button", { name: "Step (ingredientError)" })).toBeVisible();
  await clickStep(page);

  await expect(page.getByText("not a food item")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new session" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Recipe draft" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Final recipe" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dish directions" })).toHaveCount(0);
  await expectNoA11yViolations(page);
});
