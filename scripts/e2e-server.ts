/**
 * Playwright's `webServer` command (research R14 extended for e2e): starts a
 * real Postgres wire-protocol database (PGlite + a socket server, same
 * helper the Vitest suite uses), runs migrations, builds the app, then
 * serves it with `next start` — a production build, not `next dev`, so the
 * dev-mode toolbar/overlay (a known source of Playwright click flakiness:
 * it can sit on top of the element being clicked right as it animates in)
 * never enters the picture. `DATABASE_URL` points at the ephemeral DB and
 * `RECIPE_AGENT_FAKE_MODEL=1` makes every node use `lib/agent/fake-model.ts`
 * instead of a real OpenRouter call. Never used outside e2e — production
 * never sets `RECIPE_AGENT_FAKE_MODEL`.
 */
import { spawn } from "node:child_process";
import { startTestDb } from "../tests/helpers/test-db";

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const testDb = await startTestDb();
  await testDb.migrate();
  console.log(`[e2e-server] test database ready at ${testDb.connectionString}`);

  const env = {
    ...process.env,
    DATABASE_URL: testDb.connectionString,
    RECIPE_AGENT_FAKE_MODEL: "1",
    MODEL_DEFAULT: "fake/default",
    MODEL_CRITIQUE: "fake/critique",
    MODEL_IMAGE: "fake/image",
    OPENROUTER_API_KEY: "fake-key-not-used-by-fake-model",
    // Required by `lib/image-url.ts` (feature 007) — every `/step` response
    // whose state carries a `dishImage` signs a URL for it, even in fake
    // mode, so this must be set for `finalize` to ever complete a response.
    IMAGE_URL_SECRET: process.env.IMAGE_URL_SECRET ?? "e2e-fake-image-url-secret",
    PUBLIC_URL: process.env.PUBLIC_URL ?? "http://localhost:3000",
    MAX_INGREDIENTS: process.env.MAX_INGREDIENTS ?? "50",
    RATE_MAX_PER_WINDOW: process.env.RATE_MAX_PER_WINDOW ?? "1000",
    DAILY_STAGES_PER_CLIENT: process.env.DAILY_STAGES_PER_CLIENT ?? "10000",
    DAILY_STAGES_GLOBAL: process.env.DAILY_STAGES_GLOBAL ?? "10000",
  };

  console.log("[e2e-server] building...");
  await run("npx", ["next", "build"], env);

  console.log("[e2e-server] starting...");
  const child = spawn("npx", ["next", "start"], {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  let shuttingDown = false;
  const shutdown = async (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    child.kill();
    await testDb.stop();
    process.exit(code);
  };

  process.on("SIGTERM", () => void shutdown(0));
  process.on("SIGINT", () => void shutdown(0));
  child.on("exit", (code) => void shutdown(code ?? 0));
}

main().catch((err) => {
  console.error("[e2e-server] failed to start:", err);
  process.exit(1);
});
