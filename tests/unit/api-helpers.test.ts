import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { getClientId, requireOwnedSession } from "../../lib/api-helpers";
import { insertSession } from "../../lib/db/sessions";
import { insertBranch } from "../../lib/db/branches";
import { startTestDb, type TestDb } from "../helpers/test-db";

describe("getClientId", () => {
  it("extracts the header", () => {
    const req = new Request("http://localhost/api/x", { headers: { "X-Client-Id": "abc" } });
    expect(getClientId(req)).toBe("abc");
  });

  it("returns null when missing", () => {
    const req = new Request("http://localhost/api/x");
    expect(getClientId(req)).toBeNull();
  });

  it("returns null when blank", () => {
    const req = new Request("http://localhost/api/x", { headers: { "X-Client-Id": "   " } });
    expect(getClientId(req)).toBeNull();
  });
});

describe("requireOwnedSession", () => {
  let testDb: TestDb;
  let pool: Pool;

  beforeAll(async () => {
    testDb = await startTestDb();
    await testDb.migrate();
    pool = new Pool({ connectionString: testDb.connectionString });

    await insertSession(
      { sessionId: "sess-1", clientId: "client-a", rootThreadId: "thread-1" },
      pool,
    );
    await insertBranch({ threadId: "thread-1", sessionId: "sess-1" }, pool);
    await insertBranch(
      { threadId: "thread-2", sessionId: "sess-1", parentThreadId: "thread-1" },
      pool,
    );
    await insertSession(
      { sessionId: "sess-2", clientId: "client-b", rootThreadId: "thread-3" },
      pool,
    );
    await insertBranch({ threadId: "thread-3", sessionId: "sess-2" }, pool);
  });

  afterAll(async () => {
    await pool.end();
    await testDb.stop();
  });

  it("404s for an unknown session", async () => {
    const result = await requireOwnedSession("no-such-session", "client-a", null, pool);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("404s when the client does not own the session", async () => {
    const result = await requireOwnedSession("sess-1", "client-b", null, pool);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("succeeds for the owning client with no branchId", async () => {
    const result = await requireOwnedSession("sess-1", "client-a", null, pool);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.session_id).toBe("sess-1");
      expect(result.branch).toBeNull();
    }
  });

  it("succeeds when branchId belongs to the session", async () => {
    const result = await requireOwnedSession("sess-1", "client-a", "thread-2", pool);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.branch?.thread_id).toBe("thread-2");
  });

  it("404s when branchId belongs to a different session", async () => {
    const result = await requireOwnedSession("sess-1", "client-a", "thread-3", pool);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });

  it("404s when branchId does not exist", async () => {
    const result = await requireOwnedSession("sess-1", "client-a", "no-such-thread", pool);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });
});
