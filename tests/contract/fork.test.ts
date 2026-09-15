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
let forkPOST: typeof import("../../app/api/recipe/[sid]/fork/route").POST;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.RATE_MAX_PER_WINDOW = "1000";
  process.env.MAX_INGREDIENTS = "10";
  ({ POST: startPOST } = await import("../../app/api/recipe/start/route"));
  ({ POST: stepPOST } = await import("../../app/api/recipe/[sid]/step/route"));
  ({ POST: forkPOST } = await import("../../app/api/recipe/[sid]/fork/route"));
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

function forkReq(sid: string, body: unknown, clientId = "client-a"): Promise<Response> {
  return forkPOST(req(`http://localhost/api/recipe/${sid}/fork`, body, clientId), {
    params: Promise.resolve({ sid }),
  });
}

const okIngredient = { raw: "2 eggs", name: "egg", quantity: "2", pantryStaple: false, usable: true, reason: null };
const direction = { title: "Frittata", summary: "eggy bake", whyItFits: "uses the eggs" };
const draft = {
  title: "Spinach Frittata",
  servings: 2,
  steps: [{ order: 1, text: "Whisk eggs", minutes: 2, technique: null }],
  toBuy: [],
};

/** Creates a session and steps it to right after `draftRecipe`, returning the
 * checkpoint whose `recipeDraft` is forkable (consumer: `critique`). */
async function createSessionAtDraft(clientId: string) {
  queueResponse("parseIngredients", () => ({ ingredients: [okIngredient] }));
  const startRes = await startPOST(req("http://localhost/api/recipe/start", { ingredients: ["2 eggs"] }, clientId));
  const startJson = await startRes.json();
  const sid = startJson.sessionId as string;
  const branchId = startJson.branchId as string;

  queueResponse("proposeDirections", () => ({ directions: [direction, { ...direction, title: "Omelet" }] }));
  const step1 = await stepReq(sid, { branchId, fromCheckpointId: startJson.checkpointId }, clientId);
  const step1Json = await step1.json();

  queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
  const step2 = await stepReq(sid, { branchId, fromCheckpointId: step1Json.checkpointId }, clientId);
  const step2Json = await step2.json();

  return { sid, branchId, checkpointId: step2Json.checkpointId as string };
}

