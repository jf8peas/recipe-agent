import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { INITIAL_STATE, toRawIngredient } from "../../lib/agent/state";
import { buildGraph, NODE_NAMES } from "../../lib/agent/graph";

// Stub every node's model call at the `createChatModel(...).withStructuredOutput(...).invoke(...)`
// boundary (research R14) — a scripted response queue keyed by node name, so
// no real OpenRouter call happens and each test controls exactly what each
// stage "decides".
type Responder = () => unknown;
const responders = new Map<string, Responder[]>();

function queueResponse(nodeName: string, respond: Responder) {
  const queue = responders.get(nodeName) ?? [];
  queue.push(respond);
  responders.set(nodeName, queue);
}

function resetResponders() {
  responders.clear();
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

const usableIngredient = {
  ...toRawIngredient("2 eggs"),
  name: "egg",
  quantity: "2",
  usable: true,
};

const unusableIngredient = {
  ...toRawIngredient("a rock"),
  name: null,
  usable: false,
  reason: "not-food" as const,
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
const blockingCritique = {
  feasibility: "needs work",
  flavorBalance: "off",
  missingOrUnclear: ["salt"],
  blocking: true,
};
const finalRecipe = {
  ...draft,
  scaledServings: 2,
  nutrition: { calories: 200, protein: 15, carbs: 5, fat: 10, note: "approximate" as const },
};

describe("recipe graph (integration, fake model)", () => {
  let testDb: TestDb;
  let checkpointer: PostgresSaver;
  let app: ReturnType<ReturnType<typeof buildGraph>["compile"]>;

  beforeAll(async () => {
    testDb = await startTestDb();
    await testDb.migrate();
    checkpointer = PostgresSaver.fromConnString(testDb.connectionString);
    await checkpointer.setup();
    app = buildGraph().compile({ checkpointer, interruptAfter: [...NODE_NAMES] });
  });

  afterEach(() => {
    resetResponders();
  });

  afterAll(async () => {
    await checkpointer.end();
    await testDb.stop();
  });

  it("runs start -> ... -> finalize on a valid ingredient list", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({ directions: [direction, { ...direction, title: "Omelet" }] }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
    queueResponse("critique", () => ({ critique: nonBlockingCritique }));
    queueResponse("finalize", () => ({ finalRecipe }));

    const config = { configurable: { thread_id: "happy-path" } };
    const state = { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] };
    let result = await app.invoke(state, config);
    while (result.outcome === "in-progress") {
      result = await app.invoke(null, config);
    }

    expect(result.outcome).toBe("finalized");
    expect(result.finalRecipe).toEqual(finalRecipe);
  });

  it("takes the ingredient-error short path when any ingredient is unusable", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient, unusableIngredient] }));

    const config = { configurable: { thread_id: "ingredient-error-path" } };
    const state = {
      ...INITIAL_STATE,
      ingredients: [toRawIngredient("2 eggs"), toRawIngredient("a rock")],
    };
    let result = await app.invoke(state, config);
    while (result.outcome === "in-progress") {
      result = await app.invoke(null, config);
    }

    expect(result.outcome).toBe("ingredient-error");
    expect(result.finalRecipe).toBeNull();
  });

  it("runs a refine cycle when critique is blocking, then finalizes", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({ directions: [direction, { ...direction, title: "Omelet" }] }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
    queueResponse("critique", () => ({ critique: blockingCritique }));
    queueResponse("refine", () => ({ recipeDraft: { ...draft, toBuy: ["salt"] } }));
    queueResponse("critique", () => ({ critique: nonBlockingCritique }));
    queueResponse("finalize", () => ({ finalRecipe }));

    const config = { configurable: { thread_id: "refine-cycle" } };
    const state = { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] };
    let result = await app.invoke(state, config);
    while (result.outcome === "in-progress") {
      result = await app.invoke(null, config);
    }

    expect(result.outcome).toBe("finalized");
    expect(result.refineCount).toBe(1);
    expect(result.critiques).toHaveLength(2);
  });

  it("a node throwing leaves the checkpoint's outcome untouched; a plain retry from the same checkpoint succeeds as a sibling", async () => {
    queueResponse("parseIngredients", () => {
      throw new Error("simulated model failure");
    });
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));

    const config = { configurable: { thread_id: "stage-failure-then-retry" } };
    const state = { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] };

    await expect(app.invoke(state, config)).rejects.toThrow("simulated model failure");

    // Retry: plain invoke from the same (pre-failure) checkpoint — never updateState (research R3).
    const beforeFailure = await app.getState(config);
    const retryResult = await app.invoke(null, beforeFailure.config);
    expect(retryResult.ingredients).toEqual([usableIngredient]);
  });

  it("Auto-run (repeated single steps) produces the same checkpoint count as manual stepping", async () => {
    const script = () => {
      queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
      queueResponse("proposeDirections", () => ({
        directions: [direction, { ...direction, title: "Omelet" }],
      }));
      queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
      queueResponse("critique", () => ({ critique: nonBlockingCritique }));
      queueResponse("finalize", () => ({ finalRecipe }));
    };

    script();
    const configA = { configurable: { thread_id: "manual-stepping" } };
    let resultA = await app.invoke({ ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] }, configA);
    while (resultA.outcome === "in-progress") {
      resultA = await app.invoke(null, configA);
    }
    const historyA = [];
    for await (const snapshot of app.getStateHistory(configA)) historyA.push(snapshot);

    resetResponders();
    script();
    const configB = { configurable: { thread_id: "auto-run" } };
    let resultB = await app.invoke({ ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] }, configB);
    while (resultB.outcome === "in-progress") {
      resultB = await app.invoke(null, configB);
    }
    const historyB = [];
    for await (const snapshot of app.getStateHistory(configB)) historyB.push(snapshot);

    expect(historyA.length).toBe(historyB.length);
  });
});
