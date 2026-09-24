import { test, expect } from "@playwright/test";
import { startSession, clickStep, expectNoA11yViolations } from "./helpers";

/** Part 1 (US1) — a photo appears on the final recipe tab, with no change
 * to the graph diagram or stage tabs (Hard Constraint 1, FR-020). */

test("US1: the final recipe tab shows the generated dish photo with meaningful alt text", async ({ page }) => {
  await startSession(page, ["2 eggs", "spinach"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }

  const finalRecipeSection = page.locator("h3", { hasText: "Final recipe" }).locator("..");
  await expect(finalRecipeSection).toBeVisible();

  const image = finalRecipeSection.getByRole("img");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("alt", /^Photo of /);

  await expectNoA11yViolations(page);
});

test("US1: the agent graph diagram and stage tabs are exactly the same set as before this feature — no new node, tab, or pause", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }
  await expect(page.getByRole("button", { name: "Start a new session" })).toBeVisible();

  // The graph's own accessible summary (agent-graph-progress.spec.ts's own
  // assertion style) still names exactly the same 6 real nodes — `finalize`
  // still reads as one single stage, not two.
  const summary = page.getByTestId("agent-graph-summary");
  await expect(summary).toHaveText(
    /parseIngredients, proposeDirections, selectDirection, draftRecipe, critique, finalize are done/,
  );
  await expect(summary).toHaveText(/The run has finished/);

  // Exactly the 6 tabs a straight-through run has always produced — no
  // extra "Image"/"Photo" tab was introduced by this feature.
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveText([
    "Ingredients",
    "Dish directions",
    "Direction selection",
    "Recipe draft 1",
    "Critique 1",
    "Final recipe",
  ]);
});

/** Part 2 (US2) — the session list shows a real thumbnail for a finalized
 * session and the placeholder for a non-finalized one, from both the
 * on-device list and a list rebuilt from `/mine`, with no layout shift. */

test("US2: the session list shows a thumbnail for a finalized session and the placeholder for a non-finalized one (on-device list)", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }
  await page.getByRole("button", { name: "Back to your sessions" }).click();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();

  // A second, deliberately non-finalized session, abandoned right away.
  await page.getByRole("button", { name: "Start a new session" }).click();
  await page.getByLabel("Ingredients (one per line)").fill("2 eggs");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Step \(/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to your sessions" }).click();
  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();

  const finalizedRow = page.locator("li").filter({ has: page.getByRole("button", { name: /Spinach Frittata/ }) });
  const unfinalizedRow = page.locator("li").filter({ has: page.getByRole("button", { name: "Untitled session" }) });

  const finalizedThumb = finalizedRow.getByRole("img");
  await expect(finalizedThumb).toBeVisible();
  await expect(finalizedThumb).toHaveAttribute("alt", /^Photo of /);

  // The placeholder box is present (reserving its space, FR-013) but has no
  // <img> — it's a decorative, aria-hidden glyph, not a broken-image state.
  await expect(unfinalizedRow.getByRole("img")).toHaveCount(0);
  await expect(unfinalizedRow.getByTestId("dish-image")).toBeVisible();

  // Both rows' media slots are the identical fixed box (`--dish-thumb-size`)
  // — the loaded photo and the placeholder never differ in size (no shift).
  const finalizedBox = await finalizedRow.getByTestId("dish-image").boundingBox();
  const unfinalizedBox = await unfinalizedRow.getByTestId("dish-image").boundingBox();
  expect(finalizedBox?.width).toBe(unfinalizedBox?.width);
  expect(finalizedBox?.height).toBe(unfinalizedBox?.height);

  await expectNoA11yViolations(page);
});

test("US2: the session list shows the same thumbnail after localStorage is cleared and the list is rebuilt from /mine", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }
  await page.getByRole("button", { name: "Back to your sessions" }).click();
  const onDeviceThumb = page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: /Spinach Frittata/ }) })
    .getByRole("img");
  await expect(onDeviceThumb).toBeVisible();
  const onDeviceSrc = await onDeviceThumb.getAttribute("src");

  // Clears the local list cache and the "current session" pointer, but
  // keeps `recipe-agent.clientId` — this device's identity persists (a
  // real "cleared site data" would also mint a brand-new, sessionless
  // clientId, which isn't what this test is exercising); the point here is
  // the *list* rebuild path (FR-032), not a fresh-device scenario.
  await page.evaluate(() => {
    localStorage.removeItem("recipe-agent.sessions");
    localStorage.removeItem("recipe-agent.currentSessionId");
  });
  await page.reload();

  await expect(page.getByRole("heading", { name: "Your sessions" })).toBeVisible();
  const rebuiltThumb = page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: /Spinach Frittata/ }) })
    .getByRole("img");
  await expect(rebuiltThumb).toBeVisible();
  await expect(rebuiltThumb).toHaveAttribute("alt", /^Photo of /);

  // Same underlying image (same imageId path), even though `/mine` mints a
  // freshly-signed URL each time (data-model.md §6) — only the signature
  // query params differ, never the image itself.
  const rebuiltSrc = await rebuiltThumb.getAttribute("src");
  expect(rebuiltSrc?.split("?")[0]).toBe(onDeviceSrc?.split("?")[0]);

  await expectNoA11yViolations(page);
});

