import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

function summary(page: import("@playwright/test").Page) {
  return page.getByTestId("agent-graph-summary");
}

test.describe("US1: one shared header, two states", () => {
  test("same height/background on an app screen and the About page, switching feels seamless", async ({
    page,
  }) => {
    await page.goto("/");
    const appHeader = page.locator("header");
    const appBox = await appHeader.boundingBox();
    const appBackground = await appHeader.evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.getByRole("button", { name: "About This App" }).click();
    const dialog = page.getByRole("dialog", { name: "About This App" });
    const aboutHeader = dialog.locator("header");
    const aboutBox = await aboutHeader.boundingBox();
    const aboutBackground = await aboutHeader.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(aboutBox?.height).toBe(appBox?.height);
    expect(aboutBackground).toBe(appBackground);

    await page.getByRole("button", { name: "Return to App" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("the pause toggle is a real switch, operable by mouse and keyboard, state never conveyed by color alone", async ({
    page,
  }) => {
    await page.goto("/");
    const toggle = page.getByRole("switch", { name: "Pause between stages" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("header has no a11y violations, light or dark", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);

    await page.getByRole("button", { name: "About This App" }).click();
    await expectNoA11yViolations(page);
  });
});

test.describe("US2: the two-row agent graph", () => {
  test("every node stays legible with no page overflow at phone and desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await startSession(page, ["2 eggs", "spinach"]);

    async function assertNoPageOverflow() {
      const overflowing = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflowing).toBe(false);
    }

    await assertNoPageOverflow();
    const scroll = page.getByTestId("agent-graph-progress-scroll");
    // No internal vertical overflow — the container only ever scrolls
    // horizontally (the existing bounded-scroll fallback), never vertically.
    const verticallyOverflowing = await scroll.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(verticallyOverflowing).toBe(false);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await assertNoPageOverflow();
  });

  test("re-derives the ingredient-error path correctly in the new two-row shapes, not just in the text summary", async ({
    page,
  }) => {
    await startSession(page, ["2 eggs", "rock"]);
    await clickStep(page);

    await expect(summary(page)).toHaveText(/Progress: parseIngredients, ingredientError are done\. The run has finished\./);
    await expect(page.getByTestId("agent-graph-node-parseIngredients")).toHaveAttribute("data-node-state", "taken");
    await expect(page.getByTestId("agent-graph-node-ingredientError")).toHaveAttribute("data-node-state", "taken");
    await expect(page.getByTestId("agent-graph-node-proposeDirections")).toHaveAttribute("data-node-state", "untaken");
  });

  test("re-derives a revised-at-least-once run correctly in the new two-row shapes", async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach", "e2e-trigger-blocking-critique"]);
    await clickStep(page); // proposeDirections
    await clickStep(page); // selectDirection
    await clickStep(page); // draftRecipe
    await clickStep(page); // critique -> refine (blocking)

    await expect(page.getByTestId("agent-graph-node-refine")).toHaveAttribute("data-node-state", "current");
    await expect(page.getByTestId("agent-graph-node-finalize")).toHaveAttribute("data-node-state", "not-yet-reached");

    while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
      await clickStep(page);
    }
    await expect(page.getByRole("button", { name: "Start a new session" })).toBeVisible();
    await expect(summary(page)).toHaveText(/The recipe was revised at least once/);
    await expect(page.getByTestId("agent-graph-node-refine")).toHaveAttribute("data-node-state", "taken");
    await expect(page.getByTestId("agent-graph-node-finalize")).toHaveAttribute("data-node-state", "taken");
  });

  test("graph has no a11y violations, light or dark", async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach"]);
    await expectNoA11yViolations(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);
  });
});

test.describe("US3: stage tabs synced with the graph, action row always reachable", () => {
  test("a tab appears as each stage completes, defaulting to the newest", async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach"]);
    await expect(page.getByRole("tab", { name: "Ingredients" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Dish directions" })).toHaveCount(0);

    await clickStep(page); // proposeDirections
    await expect(page.getByRole("tab", { name: "Dish directions" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Dish directions" })).toHaveAttribute("aria-selected", "true");
  });

  test("clicking a graph node selects its tab, and clicking a tab highlights its node", async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach"]);
    await clickStep(page); // proposeDirections
    await expect(page.getByRole("tab", { name: "Dish directions" })).toHaveAttribute("aria-selected", "true");

    await page.getByTestId("agent-graph-node-parseIngredients").click();
    await expect(page.getByRole("tab", { name: "Ingredients" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("agent-graph-node-parseIngredients")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("agent-graph-node-proposeDirections")).toHaveAttribute("data-selected", "false");

    await page.getByRole("tab", { name: "Dish directions" }).click();
    await expect(page.getByTestId("agent-graph-node-proposeDirections")).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("agent-graph-node-parseIngredients")).toHaveAttribute("data-selected", "false");
  });

  test("clicking a not-yet-visible node's stage is a no-op", async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach"]);
    await expect(page.getByRole("tab", { name: "Ingredients" })).toHaveAttribute("aria-selected", "true");

    await page.getByTestId("agent-graph-node-finalize").click();
    await expect(page.getByRole("tab", { name: "Ingredients" })).toHaveAttribute("aria-selected", "true");
  });

  test("FR-013: a manually-selected tab persists across an unrelated re-render, but the next completed stage moves it", async ({
    page,
  }) => {
    await startSession(page, ["2 eggs", "spinach"]);
    await clickStep(page); // proposeDirections
    await clickStep(page); // selectDirection
    await expect(page.getByRole("tab", { name: "Direction selection" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: "Ingredients" }).click();
    await expect(page.getByRole("tab", { name: "Ingredients" })).toHaveAttribute("aria-selected", "true");

    // An unrelated re-render (toggling the History disclosure) must not
    // snap the manually-chosen tab back.
    await page.getByText("History").click();
    await expect(page.getByRole("tab", { name: "Ingredients" })).toHaveAttribute("aria-selected", "true");

    await clickStep(page); // draftRecipe — a new stage completing moves it forward
    await expect(page.getByRole("tab", { name: "Recipe draft" })).toHaveAttribute("aria-selected", "true");
  });

  test('"Edit this stage" appears only on editable tabs, wired to the real edit mechanism', async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach"]);
    await expect(page.getByRole("button", { name: "Edit this stage" })).toBeVisible();

    await page.getByRole("button", { name: "Edit this stage" }).click();
    await expect(page.getByRole("button", { name: "Try this version" })).toBeVisible();
    // Edit mode stacks every produced stage at once — no separate tab strip.
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit this stage" })).toHaveCount(0);

    await page.getByRole("button", { name: "Cancel" }).click();
    await clickStep(page); // proposeDirections
    await expect(page.getByRole("tab", { name: "Critique" })).toHaveCount(0);
  });

  test("the sticky action row stays reachable at the bottom of a tall page regardless of the active tab", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 500 });
    await startSession(page, ["2 eggs", "spinach"]);
    await clickStep(page); // proposeDirections

    const stepButton = page.getByRole("button", { name: /^Step \(/ });
    await expect(stepButton).toBeVisible();
    const box = await stepButton.boundingBox();
    expect(box?.y).toBeLessThan(500);
  });

  test("running-session view has no a11y violations, light or dark", async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach"]);
    await clickStep(page); // proposeDirections
    await expectNoA11yViolations(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);
  });
});

test.describe("Each pass through critique is its own tab", () => {
  test("a multi-cycle refine loop produces one tab per critique cycle, each showing that cycle's own content", async ({
    page,
  }) => {
    await startSession(page, ["2 eggs", "spinach", "e2e-trigger-blocking-critique"]);
    while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
      await clickStep(page);
    }
    await expect(page.getByRole("button", { name: "Start a new session" })).toBeVisible();

    // MAX_REFINE_CYCLES defaults to 2, so a permanently-blocking critique
    // produces 3 cycles (2 that block, 1 that's overridden by the budget).
    await expect(page.getByRole("tab", { name: "Critique 1" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Critique 2" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Critique 3" })).toBeVisible();

    await page.getByRole("tab", { name: "Critique 1" }).click();
    await expect(page.getByRole("heading", { name: "Critique 1" })).toBeVisible();
    await expect(page.getByText("Blocking — sent back for revision")).toBeVisible();

    await page.getByRole("tab", { name: "Critique 3" }).click();
    await expect(page.getByRole("heading", { name: "Critique 3" })).toBeVisible();
  });

  test("clicking the critique node selects the newest critique tab", async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach", "e2e-trigger-blocking-critique"]);
    await clickStep(page); // proposeDirections
    await clickStep(page); // selectDirection
    await clickStep(page); // draftRecipe
    await clickStep(page); // critique cycle 1 (blocks) -> refine
    await clickStep(page); // refine -> critique cycle 2
    await clickStep(page); // critique cycle 2 (blocks) -> refine

    await page.getByRole("tab", { name: "Ingredients" }).click();
    await expect(page.getByRole("tab", { name: "Ingredients" })).toHaveAttribute("aria-selected", "true");

    await page.getByTestId("agent-graph-node-critique").click();
    await expect(page.getByRole("tab", { name: "Critique 2" })).toHaveAttribute("aria-selected", "true");
  });

  test("critique content is broken into labeled sections, not one crammed line", async ({ page }) => {
    await startSession(page, ["2 eggs", "spinach"]);
    await clickStep(page); // proposeDirections
    await clickStep(page); // selectDirection
    await clickStep(page); // draftRecipe
    await clickStep(page); // critique (non-blocking, straight through)
    await clickStep(page); // finalize

    await page.getByRole("tab", { name: "Critique 1" }).click();
    await expect(page.getByText("FEASIBILITY")).toBeVisible();
    await expect(page.getByText("FLAVOR BALANCE")).toBeVisible();
    await expect(page.getByText("Straightforward.")).toBeVisible();
    await expect(page.getByText("Balanced.")).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe("US4: session list, entry form, running session, and About page share one width and button style", () => {
  test("the same maximum content width across all four screens", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });

    // Entry form: a fresh visit, no sessions yet.
    await page.goto("/");
    const entryWidth = (await page.locator("main").boundingBox())!.width;

    // Running session.
    await page.getByLabel("Ingredients (one per line)").fill("2 eggs\nspinach");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Step \(/ })).toBeVisible();
    const runWidth = (await page.locator("main").boundingBox())!.width;

    // About page.
    await page.getByRole("button", { name: "About This App" }).click();
    const aboutWidth = (await page.getByRole("dialog", { name: "About This App" }).locator("main").boundingBox())!
      .width;
    await page.getByRole("button", { name: "Return to App" }).click();

    // Session list (the established route to it — no in-run "back to list").
    await page.evaluate(() => localStorage.removeItem("recipe-agent.currentSessionId"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();
    const listWidth = (await page.locator("main").boundingBox())!.width;

    expect(runWidth).toBe(entryWidth);
    expect(aboutWidth).toBe(entryWidth);
    expect(listWidth).toBe(entryWidth);
  });

  test("a session row's and the entry form's primary button visually match the action row's primary button", async ({
    page,
  }) => {
    await page.goto("/");
    const entryButtonColor = await page
      .getByRole("button", { name: "Start", exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.getByLabel("Ingredients (one per line)").fill("2 eggs\nspinach");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Step \(/ })).toBeVisible();
    const runButtonColor = await page
      .getByRole("button", { name: /^Step \(/ })
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.evaluate(() => localStorage.removeItem("recipe-agent.currentSessionId"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();
    const listButtonColor = await page
      .getByRole("button", { name: "Start a new session" })
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(entryButtonColor).toBe(runButtonColor);
    expect(listButtonColor).toBe(runButtonColor);
  });

  test("session list and entry form have no a11y violations, light or dark", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);

    await page.getByLabel("Ingredients (one per line)").fill("2 eggs\nspinach");
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Step \(/ })).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("recipe-agent.currentSessionId"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe("US5: the About page scrolls cleanly and matches the new visual language", () => {
  test("the scroll container reports thin-scrollbar styling and shows no focus outline after a programmatic scroll", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "About This App" }).click();
    const scroll = page.getByTestId("about-page-scroll");

    const scrollbarWidth = await scroll.evaluate((el) => getComputedStyle(el).scrollbarWidth);
    expect(scrollbarWidth).toBe("thin");

    await scroll.evaluate((el) => el.scrollTo({ top: 200 }));
    const outline = await scroll.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe("none");
  });

  test("the agent-graph illustration renders the two-row shapes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "About This App" }).click();
    await page.locator("#agent-graph").scrollIntoViewIfNeeded();

    const diagram = page.locator('svg[aria-label^="Seven agent nodes"]');
    await expect(diagram).toBeVisible();
    // A join connector + row-2's reversed reading only make sense once two
    // rows exist — confirm both rows' node text is present in one diagram.
    await expect(diagram.getByText("Ingredients")).toBeVisible();
    await expect(diagram.getByText("finalize")).toBeVisible();
    await expect(diagram.getByText("refine")).toBeVisible();
  });

  test("About page has no a11y violations, light or dark", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "About This App" }).click();
    await expectNoA11yViolations(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoA11yViolations(page);
  });
});
