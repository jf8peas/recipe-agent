import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";
import { DishImageSchema, type State } from "../../lib/agent/state";

type Responder = () => unknown;
const responders = new Map<string, Responder[]>();
function queueResponse(nodeName: string, respond: Responder) {
  const queue = responders.get(nodeName) ?? [];
  queue.push(respond);
  responders.set(nodeName, queue);
}

// A committed, valid, tiny 1x1 PNG (feature 007) — the fixture `finalize`'s
// separate image call "returns" whenever a test queues a success response.
const FIXED_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const IMAGE_RESPONDER_KEY = "__finalize-image__";
function queueImageSuccess() {
  queueResponse(IMAGE_RESPONDER_KEY, () => ({
    content: [
      { type: "text", text: JSON.stringify({ focalX: 0.5, focalY: 0.45, zoom: 1 }) },
      { type: "image", url: `data:image/png;base64,${FIXED_IMAGE_BASE64}` },
    ],
  }));
}
function queueImageFailure() {
  queueResponse(IMAGE_RESPONDER_KEY, () => {
    throw new Error("simulated image failure");
  });
}

vi.mock("../../lib/agent/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/agent/models")>();
  return {
    ...actual,
    createChatModel: (_modelId: string, options?: { timeoutMs?: number; modalities?: unknown }) => {
      // `finalize`'s image call is the only caller passing `modalities`
      // (research R1) — this is how the mock tells the two calls apart,
      // mirroring `lib/agent/fake-model.ts`'s real split. The text call now
      // also passes `options` (its own `timeoutMs`), so `modalities` is
      // what actually distinguishes them.
      if (options?.modalities) {
        return {
          invoke: async () => {
            const queue = responders.get(IMAGE_RESPONDER_KEY);
            const respond = queue?.shift();
            if (!respond) throw new Error("no scripted response queued for the finalize image call");
            return respond();
          },
        };
      }
      return {
        withStructuredOutput: (_schema: unknown, opts: { name: string }) => ({
          invoke: async () => {
            const queue = responders.get(opts.name);
            const respond = queue?.shift();
            if (!respond) throw new Error(`no scripted response queued for node "${opts.name}"`);
            return respond();
          },
        }),
      };
    },
  };
});

let testDb: TestDb;
let startPOST: typeof import("../../app/api/recipe/start/route").POST;
let stepPOST: typeof import("../../app/api/recipe/[sid]/step/route").POST;
let stateGET: typeof import("../../app/api/recipe/[sid]/state/route").GET;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_WINDOW_SECONDS = "60";
  process.env.RATE_MAX_PER_WINDOW = "1000";
  process.env.MAX_INGREDIENTS = "50";
  process.env.MAX_STAGES_PER_SESSION = "60";
  process.env.IMAGE_URL_SECRET = "test-secret";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ POST: stepPOST } = await import("../../app/api/recipe/[sid]/step/route"));
  ({ GET: stateGET } = await import("../../app/api/recipe/[sid]/state/route"));
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

async function createSession(clientId: string) {
  queueResponse("parseIngredients", () => ({ ingredients: [okIngredient] }));
  const res = await startPOST(
    req("http://localhost/api/recipe/start", { ingredients: ["2 eggs"] }, clientId),
  );
  const json = await res.json();
  return {
    sid: json.sessionId as string,
    branchId: json.branchId as string,
    checkpointId: json.checkpointId as string,
  };
}

const draft = {
  title: "Spinach Frittata",
  servings: 2,
  ingredients: [{ name: "eggs", quantity: "2" }],
  steps: [{ order: 1, text: "Whisk eggs", minutes: 2, technique: null }],
  toBuy: [],
};
const finalRecipe = {
  ...draft,
  scaledServings: 2,
  nutrition: { calories: 200, protein: 15, carbs: 5, fat: 10, note: "approximate" as const },
};

/** Drives a session all the way from `parseIngredients` through `finalize`
 * over real `/step` calls (feature 007, T017) — every intermediate stage's
 * fixture is fixed/irrelevant to these tests; only `finalize`'s own image
 * call (queued separately via `queueImageSuccess`/`queueImageFailure`)
 * varies between them. */
