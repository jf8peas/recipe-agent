import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

/**
 * Idempotent migration routine (constitution Principle III: `setup()` and
 * schema changes run here, never inside a request handler).
 *
 * 1. `checkpointer.setup()` — creates/updates the LangGraph checkpoint tables.
 * 2. Applies `lib/db/migrations/*.sql` in filename order, tracked in
 *    `_app_migrations` so a re-run is a no-op.
 */
export async function runMigrations(connectionString: string, log: (msg: string) => void = console.log) {
  const checkpointer = PostgresSaver.fromConnString(connectionString);
  await checkpointer.setup();
  await checkpointer.end();
  log("checkpointer.setup() complete.");

  const pool = new Pool({ connectionString });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _app_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = join(import.meta.dirname, "..", "lib", "db", "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const applied: string[] = [];
    for (const file of files) {
      const { rows } = await pool.query("SELECT 1 FROM _app_migrations WHERE id = $1", [file]);
      if (rows.length > 0) {
        log(`skip (already applied): ${file}`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      log(`applying: ${file}`);
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query("INSERT INTO _app_migrations (id) VALUES ($1)", [file]);
        await pool.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    }
    log("App migrations complete.");
    return { applied };
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
      break;
    } catch {
      // missing locally is fine — env vars may come from the shell/CI
    }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  runMigrations(connectionString)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
