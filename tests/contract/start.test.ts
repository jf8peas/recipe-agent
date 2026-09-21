import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";
import { getByOwner } from "../../lib/db/sessions";

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
let POST: typeof import("../../app/api/recipe/start/route").POST;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_WINDOW_SECONDS = "60";
  process.env.RATE_MAX_PER_WINDOW = "2";
  process.env.MAX_INGREDIENTS = "5";
  process.env.MAX_INGREDIENT_LENGTH = "20";
  ({ POST } = await import("../../app/api/recipe/start/route"));
});

afterAll(async () => {
  await getPool().end();
  await testDb.stop();
});

function request(body: unknown, clientId: string | null = "client-a"): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (clientId) headers["X-Client-Id"] = clientId;
  return new Request("http://localhost/api/recipe/start", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/recipe/start", () => {
  it("401s when X-Client-Id is missing", async () => {
    const res = await POST(request({ ingredients: ["egg"] }, null));
    expect(res.status).toBe(401);
  });

  it("400s on an empty ingredient list", async () => {
    const res = await POST(request({ ingredients: [] }, "client-empty"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("no-ingredients");
  });

  it("400s over the configured maximum, stating the max", async () => {
    const res = await POST(
      request({ ingredients: ["a", "b", "c", "d", "e", "f"] }, "client-toomany"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("too-many-ingredients");
    expect(json.max).toBe(5);
  });

  it("400s on an ingredient line over the configured max length, stating the max", async () => {
    const res = await POST(
      request({ ingredients: ["a normal one", "this single ingredient line is way too long"] }, "client-toolong"),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("ingredient-too-long");
    expect(json.max).toBe(20);
  });

  it("happy path: creates a session/branch, runs parseIngredients, returns the contract shape", async () => {
    queueResponse("parseIngredients", () => ({
      ingredients: [{ raw: "2 eggs", name: "egg", quantity: "2", pantryStaple: false, usable: true, reason: null }],
    }));

    const res = await POST(request({ ingredients: ["2 eggs"] }, "client-happy"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(typeof json.sessionId).toBe("string");
    expect(typeof json.branchId).toBe("string");
    expect(typeof json.checkpointId).toBe("string");
    expect(json.state.ingredients[0].name).toBe("egg");
    expect(json.next).toEqual(["proposeDirections"]);
    expect(Array.isArray(json.timeline)).toBe(true);
    expect(json.timeline.length).toBeGreaterThan(0);
  });

  it("429s once the per-client rate window is exceeded", async () => {
    queueResponse("parseIngredients", () => ({
      ingredients: [{ raw: "2 eggs", name: "egg", quantity: "2", pantryStaple: false, usable: true, reason: null }],
    }));
    queueResponse("parseIngredients", () => ({
      ingredients: [{ raw: "2 eggs", name: "egg", quantity: "2", pantryStaple: false, usable: true, reason: null }],
    }));

    const clientId = "client-rate-limited";
    const first = await POST(request({ ingredients: ["2 eggs"] }, clientId));
    expect(first.status).toBe(200);
    const second = await POST(request({ ingredients: ["2 eggs"] }, clientId));
    expect(second.status).toBe(200);

    const third = await POST(request({ ingredients: ["2 eggs"] }, clientId));
    expect(third.status).toBe(429);
    const json = await third.json();
    expect(json.error).toBe("rate-limited");
  });

  it("cleans up the session row when the first stage throws (no scripted response queued)", async () => {
    const clientId = "client-start-failure";
    // Deliberately queue nothing for parseIngredients, so it throws.
    const res = await POST(request({ ingredients: ["2 eggs"] }, clientId));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("start-failed");

    const sessions = await getByOwner(clientId, getPool());
    expect(sessions).toHaveLength(0);
  });
});
