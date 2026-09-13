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
      ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: true } : undefined,
    });
  }
  return g.__recipeAgentPool;
}
