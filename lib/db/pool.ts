import { Pool } from "pg";

/**
 * Module-scope Postgres pool, cached on `globalThis` so it survives Next.js
 * dev-mode HMR and warm serverless invocations reuse it (constitution
 * Principle III — never create a pool per request).
 */
const g = globalThis as unknown as { __recipeAgentPool?: Pool };

export function getPool(): Pool {
  if (!g.__recipeAgentPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    g.__recipeAgentPool = new Pool({
      connectionString,
      max: 3,
      // Matches any explicit `sslmode=` value (Neon's own connection
      // strings), not just the literal `require` — a plain substring check
      // on `"sslmode=require"` would silently stop matching the moment a
      // deployment switches to `verify-full` (recommended: `pg-connection-
      // string` currently treats `require`/`prefer`/`verify-ca` as aliases
      // for `verify-full` but warns that this stops being true in a future
      // major version), quietly falling through to the parser's own default
      // instead of this explicit `rejectUnauthorized: true`. Absent
      // entirely for the local pglite test harness's bare
      // `postgres://postgres@127.0.0.1:<port>/postgres` (no TLS at all).
      ssl: /[?&]sslmode=/.test(connectionString) ? { rejectUnauthorized: true } : undefined,
    });
  }
  return g.__recipeAgentPool;
}
