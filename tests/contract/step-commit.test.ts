import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";

type Responder = () => unknown;
const responders = new Map<string, Responder[]>();
const invocationCounts = new Map<string, number>();
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
          invocationCounts.set(opts.name, (invocationCounts.get(opts.name) ?? 0) + 1);
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
let commitPOST: typeof import("../../app/api/recipe/[sid]/step/commit/route").POST;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_MAX_PER_WINDOW = "1000";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ POST: commitPOST } = await import("../../app/api/recipe/[sid]/step/commit/route"));
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
  const res = await startPOST(req("http://localhost/api/recipe/start", { ingredients: ["2 eggs"] }, clientId));
  const json = await res.json();
  return { sid: json.sessionId as string, branchId: json.branchId as string, checkpointId: json.checkpointId as string, state: json.state };
}

describe("POST /api/recipe/:sid/step/commit", () => {
  it("persists a held state without re-invoking the node or recording usage", async () => {
    const { sid, branchId, checkpointId, state } = await createSession("client-commit");
    invocationCounts.clear();

    const heldState = { ...state, directions: [{ title: "Frittata", summary: "s", whyItFits: "w" }, { title: "Omelet", summary: "s2", whyItFits: "w2" }] };

    const res = await commitPOST(
      req(
        `http://localhost/api/recipe/${sid}/step/commit`,
        { branchId, fromCheckpointId: checkpointId, heldState },
        "client-commit",
      ),
      { params: Promise.resolve({ sid }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.checkpointId).toBe("string");
    expect(Array.isArray(json.timeline)).toBe(true);

    // No model call happened during commit (proposeDirections never queued/invoked).
    expect(invocationCounts.get("proposeDirections")).toBeUndefined();
  });

  it("401s when X-Client-Id is missing", async () => {
    const res = await commitPOST(
      new Request("http://localhost/api/recipe/x/step/commit", {
        method: "POST",
        body: JSON.stringify({ branchId: "x", fromCheckpointId: "x", heldState: {} }),
      }),
      { params: Promise.resolve({ sid: "x" }) },
    );
    expect(res.status).toBe(401);
  });

  it("404s for an unknown session", async () => {
    const { state } = await createSession("client-commit-404-source");
    const res = await commitPOST(
      req(
        "http://localhost/api/recipe/no-such-session/step/commit",
        { branchId: "no-such-branch", fromCheckpointId: "no-such-checkpoint", heldState: state },
        "client-commit-404-source",
      ),
      { params: Promise.resolve({ sid: "no-such-session" }) },
    );
    expect(res.status).toBe(404);
  });
});