/** Part 3 (US3) — an image failure alone never turns into a stage failure
 * or loses the recipe text (FR-003/004); both the final tab and the
 * session list fall back to the placeholder. */

test("US3: an image failure still finalizes with the full recipe and shows the placeholder — never a stage failure", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach", "e2e-trigger-image-failure"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }
  await expect(page.getByRole("button", { name: "Start a new session" })).toBeVisible();

  const finalRecipeSection = page.locator("h3", { hasText: "Final recipe" }).locator("..");
  await expect(finalRecipeSection).toBeVisible();
  await expect(finalRecipeSection.getByText("Spinach Frittata")).toBeVisible();
  await expect(finalRecipeSection.getByRole("img")).toHaveCount(0);
  await expect(finalRecipeSection.getByTestId("dish-image")).toBeVisible();

  // No stage-failure banner text ever appeared on the run itself (the page
  // always carries one empty `role="alert"` live region for announcements —
  // asserting on its text, not its mere presence, is what actually matters).
  await expect(page.getByRole("alert")).not.toContainText(/fail/i);

  // Nor does the History timeline record one for any stage.
  await page.getByText("History").click();
  await expect(page.locator('nav[aria-label="Session history"]').getByText("stage failed")).toHaveCount(0);

  // The session list also falls back to the placeholder for this session.
  await page.getByRole("button", { name: "Back to your sessions" }).click();
  const row = page.locator("li").filter({ has: page.getByRole("button", { name: /Spinach Frittata/ }) });
  await expect(row.getByRole("img")).toHaveCount(0);
  await expect(row.getByTestId("dish-image")).toBeVisible();

  await expectNoA11yViolations(page);
});

/** Part 4 (US4) — the final tab's "Generate photo" control only appears
 * while there's genuinely no photo, regenerates just the image (not the
 * recipe text), and browsing back to a pre-retry checkpoint still shows
 * that checkpoint's own, superseded image (FR-009a, FR-010). */

test("US4: \"Generate photo\" only appears when the image is blank, and regenerating never re-runs the recipe text", async ({
  page,
}) => {
  await startSession(page, ["2 eggs", "spinach"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }

  const finalRecipeSection = page.locator("h3", { hasText: "Final recipe" }).locator("..");
  const originalImage = finalRecipeSection.getByRole("img");
  await expect(originalImage).toBeVisible();

  // Once a real photo exists, "Generate photo" is gone entirely — the old,
  // always-visible full-recipe "Regenerate" control is gone for good too.
  await expect(finalRecipeSection.getByRole("button", { name: "Generate photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Regenerate" })).toHaveCount(0);
});

test("US4: \"Generate photo\" regenerates just the image, reusing the existing recipe as-is, when the photo is blank", async ({
  page,
}) => {
  // The fixture's image-failure sentinel is baked into the recipe's own
  // `toBuy` (lib/agent/fake-model.ts) — since retry-image reuses that exact
  // recipe verbatim, the sentinel persists into the regenerate attempt too,
  // so this deterministically stays blank across both. That's a fixture
  // limitation, not a real-world one (a real image failure has nothing to
  // do with recipe content) — tests/contract/step.test.ts's own retry-image
  // test already covers the "succeeds and produces a new imageId" case at
  // the API level; this test's job is the UI wiring: the button's
  // visibility gating and a full, successful round trip that leaves the
  // recipe untouched.
  await startSession(page, ["2 eggs", "spinach", "e2e-trigger-image-failure"]);
  while (await page.getByRole("button", { name: /^Step \(/ }).isVisible()) {
    await clickStep(page);
  }

  const finalRecipeSection = page.locator("h3", { hasText: "Final recipe" }).locator("..");
  await expect(finalRecipeSection).toBeVisible();
  await expect(finalRecipeSection.getByRole("img")).toHaveCount(0);
  const titleBefore = await finalRecipeSection.locator("p").first().textContent();

  const generateButton = finalRecipeSection.getByRole("button", { name: "Generate photo" });
  await expect(generateButton).toBeVisible();
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/step") && res.request().method() === "POST"),
    generateButton.click(),
  ]);

  // Recipe text is untouched — no second text call happened.
  const titleAfter = await finalRecipeSection.locator("p").first().textContent();
  expect(titleAfter).toBe(titleBefore);

  // Still blank (the sentinel persisted into the reused recipe), so the
  // button is still offered rather than silently disappearing.
  await expect(finalRecipeSection.getByRole("img")).toHaveCount(0);
  await expect(generateButton).toBeVisible();
  await expectNoA11yViolations(page);
});

// FR-009a (browsing to a superseded checkpoint still shows *that*
// checkpoint's own recorded image) is thoroughly covered at the contract
// level instead of here: tests/contract/step.test.ts's retry-image test
// already asserts the pre-retry checkpoint's `dishImage.imageId` stays
// unchanged after a successful regenerate. Reaching that scenario through
// this e2e harness would need a blank-then-successful transition, which
// the fake-model fixture can't produce deterministically (the image-failure
// sentinel is baked into the reused recipe's own `toBuy`, so it persists
// into every retry-image attempt on that same recipe) — a fixture
// limitation, not a real-world one.
