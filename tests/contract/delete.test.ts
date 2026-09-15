import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";
import { getSessionById } from "../../lib/db/sessions";
import { getBranchesForSession } from "../../lib/db/branches";

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
let deletePOST: typeof import("../../app/api/recipe/[sid]/delete/route").POST;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_MAX_PER_WINDOW = "1000";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ POST: deletePOST } = await import("../../app/api/recipe/[sid]/delete/route"));
});

afterAll(async () => {
  await getPool().end();
  await testDb.stop();
});

function req(url: string, body: unknown, clientId = "client-a"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Client-Id": clientId },
    body: JSON.stringify(body),
  });
}

function deleteReq(sid: string, clientId = "client-a"): Promise<Response> {
  return deletePOST(req(`http://localhost/api/recipe/${sid}/delete`, {}, clientId), {
    params: Promise.resolve({ sid }),
  });
}

const okIngredient = { raw: "2 eggs", name: "egg", quantity: "2", pantryStaple: false, usable: true, reason: null };

async function createSession(clientId: string) {
  queueResponse("parseIngredients", () => ({ ingredients: [okIngredient] }));
  const res = await startPOST(req("http://localhost/api/recipe/start", { ingredients: ["2 eggs"] }, clientId));
  return res.json();
}

describe("POST /api/recipe/:sid/delete", () => {
  it("401s when X-Client-Id is missing", async () => {
    const res = await deletePOST(new Request("http://localhost/api/recipe/x/delete", { method: "POST" }), {
      params: Promise.resolve({ sid: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("404s for an unknown session", async () => {
    const res = await deleteReq("no-such-session", "client-a");
    expect(res.status).toBe(404);
  });

  it("404s when the caller does not own the session", async () => {
    const { sessionId } = await createSession("client-delete-owner");
    const res = await deleteReq(sessionId, "client-delete-intruder");
    expect(res.status).toBe(404);
  });

  it("deletes the session, its branches, and its checkpoints", async () => {
    const { sessionId, branchId } = await createSession("client-delete-basic");

    const res = await deleteReq(sessionId, "client-delete-basic");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);

    expect(await getSessionById(sessionId, getPool())).toBeNull();
    expect(await getBranchesForSession(sessionId, getPool())).toEqual([]);

    const pool = getPool();
    const { rows } = await pool.query("SELECT 1 FROM checkpoints WHERE thread_id = $1", [branchId]);
    expect(rows).toHaveLength(0);
  });

  it("is idempotent: a second delete 404s once the session is gone", async () => {
    const { sessionId } = await createSession("client-delete-twice");

    const first = await deleteReq(sessionId, "client-delete-twice");
    expect(first.status).toBe(200);

    const second = await deleteReq(sessionId, "client-delete-twice");
    expect(second.status).toBe(404);
  });
});
