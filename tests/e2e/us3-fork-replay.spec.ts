import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

test("US3 fork-replay: editing a field and trying a new version diverges without touching the original", async ({
  page,
}) => {
  await startSession(page, ["2 eggs"]);
  await clickStep(page); // proposeDirections
  await clickStep(page); // selectDirection
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

test("US3 fork-replay: editing the direction selection changes which direction gets drafted (spec FR-009, US3 AS1)", async ({
  page,
}) => {
  await startSession(page, ["2 eggs"]);
  await clickStep(page); // proposeDirections
  await clickStep(page); // selectDirection

  await expect(page.getByRole("heading", { name: "Direction selected" })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const selectionTextarea = page.getByLabel("Direction selection (JSON)");
  const original = await selectionTextarea.inputValue();
  const edited = JSON.parse(original);
  edited.selectedIndex = 1;
  edited.explanation = "Switched to the omelet.";
  await selectionTextarea.fill(JSON.stringify(edited, null, 2));

  await page.getByRole("button", { name: "Try this version" }).click();

  // The forked branch's recorded selection reflects the edit immediately —
  // no new judgment call happened (spec US3 AS1).
  const directionSelectedSection = page
    .locator("h3", { hasText: "Direction selected" })
    .locator("..");
  await expect(directionSelectedSection.getByText("Switched to the omelet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Step (draftRecipe)" })).toBeVisible();

  await clickStep(page); // draftRecipe drafts from the edited selection
  const recipeDraftSection = page.locator("h3", { hasText: "Recipe draft" }).locator("..");
  await expect(recipeDraftSection.getByText("Veggie Omelet")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("US3 fork-replay: editing the candidate directions re-runs selection against the edited set (spec FR-010, US3 AS2)", async ({
  page,
}) => {
  await startSession(page, ["2 eggs"]);
  await clickStep(page); // proposeDirections — directionSelection is still null

  await expect(page.getByRole("heading", { name: "Dish directions" })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const directionsTextarea = page.getByLabel("Dish directions (JSON)");
  const editedDirections = [
    { title: "Quiche", summary: "A custardy baked pie.", whyItFits: "Uses the eggs." },
  ];
  await directionsTextarea.fill(JSON.stringify(editedDirections, null, 2));
  await page.getByRole("button", { name: "Try this version" }).click();

  // Editing `directions` re-enters at selectDirection, not draftRecipe
  // (spec FR-010 — directions' consumer is now selectDirection).
  await expect(page.getByRole("button", { name: "Step (selectDirection)" })).toBeVisible();
  await clickStep(page); // selectDirection re-runs against the edited candidates

  // A single edited candidate hits the 1-candidate fast path (spec FR-015,
  // research R6) — no model call, deterministic explanation.
  const directionSelectedSection = page
    .locator("h3", { hasText: "Direction selected" })
    .locator("..");
  await expect(directionSelectedSection.getByText("Quiche")).toBeVisible();
  await expect(
    directionSelectedSection.getByText("Only one direction was proposed, so it was used."),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});

test("US3 ingredient-error recovery: forking with corrected ingredients proceeds past parseIngredients", async ({
  page,
}) => {
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
