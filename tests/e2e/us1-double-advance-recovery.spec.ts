import { test, expect } from "@playwright/test";
import { startSession, expectNoA11yViolations } from "./helpers";

/**
 * Reproduces the exact race a real double-advance produces (e.g. Auto-run
 * and a manual click overlapping, or a retried network request): a second
 * `/step` call racing the same `fromCheckpointId` gets the server's own
 * `already-advanced` 409. Before this fix, `useSession.step()` just set the
 * error and left `snapshot` frozen at the pre-race state, so the UI got
 * stuck showing a stale graph/tabs under a red error banner forever.
 */
test("a raced already-advanced 409 self-heals to the real state instead of getting stuck", async ({ page }) => {
  await startSession(page, ["2 eggs", "spinach"]);
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();

  // Intercept the UI's own /step call: before letting it through, fire an
  // identical duplicate request first (same fromCheckpointId) so it's the
  // one that actually advances the branch — the UI's own request, once
  // released, necessarily loses the race and gets 409'd server-side.
  let raced = false;
  await page.route("**/api/recipe/*/step", async (route) => {
    const request = route.request();
    if (!raced && request.method() === "POST") {
      raced = true;
      const headers = request.headers();
      await page.request.post(request.url(), {
        headers: {
          "x-client-id": headers["x-client-id"] ?? "",
          "content-type": "application/json",
        },
        data: request.postDataJSON(),
      });
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Step (proposeDirections)" }).click({ force: true });

  // Self-healed: the UI reflects the real (already-advanced) state — the
  // next real stage's own Step button — not stuck on the pre-race view.
  await expect(page.getByRole("button", { name: "Step (selectDirection)" })).toBeVisible();
  // No leftover "already advanced" error banner sitting over the
  // now-correct view (Next's own always-present, always-empty route
  // announcer also has role="alert", so scope by the error text itself).
  await expect(page.getByText("This step was already advanced")).toHaveCount(0);
  await expectNoA11yViolations(page);
});
