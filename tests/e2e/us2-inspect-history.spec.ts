import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

test("US2 inspect history: browse the timeline, open an earlier entry, exact match", async ({ page }) => {
  await startSession(page, ["2 eggs"]);
  await clickStep(page); // proposeDirections
  await clickStep(page); // draftRecipe — recipeDraft now populated

  await expect(page.getByRole("heading", { name: "Recipe draft" })).toBeVisible();

  await page.getByText("History").click();
  const parseEntry = page.getByRole("button", { name: /^parseIngredients,/ });
  await expect(parseEntry).toHaveCount(1);
  await parseEntry.click();

  await expect(page.getByText("Viewing an earlier step")).toBeVisible();
  // At the parseIngredients checkpoint, directions/recipe draft don't exist yet.
  await expect(page.getByRole("heading", { name: "Dish directions" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recipe draft" })).toHaveCount(0);
  await expect(page.getByText("2 eggs")).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Back to current" }).click();
  await expect(page.getByText("Viewing an earlier step")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recipe draft" })).toBeVisible();
});