async function driveToFinalize(clientId: string) {
  const { sid, branchId, checkpointId } = await createSession(clientId);

  queueResponse("proposeDirections", () => ({
    directions: [direction, { ...direction, title: "Omelet" }],
  }));
  const afterPropose = await (await stepReq(sid, { branchId, fromCheckpointId: checkpointId }, clientId)).json();

  queueResponse("selectDirection", () => ({
    directionSelection: { selectedIndex: 0, explanation: "clear fit", clearFavorite: true },
  }));
  const afterSelect = await (
    await stepReq(sid, { branchId, fromCheckpointId: afterPropose.checkpointId }, clientId)
  ).json();

  queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
  const afterDraft = await (
    await stepReq(sid, { branchId, fromCheckpointId: afterSelect.checkpointId }, clientId)
  ).json();

  queueResponse("critique", () => ({
    critique: { feasibility: "fine", flavorBalance: "fine", missingOrUnclear: [], blocking: false },
  }));
  const afterCritique = await (
    await stepReq(sid, { branchId, fromCheckpointId: afterDraft.checkpointId }, clientId)
  ).json();

  queueResponse("finalize", () => ({ finalRecipe }));
  const finalizeRes = await stepReq(
    sid,
    { branchId, fromCheckpointId: afterCritique.checkpointId },
    clientId,
  );
  const finalizeJson = await finalizeRes.json();
  return { sid, branchId, finalizeRes, finalizeJson, preFinalizeCheckpointId: afterCritique.checkpointId };
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
    expect(json.next).toEqual(["selectDirection"]);
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

  // Regression: a checkpoint that already has ANY child (a prior stage
  // failure counts, not just a success) is unsafe to `updateState` again —
  // specs/001-recipe-agent/research.md R3/T016 confirms `updateState` onto
  // an already-branched-from checkpoint silently drops the write or leaks a
  // sibling's content into untouched channels. Two failures in a row from
  // the same checkpoint hits this: the first failure's `updateState` is
  // safe (still childless), but the second one's checkpoint now already has
  // that first failure as a child. A real production session was corrupted
  // by the equivalent case on the "retry-image" path (research.md's
  // dish-image-generation addendum) — this test covers the simpler,
  // directly-reproducible version of the same mechanism.
  it("a second consecutive failure from the same checkpoint reports an error instead of writing a second, unsafe stage-failure checkpoint", async () => {
    const { sid, branchId, checkpointId } = await createSession("client-double-failure");
    queueResponse("proposeDirections", () => {
      throw new Error("simulated model failure 1");
    });

    const firstFail = await stepReq(
      sid,
      { branchId, fromCheckpointId: checkpointId },
      "client-double-failure",
    );
    expect(firstFail.status).toBe(200);
    const firstFailJson = await firstFail.json();
    expect(firstFailJson.kind).toBe("stage-failure");

    queueResponse("proposeDirections", () => {
      throw new Error("simulated model failure 2");
    });
    const secondFail = await stepReq(
      sid,
      { branchId, fromCheckpointId: checkpointId, mode: "retry" },
      "client-double-failure",
    );
    expect(secondFail.status).toBe(500);
    const secondFailJson = await secondFail.json();
    expect(secondFailJson.error).toBe("retry-failed-unsafe-to-record");

    // Nothing was corrupted. Note: LangGraph's own `invoke()` unconditionally
    // writes a bookkeeping checkpoint the moment it resumes from a
    // non-tip `checkpoint_id` (a "fork"-tagged entry, confirmed safe per
    // research R3 — it's created via `invoke`, never `updateState`) BEFORE
    // the node itself runs and throws — so the live tip legitimately moves
    // again even though this second failure was never recorded. What must
    // NOT happen is the specific corruption a real production session hit
    // (research.md's dish-image-generation addendum): a checkpoint whose
    // fields contradict each other, e.g. `outcome: "finalized"` with a null
    // `finalRecipe`, or a `failureReason` attached to an outcome other than
    // "stage-failure". The second failure's own text ("simulated model
    // failure 2") must never surface anywhere, since it was never persisted.
    const { getGraph } = await import("../../lib/agent/runtime");
    const liveSnapshot = await getGraph().getState({ configurable: { thread_id: branchId } });
    const liveValues = liveSnapshot.values as State;
    expect(liveValues.failureReason ?? "").not.toContain("simulated model failure 2");
    if (liveValues.outcome === "finalized") expect(liveValues.finalRecipe).not.toBeNull();
    if (liveValues.failureReason !== null) expect(liveValues.outcome).toBe("stage-failure");
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
      const res = await stepReq(
        sid,
        { branchId, fromCheckpointId: checkpointId },
        "client-rate-step",
      );
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
      const first = await stepReq(
        sid,
        { branchId, fromCheckpointId: checkpointId },
        "client-session-cap",
      );
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

  it("a successful finalize's response includes a dishImage shaped per DishImageSchema, plus a ready-to-use dishImageUrl, when the image call succeeds (feature 007)", async () => {
    queueImageSuccess();
    const { finalizeJson } = await driveToFinalize("client-image-success");

    expect(finalizeJson.kind).toBe("finalized");
    expect(finalizeJson.state.outcome).toBe("finalized");
    expect(DishImageSchema.safeParse(finalizeJson.state.dishImage).success).toBe(true);
    expect(finalizeJson.dishImageUrl).toEqual(expect.stringMatching(/^\/api\/images\//));
  });

  it("an image failure still finalizes with no dishImage and no dishImageUrl", async () => {
    queueImageFailure();
    const { finalizeJson } = await driveToFinalize("client-image-failure");

    expect(finalizeJson.kind).toBe("finalized");
    expect(finalizeJson.state.dishImage).toBeNull();
    expect(finalizeJson.dishImageUrl).toBeNull();
  });

  it("usage_events row count for the finalize stage is identical whether the image call succeeds or fails (FR-017 — no extra usage unit for the image call)", async () => {
    async function stageEventCount(threadId: string): Promise<number> {
      const { rows } = await getPool().query<{ count: number }>(
        "SELECT count(*)::int AS count FROM usage_events WHERE thread_id = $1 AND kind = 'stage'",
        [threadId],
      );
      return rows[0]?.count ?? 0;
    }

    queueImageSuccess();
    const success = await driveToFinalize("client-usage-image-success");
    const successCount = await stageEventCount(success.branchId);

    queueImageFailure();
    const failure = await driveToFinalize("client-usage-image-failure");
    const failureCount = await stageEventCount(failure.branchId);

    expect(successCount).toBe(failureCount);
  });

  it("retry-image regenerates just the photo (reusing the existing recipe, no text call), while the pre-retry checkpoint still reports its own original dishImage unchanged (US4, T031, FR-010)", async () => {
    queueImageSuccess();
    const { sid, branchId, finalizeJson, preFinalizeCheckpointId } = await driveToFinalize(
      "client-retry-finalize",
    );
    const originalImageId = finalizeJson.state.dishImage.imageId;

    // Deliberately NOT queuing a "finalize" text responder — retry-image
    // must never call the text model at all (the route reads the branch's
    // own live `finalRecipe` straight from its current checkpoint, not from
    // the request body — a queued-but-unconsumed text responder here would
    // prove the opposite of what this test checks).
    queueImageSuccess();
    const retryRes = await stepReq(
      sid,
      { branchId, fromCheckpointId: preFinalizeCheckpointId, mode: "retry-image" },
      "client-retry-finalize",
    );
    expect(retryRes.status).toBe(200);
    const retryJson = await retryRes.json();
    expect(retryJson.kind).toBe("finalized");
    expect(retryJson.checkpointId).not.toBe(finalizeJson.checkpointId);
    expect(retryJson.state.dishImage.imageId).not.toBe(originalImageId);
    // The recipe itself is untouched — only the photo changed.
    expect(retryJson.state.finalRecipe).toEqual(finalizeJson.state.finalRecipe);

    // The pre-retry checkpoint, fetched by its own checkpoint id, still
    // reports exactly the image it originally recorded — a retry creates a
    // new sibling checkpoint, it doesn't rewrite history (FR-009a).
    const originalRes = await stateGET(
      new Request(
        `http://localhost/api/recipe/${sid}/state?branchId=${branchId}&checkpointId=${finalizeJson.checkpointId}`,
        { headers: { "X-Client-Id": "client-retry-finalize" } },
      ),
      { params: Promise.resolve({ sid }) },
    );
    expect(originalRes.status).toBe(200);
    const originalJson = await originalRes.json();
    expect(originalJson.state.dishImage.imageId).toBe(originalImageId);
  });

  it("retry-image 400s when the branch has no finalized recipe yet (never sent a stale/invalid one from the client)", async () => {
    // Regression coverage for a real production bug: the original design
    // had the client send its own copy of `finalRecipe` back for
    // server-side re-validation against `FinalRecipeSchema` — an
    // older-shaped recipe (e.g. one predating the `ingredients` field)
    // failed that validation and 400'd on every click. The fix reads the
    // branch's own live recipe directly from its checkpoint instead, with
    // no re-validation boundary at all; this test covers the one case that
    // route still needs to reject: no recipe there yet.
    const { sid, branchId, checkpointId } = await createSession("client-retry-image-no-recipe");
    const res = await stepReq(
      sid,
      { branchId, fromCheckpointId: checkpointId, mode: "retry-image" },
      "client-retry-image-no-recipe",
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid-request");
  });
});
