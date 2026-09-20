/**
 * Captures the app's current UI into `design/_context/` — the bundle you hand
 * up to Claude Design so it designs against what exists rather than inventing
 * a visual language from scratch.
 *
 * Recommended: run it against the e2e server, not `next dev`.
 *
 *   npx tsx scripts/e2e-server.ts   # in one terminal
 *   npm run design:context          # in another
 *
 * That server (see its own header) gives an ephemeral PGlite database and the
 * deterministic fake model, so a capture run needs no .env, spends no
 * OpenRouter credit, and touches no real data. It also serves a production
 * build, so Next's dev indicator stays out of every screenshot.
 *
 * `next dev` works too if .env is filled in, and BASE_URL=https://… points at
 * a deployed app — but that spends real model calls and writes real rows.
 *
 * Output (gitignored — regenerate, don't commit):
 *   design/_context/tokens.css      copy of app/tokens.css, for the design-system import
 *   design/_context/screens/*.png   every screen, desktop + mobile, light + dark
 *
 * The agent runs ONCE, in the first pass. The other three passes reuse that
 * session from storage state, so the matrix costs one run, not four.
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, rm, copyFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const INGREDIENTS = process.env.DESIGN_INGREDIENTS ?? "2 eggs\nspinach\nfeta cheese\nsourdough";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "design", "_context");
const SHOTS = path.join(OUT, "screens");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

type Pass = { viewport: keyof typeof VIEWPORTS; scheme: "light" | "dark" };

/** First pass drives the agent; the rest re-photograph the same session. */
const PASSES: Pass[] = [
  { viewport: "desktop", scheme: "light" },
  { viewport: "desktop", scheme: "dark" },
  { viewport: "mobile", scheme: "light" },
  { viewport: "mobile", scheme: "dark" },
];

const STEP_LABEL = /^Step \(/;
const DONE_LABEL = "Start a new session";

async function shot(page: Page, name: string, pass: Pass) {
  const file = `${name}__${pass.viewport}-${pass.scheme}.png`;
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
  console.log("  ▸", file);
}

/**
 * True once the app is idle: a session view with no stage in flight. Treats a
 * visible [role=alert] as an outcome too — otherwise a failed API call (no
 * OPENROUTER_API_KEY, unreachable database) just hangs until the timeout and
 * reports nothing about what the app actually said.
 */
async function settle(page: Page, timeout = 120_000) {
  try {
    await page.waitForFunction(
      (done: string) => {
        const labels = [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
        const busy = labels.some((t) => t === "Working…" || t === "Saving…");
        const ready = labels.some((t) => /^Step \(/.test(t) || t === done);
        return document.querySelector("[role=alert]") !== null || (ready && !busy);
      },
      DONE_LABEL,
      { timeout },
    );
  } catch {
    const seen = (await page.innerText("body")).trim().replace(/\n+/g, " · ");
    throw new Error(`Timed out waiting for the app to become ready.\nOn screen: ${seen}`);
  }

  const alert = page.locator("[role=alert]");
  if (await alert.count()) {
    throw new Error(
      `The app reported an error: "${(await alert.first().innerText()).trim()}"\n` +
        "Check the server terminal — a 500 from /api/recipe/start usually means a missing\n" +
        "OPENROUTER_API_KEY or an unreachable DATABASE_URL. Running the capture against\n" +
        "`npx tsx scripts/e2e-server.ts` avoids both.",
    );
  }
}

/** The `/` route switches views client-side, so "navigation" is clicking. */
async function toEntryForm(page: Page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  const newSession = page.getByRole("button", { name: DONE_LABEL });
  if (await newSession.count()) await newSession.first().click();
  await page.waitForSelector("#ingredients");
}

async function toSessionList(page: Page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  const back = page.getByRole("button", { name: "Back to your sessions" });
  if (await back.count()) await back.first().click();
  await page.waitForSelector("text=Your sessions").catch(() => {
    console.log("  (no session list — storage state had no sessions)");
  });
}

async function captureAbout(page: Page, pass: Pass) {
  await page.getByRole("button", { name: "About This App" }).click();
  await page.waitForSelector("text=How it works");
  await page.waitForTimeout(600);
  await shot(page, "07-about", pass);
  await page.getByRole("button", { name: "Return to App" }).click();
}

/** Pass 1: drive a real run and photograph each state as it goes by. */
async function seedAndCapture(page: Page, pass: Pass) {
  await toEntryForm(page);
  await page.fill("#ingredients", INGREDIENTS);
  await shot(page, "01-entry-form", pass);

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await settle(page);
  await shot(page, "02-session-first-stage", pass);

  // RunningStage only exists mid-flight, so grab it without awaiting the stage.
  const step = page.getByRole("button", { name: STEP_LABEL });
  if (await step.count()) {
    await step.first().click();
    await page.waitForTimeout(700);
    await shot(page, "03-running-stage", pass);
    await settle(page);
  }

  const history = page.locator("summary", { hasText: "History" });
  if (await history.count()) {
    await history.first().click();
    await page.waitForTimeout(400);
    await shot(page, "04-history-timeline", pass);
    await history.first().click();
  }

  const edit = page.getByRole("button", { name: "Edit", exact: true });
  if (await edit.count()) {
    await edit.first().click();
    await page.waitForTimeout(400);
    await shot(page, "05-edit-mode", pass);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }

  // Graph is parseIngredients → … → finalize, 7 nodes; 12 is slack, not a guess.
  for (let i = 0; i < 12; i++) {
    const next = page.getByRole("button", { name: STEP_LABEL });
    if (!(await next.count()) || (await next.first().isDisabled())) break;
    await next.first().click();
    await settle(page);
  }
  await shot(page, "06-final-recipe", pass);

  await captureAbout(page, pass);
  await toSessionList(page);
  await shot(page, "08-session-list", pass);
}

/** Passes 2–4: same session, new viewport/scheme, no agent calls. */
async function recapture(page: Page, pass: Pass) {
  await toSessionList(page);
  await shot(page, "08-session-list", pass);

  const open = page.locator("li button").first();
  if (await open.count()) {
    await open.click();
    await settle(page).catch(() => {});
    await shot(page, "06-final-recipe", pass);

    const history = page.locator("summary", { hasText: "History" });
    if (await history.count()) {
      await history.first().click();
      await page.waitForTimeout(400);
      await shot(page, "04-history-timeline", pass);
      await history.first().click();
    }
    await captureAbout(page, pass);
  }

  await toEntryForm(page);
  await page.fill("#ingredients", INGREDIENTS);
  await shot(page, "01-entry-form", pass);
}

async function main() {
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });
  await copyFile(path.join(ROOT, "app", "tokens.css"), path.join(OUT, "tokens.css"));
  console.log(`Capturing ${BASE_URL} → design/_context/`);

  const browser = await chromium.launch();
  let storageState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

  for (const [i, pass] of PASSES.entries()) {
    console.log(`\n${pass.viewport} / ${pass.scheme}`);
    const context = await browser.newContext({
      viewport: VIEWPORTS[pass.viewport],
      colorScheme: pass.scheme,
      reducedMotion: "reduce",
      deviceScaleFactor: 2,
      storageState,
    });
    const page = await context.newPage();
    if (i === 0) await seedAndCapture(page, pass);
    else await recapture(page, pass);
    storageState = await context.storageState();
    await context.close();
  }

  await browser.close();
  console.log("\nDone. Upload design/_context/tokens.css as the design system,");
  console.log("and attach design/_context/screens/ to the design conversation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
