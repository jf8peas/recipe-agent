import { test, expect } from "@playwright/test";
import { startSession, expectNoA11yViolations } from "./helpers";

const SLIDE_TITLES = [
  "Author Profile",
  "High-Level Architecture & Tech Stack",
  "Database & State Persistence",
  "Repository Structure",
  "End-to-End Execution Flow",
];

test("US1: full slide sequence, boundary controls, and Return to App restores the exact prior view", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  const stepButtonBefore = await page.getByRole("button", { name: /^Step \(/ }).textContent();

  await page.getByRole("button", { name: "About This App" }).click();
  const dialog = page.getByRole("dialog", { name: "About This App" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Author Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
  const linkedinLink = page.getByRole("link", { name: "View LinkedIn profile" });
  await expect(linkedinLink).toHaveAttribute("target", "_blank");
  await expect(linkedinLink).toHaveAttribute("rel", /noopener/);

  await expectNoA11yViolations(page);

  for (let i = 1; i < SLIDE_TITLES.length; i += 1) {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: SLIDE_TITLES[i] })).toBeVisible();
    if (SLIDE_TITLES[i] === "Repository Structure") {
      await expect(dialog.getByText("app/api/recipe/")).toBeVisible();
      // Densest slide (directory tree) gets its own scan too — different
      // content, same shell.
      await expectNoA11yViolations(page);
    }
  }
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  // The underlying (covered) session view also contains "parseIngredients"
  // text (its own history/stage list) — scope to the dialog to disambiguate.
  await expect(dialog.getByText("parseIngredients")).toBeVisible();

  await page.getByRole("button", { name: "Return to App" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: stepButtonBefore! })).toBeVisible();

  await page.getByRole("button", { name: "About This App" }).click();
  await expect(page.getByRole("heading", { name: "Author Profile" })).toBeVisible();
});

test("US1: opening the slideshow while a stage is running does not lose the result", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "e2e-slow"]);
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();

  await page.getByRole("button", { name: "Step (proposeDirections)" }).click({ force: true });
  await page.getByRole("button", { name: "About This App" }).click();
  await expect(page.getByRole("heading", { name: "Author Profile" })).toBeVisible();

  // The underlying tree is a sibling, not unmounted — its own state keeps
  // settling in the background while the overlay covers it.
  await expect(page.getByRole("heading", { name: "Dish directions" })).toBeVisible();

  await page.getByRole("button", { name: "Return to App" }).click();
  await expect(page.getByRole("heading", { name: "Dish directions" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Step (draftRecipe)" })).toBeVisible();
});

test("US2: keyboard-only navigation, focus management, and live-region announcements", async ({
  page,
}) => {
  await page.goto("/");
  const aboutButton = page.getByRole("button", { name: "About This App" });
  await aboutButton.click();

  const returnButton = page.getByRole("button", { name: "Return to App" });
  await expect(page.getByRole("region", { name: /Slide 1 of 5/ })).toBeFocused();

  // Focus trap: Tab from the last focusable (Return) wraps to the first
  // (the LinkedIn link); Shift+Tab from the first wraps back to the last.
  await returnButton.focus();
  await page.keyboard.press("Tab");
  const linkedinLink = page.getByRole("link", { name: "View LinkedIn profile" });
  await expect(linkedinLink).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(returnButton).toBeFocused();

  for (let i = 1; i < SLIDE_TITLES.length; i += 1) {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("heading", { name: SLIDE_TITLES[i] })).toBeVisible();
  }
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/Slide 5 of 5/);

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("heading", { name: "Repository Structure" })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]')).toHaveText(/Slide 4 of 5/);

  await expectNoA11yViolations(page);

  await returnButton.click();
  await expect(page.getByRole("dialog", { name: "About This App" })).toHaveCount(0);
  await expect(aboutButton).toBeFocused();
});

test("US2: rapid arrow-key presses stay within bounds", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "About This App" }).click();

  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(page.getByRole("heading", { name: "End-to-End Execution Flow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect(page.getByRole("heading", { name: "Author Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
});

test("US3: renders from 320px through 1920px, with bounded inner scroll for wide content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "About This App" }).click();

  async function assertNoPageOverflow() {
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflowing).toBe(false);
  }

  await assertNoPageOverflow();
  for (let i = 1; i < SLIDE_TITLES.length; i += 1) {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: SLIDE_TITLES[i] })).toBeVisible();
    await assertNoPageOverflow();

    if (SLIDE_TITLES[i] === "Repository Structure") {
      // The directory tree scrolls within its own bounded container, not
      // the page.
      const treeScroll = page.getByTestId("directory-tree-scroll");
      const treeOverflows = await treeScroll.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(treeOverflows).toBe(true);
    }
    if (SLIDE_TITLES[i] === "End-to-End Execution Flow") {
      // Same containment for the flow diagram.
      const flowScroll = page.getByTestId("execution-flow-scroll");
      const flowOverflows = await flowScroll.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(flowOverflows).toBe(true);
    }
  }

  // Slide 3 (Database & State Persistence): the densest text slide scrolls
  // vertically within its own region, not by clipping.
  await page.getByRole("button", { name: "Previous" }).click();
  await page.getByRole("button", { name: "Previous" }).click();
  const slideRegion = page.getByRole("region", { name: /Slide 3 of 5/ });
  const slideOverflowsVertically = await slideRegion.evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(slideOverflowsVertically).toBe(true);

  for (const name of ["Previous", "Next", "Return to App"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(43);
    expect(box?.height).toBeGreaterThanOrEqual(43);
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  await assertNoPageOverflow();
});
