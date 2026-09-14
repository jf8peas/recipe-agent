import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";
import { insertBranch } from "../../lib/db/branches";
import { forkReplay } from "../../lib/fork-replay";
import { getGraph } from "../../lib/agent/runtime";
import { mintThreadId } from "../../lib/ids";

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
let historyGET: typeof import("../../app/api/recipe/[sid]/history/route").GET;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_MAX_PER_WINDOW = "1000";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ GET: historyGET } = await import("../../app/api/recipe/[sid]/history/route"));
});

afterAll(async () => {
  await getPool().end();
  await testDb.stop();
});

function req(url: string, clientId = "client-a"): Request {
  return new Request(url, { headers: { "X-Client-Id": clientId } });
}

function postReq(url: string, body: unknown, clientId = "client-a"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Client-Id": clientId },
    body: JSON.stringify(body),
  });
}

const okIngredient = {
  raw: "2 eggs",
  name: "egg",
  quantity: "2",
  pantryStaple: false,
  usable: true,
  reason: null,
};

async function createSession(clientId: string) {
  queueResponse("parseIngredients", () => ({ ingredients: [okIngredient] }));
  const res = await startPOST(postReq("http://localhost/api/recipe/start", { ingredients: ["2 eggs"] }, clientId));
  const json = await res.json();
  return { sid: json.sessionId as string, branchId: json.branchId as string, checkpointId: json.checkpointId as string };
}

describe("GET /api/recipe/:sid/history", () => {
  it("401s when X-Client-Id is missing", async () => {
    const res = await historyGET(new Request("http://localhost/api/recipe/x/history"), {
      params: Promise.resolve({ sid: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("404s for an unknown session", async () => {
    const res = await historyGET(req("http://localhost/api/recipe/no-such-session/history"), {
      params: Promise.resolve({ sid: "no-such-session" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the single root branch's timeline for a fresh session", async () => {
    const { sid, branchId } = await createSession("client-history-single");
    const res = await historyGET(
      req(`http://localhost/api/recipe/${sid}/history`, "client-history-single"),
      { params: Promise.resolve({ sid }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.branches).toHaveLength(1);
    expect(json.branches[0].threadId).toBe(branchId);
    expect(json.branches[0].parentThreadId).toBeNull();
    expect(json.timeline.length).toBeGreaterThan(0);
    expect(json.timeline.every((e: { threadId: string }) => e.threadId === branchId)).toBe(true);
  });

  it("includes entries from both threads when a session has a forked branch", async () => {
    const { sid, branchId, checkpointId } = await createSession("client-history-fork");

    const newThreadId = mintThreadId();
    await forkReplay(getGraph(), {
      sourceThreadId: branchId,
      checkpointId,
      newThreadId,
      patch: { ingredients: [{ ...okIngredient, name: "corrected egg" }] },
    });
    await insertBranch(
      {
        threadId: newThreadId,
        sessionId: sid,
        parentThreadId: branchId,
        forkedFromCheckpointId: checkpointId,
      },
      getPool(),
    );

    const res = await historyGET(
      req(`http://localhost/api/recipe/${sid}/history`, "client-history-fork"),
      { params: Promise.resolve({ sid }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.branches).toHaveLength(2);

    const threadIds = new Set(json.timeline.map((e: { threadId: string }) => e.threadId));
    expect(threadIds).toEqual(new Set([branchId, newThreadId]));
  });
});
