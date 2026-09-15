import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Fills the entry form and submits it (runs `parseIngredients` for real,
 * via the fake model — `scripts/e2e-server.ts`). Waits for the session to
 * actually be active (next stage or a terminal outcome visible) before
 * returning — the click alone doesn't wait for the async response, so a
 * caller reading `localStorage` immediately after could otherwise race it. */
export async function startSession(page: Page, ingredients: string[]): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Ingredients (one per line)").fill(ingredients.join("\n"));
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Step \(/ }).or(page.getByRole("button", { name: "Start a new session" })),
  ).toBeVisible();
}

/** Clicks the manual "Step (<stage>)" advance button and waits for the
 * stage to actually finish. `force: true` skips Playwright's pre-click
 * stability check: `useSession.step()` fires an async `fetchHistory()`
 * after its main response, and the resulting timeline re-render (new rows
 * in the — possibly collapsed — History panel) can keep nudging the
 * button's layout just enough that Playwright never sees two consecutive
 * stable frames, even though the click itself lands fine either way.
 *
 * Waiting for the *old* button to merely disappear isn't enough — the app
 * shows `RunningStage` (no "Step (…)" button at all) while the request is
 * in flight, so a caller's own `isVisible()` poll right after this resolves
 * could sample exactly that gap and wrongly conclude the run is done. Wait
 * for a definitive settled state instead: a new "Step (…)" button, or a
 * terminal/failure control. */
export async function clickStep(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: /^Step \(/ });
  const label = await button.textContent();
  await button.click({ force: true });
  if (label) await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: /^Step \(/ })
      .or(page.getByRole("button", { name: "Start a new session" }))
      .or(page.getByRole("button", { name: "Retry" })),
  ).toBeVisible();
}

/** A short random token so parallel specs sharing one fake-model server
 * process don't trip each other's "already failed once" fixture state. */
export function nonce(): string {
  return Math.random().toString(36).slice(2);
}

/** Asserts the current page has no WCAG 2.0/2.1 A/AA violations (spec SC-027). */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}
