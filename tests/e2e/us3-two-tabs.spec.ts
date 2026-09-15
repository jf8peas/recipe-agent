import { test, expect } from "@playwright/test";
import { startSession, expectNoA11yViolations } from "./helpers";

test("US3 two tabs: a second tab's advance controls disable while the first tab's stage runs", async ({
  context,
  page,
}) => {
  await startSession(page, ["2 eggs", "e2e-slow"]);
  await expect(page.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();

  // A second tab of the same browser (shared localStorage/BroadcastChannel)
  // lands on `/` and resumes the same active session.
  const page2 = await context.newPage();
  await page2.goto("/");
  await expect(page2.getByRole("button", { name: "Step (proposeDirections)" })).toBeVisible();

  await page.getByRole("button", { name: "Step (proposeDirections)" }).click();
  await expect(page2.getByText("This session is running in another tab.")).toBeVisible();
  await expectNoA11yViolations(page2);

  // Once the (deliberately slow) stage finishes, the second tab's note clears.
  await expect(page2.getByText("This session is running in another tab.")).toHaveCount(0, {
    timeout: 10_000,
  });

  await page2.close();
});
