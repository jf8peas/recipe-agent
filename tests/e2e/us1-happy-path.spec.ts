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

  // Header author/feedback links open in a new tab (spec FR-047) and leave
  // this session unaffected (SC-016).
  const authorLink = page.getByRole("link", { name: "Author" });
  await expect(authorLink).toHaveAttribute("target", "_blank");
  await expect(authorLink).toHaveAttribute("rel", /noopener/);
  const feedbackLink = page.getByRole("link", { name: "Feedback" });
  await expect(feedbackLink).toHaveAttribute("target", "_blank");
  await expect(feedbackLink).toHaveAttribute("rel", /noopener/);

  const [popup] = await Promise.all([page.waitForEvent("popup"), authorLink.click()]);
  await popup.close();
  await expect(page.getByRole("heading", { name: "Final recipe" })).toBeVisible();
});
