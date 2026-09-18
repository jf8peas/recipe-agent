import { test, expect } from "@playwright/test";
import { startSession, expectNoA11yViolations } from "./helpers";

test("US1: full section sequence, no pagination, and Return to App restores the exact prior view", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  const stepButtonBefore = await page.getByRole("button", { name: /^Step \(/ }).textContent();

  await page.getByRole("button", { name: "About This App" }).click();
  const dialog = page.getByRole("dialog", { name: "About This App" });
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "John Fong" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous" })).toHaveCount(0);

  await expectNoA11yViolations(page);

  await dialog.locator("#agent-graph").scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("heading", { name: "Nodes do the work, edges decide where the state goes next" }),
  ).toBeVisible();
  // Densest section (the agent graph diagram) gets its own scan too.
  await expectNoA11yViolations(page);

  await dialog.locator("#closing").scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("heading", { name: "The specs are the source of truth — this page is a map of them" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Return to App" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: stepButtonBefore! })).toBeVisible();

  await page.getByRole("button", { name: "About This App" }).click();
  // Reopening always starts at the top — no scroll position is remembered.
  await expect(dialog.getByRole("heading", { name: "How it works" })).toBeInViewport();
});

test("US1: opening the reference page while a stage is running does not lose the result", async ({ page }) => {
  await startSession(page, ["2 eggs", "e2e-slow"]);
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();

  await page.getByRole("button", { name: "Step (proposeDirections)" }).click({ force: true });
  await page.getByRole("button", { name: "About This App" }).click();
  const dialog = page.getByRole("dialog", { name: "About This App" });
  await expect(dialog.getByRole("heading", { name: "How it works" })).toBeVisible();

  // The underlying tree is a sibling, not unmounted — its own state keeps
  // settling in the background while the overlay covers it.
  await expect(page.getByRole("heading", { name: "Dish directions" })).toBeVisible();

  await page.getByRole("button", { name: "Return to App" }).click();
  await expect(page.getByRole("heading", { name: "Dish directions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Step (selectDirection)" })).toBeVisible();
});

test("US2: topic nav activation moves focus and announces, and stays keyboard reachable", async ({ page }) => {
  await page.goto("/");
  const aboutButton = page.getByRole("button", { name: "About This App" });
  await aboutButton.click();

  const dialog = page.getByRole("dialog", { name: "About This App" });
  const returnButton = page.getByRole("button", { name: "Return to App" });

  // The nav stays visible/reachable regardless of scroll position.
  await dialog.locator("#closing").scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: "Agent graph" })).toBeVisible();

  await page.getByRole("link", { name: "Agent graph" }).click();
  await expect(page.locator("#agent-graph")).toBeFocused();
  await expect(page.locator('[aria-live="polite"]')).toHaveText("Jumped to: Agent graph");

  // Focus trap: unlike a single-slide dialog, this page has many in-content
  // links (author/repo/closing), so "Return to App" sits near the *start*
  // of the focusable sequence, not the end — the true last element is the
  // closing section's LinkedIn link. Tab from there wraps to the first nav
  // link; Shift+Tab from the first nav link wraps back to it.
  const lastLink = page.getByRole("link", { name: "View LinkedIn profile" }).last();
  await lastLink.focus();
  await page.keyboard.press("Tab");
  const firstNavLink = page.getByRole("link", { name: "Overview" });
  await expect(firstNavLink).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(lastLink).toBeFocused();

  await expectNoA11yViolations(page);

  await returnButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(aboutButton).toBeFocused();
});

test("US3: renders from 320px through 1920px, with bounded inner scroll for the agent graph", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "About This App" }).click();
  const dialog = page.getByRole("dialog", { name: "About This App" });

  async function assertNoPageOverflow() {
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflowing).toBe(false);
  }

  await assertNoPageOverflow();

  await dialog.locator("#agent-graph").scrollIntoViewIfNeeded();
  await assertNoPageOverflow();

  // The agent graph — the widest diagram — scrolls within its own bounded
  // container, not the page (FR-021a).
  const graphScroll = page.getByTestId("agent-graph-scroll");
  const graphOverflows = await graphScroll.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(graphOverflows).toBe(true);

  await dialog.locator("#closing").scrollIntoViewIfNeeded();
  await assertNoPageOverflow();

  const returnBox = await page.getByRole("button", { name: "Return to App" }).boundingBox();
  expect(returnBox?.height).toBeGreaterThanOrEqual(43);

  await expectNoA11yViolations(page);
  await dialog.locator("#agent-graph").scrollIntoViewIfNeeded();
  await expectNoA11yViolations(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await assertNoPageOverflow();
});
