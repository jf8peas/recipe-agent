import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "../../scripts/migrate";
import { startTestDb, type TestDb } from "../helpers/test-db";

describe("runMigrations", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  it("creates the checkpointer tables and app tables, and is idempotent on re-run", async () => {
    const first = await runMigrations(testDb.connectionString, () => {});
    expect(first.applied.sort()).toEqual([
      "0001_sessions.sql",
      "0002_usage_events.sql",
      "0003_branches.sql",
      "0004_dish_images.sql",
    ]);

    const second = await runMigrations(testDb.connectionString, () => {});
    expect(second.applied).toEqual([]);

    const pool = new Pool({ connectionString: testDb.connectionString });
    try {
      const tables = await pool.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      );
      const names = tables.rows.map((r) => r.table_name);
      expect(names).toContain("sessions");
      expect(names).toContain("branches");
      expect(names).toContain("usage_events");
      expect(names).toContain("checkpoints");
      expect(names).toContain("images");
      expect(names).toContain("_app_migrations");
    } finally {
      await pool.end();
    }
  });
});
