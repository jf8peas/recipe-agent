import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";
import { insertSession } from "../../lib/db/sessions";
import { insertBranch } from "../../lib/db/branches";

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
let stateGET: typeof import("../../app/api/recipe/[sid]/state/route").GET;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_MAX_PER_WINDOW = "1000";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ GET: stateGET } = await import("../../app/api/recipe/[sid]/state/route"));
});

afterAll(async () => {
  await getPool().end();
  await testDb.stop();
});

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

function stateUrl(sid: string, branchId: string, checkpointId: string): string {
  const url = new URL(`http://localhost/api/recipe/${sid}/state`);
  url.searchParams.set("branchId", branchId);
  url.searchParams.set("checkpointId", checkpointId);
  return url.toString();
}

describe("GET /api/recipe/:sid/state", () => {
  it("401s when X-Client-Id is missing", async () => {
    const res = await stateGET(new Request(stateUrl("x", "x", "x")), {
      params: Promise.resolve({ sid: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the exact snapshot for a valid checkpoint", async () => {
    const { sid, branchId, checkpointId } = await createSession("client-state-ok");
    const res = await stateGET(
      new Request(stateUrl(sid, branchId, checkpointId), { headers: { "X-Client-Id": "client-state-ok" } }),
      { params: Promise.resolve({ sid }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.checkpointId).toBe(checkpointId);
    expect(json.state.ingredients[0].name).toBe("egg");
    expect(json.next).toEqual(["proposeDirections"]);
    expect(json.kind).toBe("normal");
  });

  it("400s for an unknown checkpoint", async () => {
    const { sid, branchId } = await createSession("client-state-unknown");
    const res = await stateGET(
      new Request(stateUrl(sid, branchId, "no-such-checkpoint"), {
        headers: { "X-Client-Id": "client-state-unknown" },
      }),
      { params: Promise.resolve({ sid }) },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("unknown-checkpoint");
  });

  it("404s when branchId belongs to a different session", async () => {
    const a = await createSession("client-state-a");
    const b = await createSession("client-state-b");
    // b's own client requests a's session using a's branchId/checkpointId,
    // scoped under b's own sid — mismatched session/branch pairing.
    await insertSession({ sessionId: "extra-session", clientId: "client-state-b", rootThreadId: "extra-thread" }, getPool());
    await insertBranch({ threadId: "extra-thread", sessionId: "extra-session" }, getPool());

    const res = await stateGET(
      new Request(stateUrl("extra-session", a.branchId, a.checkpointId), {
        headers: { "X-Client-Id": "client-state-b" },
      }),
      { params: Promise.resolve({ sid: "extra-session" }) },
    );
    expect(res.status).toBe(404);
    void b;
  });
});
