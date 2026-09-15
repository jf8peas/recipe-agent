import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";
import { getSessionById } from "../../lib/db/sessions";

type Responder = () => unknown;
const responders = new Map<string, Responder[]>();
function queueResponse(nodeName: string, respond: Responder) {
  const queue = responders.get(nodeName) ?? [];
  queue.push(respond);
  responders.set(nodeName, queue);
}

vi.mock("../../lib/agent/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/agent/models")>();
  return {
    ...actual,
    createChatModel: () => ({
      withStructuredOutput: (_schema: unknown, opts: { name: string }) => ({
        invoke: async () => {
          const queue = responders.get(opts.name);
          const respond = queue?.shift();
          if (!respond) throw new Error(`no scripted response queued for node "${opts.name}"`);
          return respond();
        },
      }),
    }),
  };
});

let testDb: TestDb;
let startPOST: typeof import("../../app/api/recipe/start/route").POST;
let purgeGET: typeof import("../../app/api/cron/purge/route").GET;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_MAX_PER_WINDOW = "1000";
  process.env.CRON_SECRET = "test-secret";
  process.env.SESSION_PURGE_DAYS = "90";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ GET: purgeGET } = await import("../../app/api/cron/purge/route"));
});

afterAll(async () => {
  await getPool().end();
  await testDb.stop();
});

const okIngredient = { raw: "2 eggs", name: "egg", quantity: "2", pantryStaple: false, usable: true, reason: null };

async function createSession(clientId: string) {
  queueResponse("parseIngredients", () => ({ ingredients: [okIngredient] }));
  const res = await startPOST(
    new Request("http://localhost/api/recipe/start", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Client-Id": clientId },
      body: JSON.stringify({ ingredients: ["2 eggs"] }),
    }),
  );
  return res.json();
}

function purgeReq(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return new Request("http://localhost/api/cron/purge", { headers });
}

describe("GET /api/cron/purge", () => {
  it("401s without the correct secret", async () => {
    expect((await purgeGET(purgeReq())).status).toBe(401);
    expect((await purgeGET(purgeReq("wrong-secret"))).status).toBe(401);
  });

  it("purges only sessions past SESSION_PURGE_DAYS, leaving fresh ones alone", async () => {
    const stale = await createSession("client-purge-stale");
    const fresh = await createSession("client-purge-fresh");

    await getPool().query(
      "UPDATE sessions SET last_activity = now() - interval '91 days' WHERE session_id = $1",
      [stale.sessionId],
    );

    const res = await purgeGET(purgeReq("test-secret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.purged).toBeGreaterThanOrEqual(1);

    expect(await getSessionById(stale.sessionId, getPool())).toBeNull();
    expect(await getSessionById(fresh.sessionId, getPool())).not.toBeNull();
  });
});
