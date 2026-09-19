import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

function summary(page: import("@playwright/test").Page) {
  return page.getByTestId("agent-graph-summary");
}

test("US1: immediately after starting, parseIngredients is done and proposeDirections is current", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();

  await expect(summary(page)).toHaveText(/Progress: parseIngredients (is|are) done/);
  await expect(summary(page)).toHaveText(/proposeDirections is the current stage/);
});

test("US1: the ingredient-error path shows only that path taken, none of the main-path stages", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "rock"]);
  await expect(page.getByRole("button", { name: "Step (ingredientError)" })).toBeVisible();
  await clickStep(page);

  await expect(page.getByText("not a food item")).toBeVisible();
  // history.timeline lags the step response by one async fetch (fired but
  // not awaited by useSession's own step()) — toHaveText's built-in polling
  // (not a one-shot textContent() read) waits out that window instead of
  // catching the transient pre-refetch state.
  await expect(summary(page)).toHaveText(/Progress: parseIngredients, ingredientError are done\. The run has finished\./);
});

test("US1: several stages in and paused shows the exact prefix taken, current marked, rest not-reached", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  await clickStep(page); // proposeDirections
  await clickStep(page); // selectDirection

  await expect(page.getByRole("button", { name: "Step (draftRecipe)" })).toBeVisible();
  await expect(summary(page)).toHaveText(/parseIngredients, proposeDirections, selectDirection are done/);
  await expect(summary(page)).toHaveText(/draftRecipe is the current stage/);
  await expect(summary(page)).toHaveText(/critique, refine, finalize are not yet reached/);
});

test("US1: a revised recipe shows the revision loop taken, distinct from a straight-through run", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach", "e2e-trigger-blocking-critique"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }

  await expect(page.getByRole("button", { name: "Start a new session" })).toBeVisible();
  await expect(summary(page)).toHaveText(/The recipe was revised at least once/);
  await expect(summary(page)).toHaveText(/The run has finished/);
});

test("US1: viewing an earlier checkpoint truncates the diagram to that point, not the live tip", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  await clickStep(page); // proposeDirections
  await clickStep(page); // selectDirection
  await clickStep(page); // draftRecipe

  await page.getByText("History").click();
  // The earliest entry in the panel is the session's own genesis / first
  // real stage — select it to view a point well before the live tip.
  const firstEntry = page.locator('nav[aria-label="Session history"] button').first();
  await firstEntry.click();

  await expect(summary(page)).not.toHaveText(/draftRecipe is the current stage/);
});

test("US2: the svg is decorative and the accessible summary carries the same facts, with no duplicate live-region chatter", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  await expect(page.locator('[data-testid="agent-graph-progress-scroll"] svg')).toHaveAttribute(
    "aria-hidden",
    "true",
  );

  await clickStep(page); // proposeDirections
  // RunningStage's own live region announces the transition; the graph
  // summary itself carries no separate aria-live of its own.
  await expect(summary(page)).not.toHaveAttribute("aria-live", /.+/);

  await expectNoA11yViolations(page);
});

test("US3: renders from 320px through 1920px with no whole-page horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await startSession(page, ["2 eggs", "spinach"]);

  const overflowing = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowing).toBe(false);

  await expectNoA11yViolations(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  const overflowingWide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowingWide).toBe(false);
});

test("US3: matches the app's dark theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await startSession(page, ["2 eggs", "spinach"]);
  await expect(page.locator('[data-testid="agent-graph-progress-scroll"] svg')).toBeVisible();
  await expectNoA11yViolations(page);
});
