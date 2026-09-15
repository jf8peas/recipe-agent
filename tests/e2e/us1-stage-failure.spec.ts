import { test, expect } from "@playwright/test";
import { startSession, clickStep, nonce, expectNoA11yViolations } from "./helpers";

test("US1 stage failure: StageFailureBanner shows the reason, and Retry succeeds", async ({ page }) => {
  const n = nonce();
  // Fails `proposeDirections` exactly once (research R3/R4's retry design —
  // "bogus MODEL_DEFAULT" from the task description, reproduced here as a
  // deterministic fake-model fixture rather than a real broken model id).
  await startSession(page, ["2 eggs", `e2e-trigger-failure-proposeDirections-${n}`]);
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();
  await clickStep(page);

  // exact: true — the (collapsed but present-in-DOM) History panel's kind
  // label for this same entry reads "[stage failed]" and would otherwise
  // also match a substring search.
  await expect(page.getByText("Stage failed", { exact: true })).toBeVisible();
  await expect(page.getByText("Simulated failure (e2e fixture)")).toBeVisible();
  const retryButton = page.getByRole("button", { name: "Retry" });
  await expect(retryButton).toBeVisible();
  await expectNoA11yViolations(page);

  // force: true — see clickStep's comment in helpers.ts: Playwright's
  // pre-click stability check can otherwise retry the click itself (a
  // history-panel re-render keeps nudging the button), risking a real
  // duplicate request.
  await retryButton.click({ force: true });
  await expect(retryButton).toHaveCount(0);
  // Wait for a settled state, not just "Step (draftRecipe)" directly —
  // RunningStage (no matching button at all) shows in between, per
  // clickStep's comment in helpers.ts.
  await expect(
    page.getByRole("button", { name: /^Step \(/ }).or(page.getByRole("button", { name: "Start a new session" })),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Step (draftRecipe)" })).toBeVisible();
});
