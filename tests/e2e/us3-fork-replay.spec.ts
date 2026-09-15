import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

test("US3 fork-replay: editing a field and trying a new version diverges without touching the original", async ({ page }) => {
  await startSession(page, ["2 eggs"]);
  await clickStep(page); // proposeDirections
  await clickStep(page); // draftRecipe — recipeDraft now populated

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const draftTextarea = page.locator("textarea").last(); // RecipeDraftEditor
  const original = await draftTextarea.inputValue();
  expect(original).toContain("Spinach Frittata");
  await draftTextarea.fill(original.replace("Spinach Frittata", "Edited Frittata"));

  await page.getByRole("button", { name: "Try this version" }).click();

  await expect(page.getByText("Edited Frittata")).toBeVisible();

  // The original branch's checkpoint is untouched — its own draftRecipe
  // entry and the new branch's replayed draftRecipe leaf (holding the edit)
  // are both in the stitched timeline. Two "user-edit" entries: the original
  // branch's own seed (the raw ingredients as first submitted) and the new
  // branch's genesis (this replay).
  await page.getByText("History").click();
  await expect(page.getByRole("button", { name: /^draftRecipe,/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^user-edit,/ })).toHaveCount(2);
  await expectNoA11yViolations(page);
});

test("US3 ingredient-error recovery: forking with corrected ingredients proceeds past parseIngredients", async ({ page }) => {
  await startSession(page, ["rock"]);
  await clickStep(page); // ingredientError
  await expect(page.getByText("not a food item")).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const ingredientsTextarea = page.locator("textarea").first();
  await ingredientsTextarea.fill("2 eggs");
  await page.getByRole("button", { name: "Try this version" }).click();

  // The replayed branch's tip has next = [parseIngredients] — it re-runs for
  // real on the corrected input, rather than skipping validation entirely.
  await expect(page.getByRole("button", { name: "Step (parseIngredients)" })).toBeVisible();
  await page.getByRole("button", { name: "Step (parseIngredients)" }).click();
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();
  await expectNoA11yViolations(page);
});
