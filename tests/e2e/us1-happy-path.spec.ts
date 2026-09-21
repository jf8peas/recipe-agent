import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

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
