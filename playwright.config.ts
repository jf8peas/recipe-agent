import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // The e2e server's database is a single ephemeral PGlite instance (research
  // R14) — it can't handle the concurrent query load `fullyParallel` (or
  // multiple workers) throws at it under Playwright's default settings
  // (observed: "portal cannot be run" / "unnamed prepared statement does not
  // exist" protocol-state corruption under concurrent requests). Run serially.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.PUBLIC_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    // Ephemeral PGlite DB + a production build (`next build && next start`,
    // not `next dev` — its toolbar/overlay is a known source of Playwright
    // click flakiness) with the deterministic fake model
    // (RECIPE_AGENT_FAKE_MODEL=1) — see scripts/e2e-server.ts. Never the
    // real dev server / real database.
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
