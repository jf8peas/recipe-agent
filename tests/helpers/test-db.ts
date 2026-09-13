import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

/**
 * Spins up an in-memory Postgres-wire-compatible database (PGlite + a socket
 * server) for tests, so integration/contract tests exercise real `pg`/
 * `PostgresSaver` SQL without a live Neon database (research R14).
 */
export async function startTestDb() {
  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1", maxConnections: 5 });
  await server.start();
  // getServerConn() returns "host:port"; build a full connection string (no TLS).
  const connectionString = `postgres://postgres@${server.getServerConn()}/postgres`;

  return {
    connectionString,
    async migrate() {
      const checkpointer = PostgresSaver.fromConnString(connectionString);
      await checkpointer.setup();
      await checkpointer.end();

      const migrationsDir = join(import.meta.dirname, "..", "..", "lib", "db", "migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const file of files) {
        await db.exec(readFileSync(join(migrationsDir, file), "utf-8"));
      }
    },
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}

export type TestDb = Awaited<ReturnType<typeof startTestDb>>;
