import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

test("US1 happy path: clicking Start shows the same running-stage spinner and elapsed-time indicator as Step, while parseIngredients is in flight", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Ingredients (one per line)").fill("2 eggs\nspinach");

  // Artificially slow /api/recipe/start (same pattern used for "Generate
  // photo"/delete's own busy-state tests) so the in-flight state is actually
  // observable instead of racing past it.
  await page.route("**/api/recipe/start", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await page.getByRole("button", { name: "Start", exact: true }).click();

  const running = page.locator('[role="status"]', { hasText: "Running" });
  await expect(running).toBeVisible();
  await expect(running).toContainText("parseIngredients");
  await expect(running).toContainText(/\(\d+\.\ds\)/);

  // Resolves into the normal running-session view once the response lands.
  await expect(page.getByRole("button", { name: /^Step \(/ })).toBeVisible();
  await expect(running).toHaveCount(0);
});

test("US1 happy path: start -> step through all stages -> finalized recipe", async ({ page }) => {
  await startSession(page, ["2 eggs", "spinach"]);
  await expect(page.getByRole("button", { name: /^Step \(/ })).toBeVisible();

  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }

  const finalRecipeSection = page.locator("h3", { hasText: "Final recipe" }).locator("..");
  await expect(finalRecipeSection).toBeVisible();
  await expect(finalRecipeSection.getByText("Spinach Frittata")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new session" })).toBeVisible();
  await expectNoA11yViolations(page);

  // Header Feedback link opens in a new tab (spec FR-047) and leaves this
  // session unaffected (SC-016).
  const feedbackLink = page.getByRole("link", { name: "Feedback" });
  await expect(feedbackLink).toHaveAttribute("target", "_blank");
  await expect(feedbackLink).toHaveAttribute("rel", /noopener/);

  // Header's Author control opens the About page straight to "Who built
  // this" (in-page, not a new tab), and returning leaves this session
  // unaffected (SC-016).
  await page.getByRole("button", { name: "Author" }).click();
  const dialog = page.getByRole("dialog", { name: "About This App" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "John Fong" })).toBeInViewport();
  await expect(dialog.getByRole("heading", { name: "Alesja Tanabe" })).toBeVisible();

  await page.getByRole("button", { name: "Return to App" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Final recipe" })).toBeVisible();
});

// Regression: `ActionToolbar`'s "Start a new session" (shown once a run
// finishes) used to just call `reset()`, which clears the active session but
// never touches `view` — a session started fresh from the entry form left
// `view` at "entry" already, so this bug only showed up for a session
// *reopened from the list*, where `view` was still "list" from before.
// Clicking "Start a new session" there correctly cleared the session but
// incorrectly landed back on the list instead of the entry form.
test("US1: \"Start a new session\" from a finalized recipe reopened from the list goes to the entry form, not back to the list", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }
  await expect(page.getByRole("button", { name: "Start a new session" })).toBeVisible();

  await page.getByRole("button", { name: "Back to your sessions" }).click();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();

  // Reopen the session just left (touch() puts it at the top row) instead of
  // going straight from Start -> finalize -> "Start a new session", which
  // never exercises the "view" state this bug actually depends on.
  const topRowOpenButton = page.locator("li").nth(0).getByRole("button").first();
  await topRowOpenButton.click();
  await expect(page.getByRole("heading", { name: "Final recipe" })).toBeVisible();

  await page.getByRole("button", { name: "Start a new session" }).click();
  await expect(page.getByLabel("Ingredients (one per line)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toHaveCount(0);
});

test("US1: returning to the session list via \"Back to your sessions\" focuses the top row — the session just left, which the list always reorders to the front", async ({
  page,
}) => {
  await startSession(page, ["2 eggs"]);
  await page.getByRole("button", { name: "Back to your sessions" }).click();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();

  // A second session, started after the first — leaving it should put IT at
  // the top of the list (touch()/refreshFromServer both order
  // most-recently-active-first), so focus landing on row 0 is meaningful,
  // not a coincidence of there being only one row.
  await page.getByRole("button", { name: "Start a new session" }).click();
  await page.getByLabel("Ingredients (one per line)").fill("3 eggs");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Step \(/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to your sessions" }).click();

  // Without this fix, focus is simply wherever it was on the now-unmounted
  // running-session view — the browser drops it to <body>, leaving a
  // keyboard/screen-reader user with no indication of where they landed or
  // that the list just reordered around them (WCAG 2.4.3).
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();
  const rows = page.locator("li");
  await expect(rows).toHaveCount(2);
  const topRowOpenButton = rows.nth(0).getByRole("button").first();
  await expect(topRowOpenButton).toBeFocused();
});
