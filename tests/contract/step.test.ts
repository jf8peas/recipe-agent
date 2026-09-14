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
let stepPOST: typeof import("../../app/api/recipe/[sid]/step/route").POST;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_WINDOW_SECONDS = "60";
  process.env.RATE_MAX_PER_WINDOW = "1000";
  process.env.MAX_INGREDIENTS = "50";
  process.env.MAX_STAGES_PER_SESSION = "60";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ POST: stepPOST } = await import("../../app/api/recipe/[sid]/step/route"));
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

function stepReq(sid: string, body: unknown, clientId = "client-a"): Promise<Response> {
  return stepPOST(req(`http://localhost/api/recipe/${sid}/step`, body, clientId), {
    params: Promise.resolve({ sid }),
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
const badIngredient = {
  raw: "a rock",
  name: null,
  quantity: null,
  pantryStaple: false,
  usable: false,
  reason: "not-food",
};
const direction = { title: "Frittata", summary: "eggy bake", whyItFits: "uses the eggs" };
const draft = {
  title: "Spinach Frittata",
  servings: 2,
  steps: [{ order: 1, text: "Whisk eggs", minutes: 2, technique: null }],
  toBuy: [],
};
const nonBlockingCritique = {
  feasibility: "fine",
  flavorBalance: "fine",
  missingOrUnclear: [],
  blocking: false,
};

async function createSession(clientId: string) {
  queueResponse("parseIngredients", () => ({ ingredients: [okIngredient] }));
  const res = await startPOST(
    req("http://localhost/api/recipe/start", { ingredients: ["2 eggs"] }, clientId),
  );
  const json = await res.json();
  return { sid: json.sessionId as string, branchId: json.branchId as string, checkpointId: json.checkpointId as string };
}

describe("POST /api/recipe/:sid/step", () => {
  it("401s when X-Client-Id is missing", async () => {
    const res = await stepPOST(
      new Request("http://localhost/api/recipe/x/step", {
        method: "POST",
        body: JSON.stringify({ branchId: "x", fromCheckpointId: "x" }),
      }),
      { params: Promise.resolve({ sid: "x" }) },
    );
    expect(res.status).toBe(401);
  });

  it("404s for an unknown session", async () => {
    const res = await stepReq("no-such-session", { branchId: "x", fromCheckpointId: "x" });
    expect(res.status).toBe(404);
  });

  it("normal: advances proposeDirections after parseIngredients", async () => {
    const { sid, branchId, checkpointId } = await createSession("client-normal");
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));

    const res = await stepReq(sid, { branchId, fromCheckpointId: checkpointId }, "client-normal");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.kind).toBe("normal");
    expect(json.state.directions).toHaveLength(2);
    expect(json.next).toEqual(["draftRecipe"]);
  });

  it("ingredient-error: parseIngredients flags an unusable ingredient", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [okIngredient, badIngredient] }));
    const res = await startPOST(
      req(
        "http://localhost/api/recipe/start",
        { ingredients: ["2 eggs", "a rock"] },
        "client-ingredient-error",
      ),
    );
    const startJson = await res.json();
    expect(startJson.next).toEqual(["ingredientError"]);

    const stepRes = await stepReq(
      startJson.sessionId,
      { branchId: startJson.branchId, fromCheckpointId: startJson.checkpointId },
      "client-ingredient-error",
    );
    expect(stepRes.status).toBe(200);
    const stepJson = await stepRes.json();
    expect(stepJson.kind).toBe("ingredient-error");
    expect(stepJson.next).toEqual([]);
  });

  it("stage-failure, then a retry from the same checkpoint succeeds as a sibling", async () => {
    const { sid, branchId, checkpointId } = await createSession("client-failure-retry");
    queueResponse("proposeDirections", () => {
      throw new Error("simulated model failure");
    });

    const failRes = await stepReq(
      sid,
      { branchId, fromCheckpointId: checkpointId },
      "client-failure-retry",
    );
    expect(failRes.status).toBe(200);
    const failJson = await failRes.json();
    expect(failJson.kind).toBe("stage-failure");
    expect(failJson.state.failureReason).toContain("simulated model failure");

    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    const retryRes = await stepReq(
      sid,
      { branchId, fromCheckpointId: checkpointId, mode: "retry" },
      "client-failure-retry",
    );
    expect(retryRes.status).toBe(200);
    const retryJson = await retryRes.json();
    expect(retryJson.kind).toBe("normal");
    expect(retryJson.checkpointId).not.toBe(failJson.checkpointId);
  });

  it("409s on a second advance attempt from an already-advanced checkpoint", async () => {
    const { sid, branchId, checkpointId } = await createSession("client-double-advance");
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    const first = await stepReq(
      sid,
      { branchId, fromCheckpointId: checkpointId },
      "client-double-advance",
    );
    expect(first.status).toBe(200);

    const second = await stepReq(
      sid,
      { branchId, fromCheckpointId: checkpointId },
      "client-double-advance",
    );
    expect(second.status).toBe(409);
    const json = await second.json();
    expect(json.error).toBe("already-advanced");
  });

  it("cancelled: an aborted request writes no checkpoint", async () => {
    const { sid, branchId, checkpointId } = await createSession("client-cancel");
    const controller = new AbortController();
    queueResponse("proposeDirections", () => {
      controller.abort();
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });

    const request = new Request(`http://localhost/api/recipe/${sid}/step`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Client-Id": "client-cancel" },
      body: JSON.stringify({ branchId, fromCheckpointId: checkpointId }),
      signal: controller.signal,
    });
    const res = await stepPOST(request, { params: Promise.resolve({ sid }) });
    expect(res.status).toBe(499);

    // No new child checkpoint should exist for the pre-stage tip.
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    const retry = await stepReq(sid, { branchId, fromCheckpointId: checkpointId }, "client-cancel");
    expect(retry.status).toBe(200); // still allowed — the aborted attempt wrote nothing
  });

  it("429s once the per-client rate window is exceeded", async () => {
    const originalMax = process.env.RATE_MAX_PER_WINDOW;
    process.env.RATE_MAX_PER_WINDOW = "1";
    try {
      const { sid, branchId, checkpointId } = await createSession("client-rate-step");
      // The `start` call above already recorded one usage event for this client.
      queueResponse("proposeDirections", () => ({
        directions: [direction, { ...direction, title: "Omelet" }],
      }));
      const res = await stepReq(sid, { branchId, fromCheckpointId: checkpointId }, "client-rate-step");
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toBe("rate-limited");
    } finally {
      process.env.RATE_MAX_PER_WINDOW = originalMax;
    }
  });

  it("429s (session-cap) once the session's stage count reaches the configured max", async () => {
    const originalMax = process.env.MAX_STAGES_PER_SESSION;
    process.env.MAX_STAGES_PER_SESSION = "1";
    try {
      const { sid, branchId, checkpointId } = await createSession("client-session-cap");
      queueResponse("proposeDirections", () => ({
        directions: [direction, { ...direction, title: "Omelet" }],
      }));
      const first = await stepReq(sid, { branchId, fromCheckpointId: checkpointId }, "client-session-cap");
      expect(first.status).toBe(200); // stage_count 0 -> 1, session now capped

      const firstJson = await first.json();
      const res = await stepReq(
        sid,
        { branchId, fromCheckpointId: firstJson.checkpointId },
        "client-session-cap",
      );
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toBe("session-cap");
    } finally {
      process.env.MAX_STAGES_PER_SESSION = originalMax;
    }
  });
});