describe("POST /api/recipe/:sid/fork", () => {
  it("401s when X-Client-Id is missing", async () => {
    const res = await forkPOST(
      new Request("http://localhost/api/recipe/x/fork", {
        method: "POST",
        body: JSON.stringify({ branchId: "x", checkpointId: "x", patch: {} }),
      }),
      { params: Promise.resolve({ sid: "x" }) },
    );
    expect(res.status).toBe(401);
  });

  it("creates a NEW branchId distinct from the source, with the edited content applied", async () => {
    const { sid, branchId, checkpointId } = await createSessionAtDraft("client-fork-basic");
    const editedDraft = { ...draft, title: "Spinach Frittata (extra salty)" };

    const res = await forkReq(
      sid,
      { branchId, checkpointId, patch: { recipeDraft: editedDraft } },
      "client-fork-basic",
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.branchId).not.toBe(branchId);
    expect(json.state.recipeDraft).toEqual(editedDraft);
    expect(json.replayFromStage).toBe("critique");
    expect(Array.isArray(json.timeline)).toBe(true);
  });

  it("forking the same checkpoint twice with different patches produces two independent branches (T016 regression)", async () => {
    const { sid, branchId, checkpointId } = await createSessionAtDraft("client-fork-twice");
    const patchA = { recipeDraft: { ...draft, title: "Version A" } };
    const patchB = { recipeDraft: { ...draft, title: "Version B" } };

    const resA = await forkReq(sid, { branchId, checkpointId, patch: patchA }, "client-fork-twice");
    const resB = await forkReq(sid, { branchId, checkpointId, patch: patchB }, "client-fork-twice");
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const jsonA = await resA.json();
    const jsonB = await resB.json();

    // This is exactly the scenario the T016 spike found broken with a plain
    // updateState-based second-child fork: the two edits must NOT collide.
    expect(jsonA.branchId).not.toBe(jsonB.branchId);
    expect(jsonA.state.recipeDraft.title).toBe("Version A");
    expect(jsonB.state.recipeDraft.title).toBe("Version B");
  });

  it("branches can be stepped independently after switching between them (spec FR-030)", async () => {
    const { sid, branchId, checkpointId } = await createSessionAtDraft("client-branch-switch");
    const patchA = { recipeDraft: { ...draft, title: "Version A" } };
    const patchB = { recipeDraft: { ...draft, title: "Version B" } };

    const forkA = await forkReq(sid, { branchId, checkpointId, patch: patchA }, "client-branch-switch");
    const forkAJson = await forkA.json();
    const forkB = await forkReq(sid, { branchId, checkpointId, patch: patchB }, "client-branch-switch");
    const forkBJson = await forkB.json();

    queueResponse("critique", () => ({
      critique: { feasibility: "fine", flavorBalance: "fine", missingOrUnclear: [], blocking: false },
    }));
    const stepA = await stepReq(
      sid,
      { branchId: forkAJson.branchId, fromCheckpointId: forkAJson.checkpointId },
      "client-branch-switch",
    );
    expect(stepA.status).toBe(200);
    const stepAJson = await stepA.json();
    expect(stepAJson.state.recipeDraft.title).toBe("Version A");
    expect(stepAJson.state.critiques).toHaveLength(1);

    queueResponse("critique", () => ({
      critique: { feasibility: "fine", flavorBalance: "fine", missingOrUnclear: [], blocking: false },
    }));
    const stepB = await stepReq(
      sid,
      { branchId: forkBJson.branchId, fromCheckpointId: forkBJson.checkpointId },
      "client-branch-switch",
    );
    expect(stepB.status).toBe(200);
    const stepBJson = await stepB.json();
    expect(stepBJson.state.recipeDraft.title).toBe("Version B");
    expect(stepBJson.state.critiques).toHaveLength(1);

    // Independent: stepping B did not affect A's already-saved checkpoint.
    expect(stepAJson.checkpointId).not.toBe(stepBJson.checkpointId);
  });

  it("rejects a patch touching a non-editable channel", async () => {
    const { sid, branchId, checkpointId } = await createSessionAtDraft("client-fork-noneditable");
    const res = await forkReq(
      sid,
      { branchId, checkpointId, patch: { refineCount: 5 } },
      "client-fork-noneditable",
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid-edit");
    expect(json.field).toBe("refineCount");
  });

  it("rejects an invalid field shape", async () => {
    const { sid, branchId, checkpointId } = await createSessionAtDraft("client-fork-badshape");
    const res = await forkReq(
      sid,
      { branchId, checkpointId, patch: { recipeDraft: { title: "missing required fields" } } },
      "client-fork-badshape",
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid-edit");
    expect(json.field).toBe("recipeDraft");
  });

  it("editing an array field replaces it wholesale, does not append", async () => {
    const { sid, branchId, checkpointId } = await createSessionAtDraft("client-fork-replace");
    const singleDirection = [direction];

    const res = await forkReq(
      sid,
      { branchId, checkpointId, patch: { directions: singleDirection } },
      "client-fork-replace",
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state.directions).toEqual(singleDirection);
    expect(json.state.directions).toHaveLength(1);
  });

  it("400s over the configured ingredient maximum", async () => {
    const { sid, branchId, checkpointId } = await createSessionAtDraft("client-fork-toomany");
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ ...okIngredient, raw: `item ${i}` }));

    const res = await forkReq(
      sid,
      { branchId, checkpointId, patch: { ingredients: tooMany } },
      "client-fork-toomany",
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("too-many-ingredients");
    expect(json.max).toBe(10);
  });

  it("409s when the session is capped", async () => {
    const originalMax = process.env.MAX_STAGES_PER_SESSION;
    process.env.MAX_STAGES_PER_SESSION = "2";
    try {
      const { sid, branchId, checkpointId } = await createSessionAtDraft("client-fork-capped");
      // createSessionAtDraft already ran 2 stage-advances (proposeDirections, draftRecipe),
      // hitting stage_count === 2 === MAX_STAGES_PER_SESSION -> capped.
      const res = await forkReq(
        sid,
        { branchId, checkpointId, patch: { recipeDraft: draft } },
        "client-fork-capped",
      );
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe("session-capped");
    } finally {
      process.env.MAX_STAGES_PER_SESSION = originalMax;
    }
  });
});
