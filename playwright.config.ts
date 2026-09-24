import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  // Every real spec lives in ./tests/e2e (every feature's quickstart.md
  // documents `npx playwright test tests/e2e/...`); ./tests/playwright is
  // leftover initial scaffolding (example.spec.ts/inspect.spec.ts), never a
  // real suite.
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* One worker always — `scripts/e2e-server.ts` backs every spec with a
   * single shared pglite instance (proxied over its own socket server),
   * which isn't safe under concurrent connections from multiple workers
   * (observed: sporadic "unnamed prepared statement does not exist" from
   * the pg driver under 2+ parallel workers). Not a per-feature flake — a
   * structural property of that single shared DB, so this applies
   * regardless of CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. Every real spec
     * (tests/e2e/*.spec.ts) targets the local fake-model server started by
     * `webServer` below, never the deployed app — production has no
     * RECIPE_AGENT_FAKE_MODEL and would otherwise be driven by these specs'
     * real HTTP actions. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Starts the fake-model server (`scripts/e2e-server.ts`) — an ephemeral
   * pglite DB, a production build, `RECIPE_AGENT_FAKE_MODEL=1` — before any
   * spec runs, and tears it down after. `reuseExistingServer` lets a
   * developer run `tsx scripts/e2e-server.ts` in one terminal and `playwright
   * test` in another without waiting for a fresh build every time. */
  webServer: {
    command: 'npx tsx scripts/e2e-server.ts',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
