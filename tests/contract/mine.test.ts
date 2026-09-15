import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";

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
let mineGET: typeof import("../../app/api/recipe/mine/route").GET;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_MAX_PER_WINDOW = "1000";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ GET: mineGET } = await import("../../app/api/recipe/mine/route"));
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

const okIngredient = { raw: "2 eggs", name: "egg", quantity: "2", pantryStaple: false, usable: true, reason: null };

async function createSession(clientId: string) {
  queueResponse("parseIngredients", () => ({ ingredients: [okIngredient] }));
  const res = await startPOST(postReq("http://localhost/api/recipe/start", { ingredients: ["2 eggs"] }, clientId));
  return res.json();
}

describe("GET /api/recipe/mine", () => {
  it("401s when X-Client-Id is missing", async () => {
    const res = await mineGET(new Request("http://localhost/api/recipe/mine"));
    expect(res.status).toBe(401);
  });

  it("returns only the caller's sessions, never another owner's", async () => {
    await createSession("client-mine-a");
    await createSession("client-mine-a");
    await createSession("client-mine-b");

    const res = await mineGET(
      new Request("http://localhost/api/recipe/mine", { headers: { "X-Client-Id": "client-mine-a" } }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toHaveLength(2);
    for (const s of json.sessions) {
      expect(typeof s.sessionId).toBe("string");
      expect(typeof s.lastActivity).toBe("string");
      expect(s.status).toBe("active");
    }

    const resB = await mineGET(
      new Request("http://localhost/api/recipe/mine", { headers: { "X-Client-Id": "client-mine-b" } }),
    );
    const jsonB = await resB.json();
    expect(jsonB.sessions).toHaveLength(1);
  });

  it("returns an empty list for a client with no sessions", async () => {
    const res = await mineGET(
      new Request("http://localhost/api/recipe/mine", { headers: { "X-Client-Id": "client-mine-nobody" } }),
    );
    const json = await res.json();
    expect(json.sessions).toEqual([]);
  });
});
