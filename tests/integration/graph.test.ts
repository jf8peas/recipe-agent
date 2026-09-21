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
const directionSelection = {
  selectedIndex: 0,
  explanation: "Frittata makes the best use of the ingredients.",
  clearFavorite: true,
};
const draft = {
  title: "Spinach Frittata",
  servings: 2,
  ingredients: [{ name: "eggs", quantity: "2" }],
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
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("selectDirection", () => ({ directionSelection }));
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
    queueResponse("parseIngredients", () => ({
      ingredients: [usableIngredient, unusableIngredient],
    }));

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
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("selectDirection", () => ({ directionSelection }));
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
      queueResponse("selectDirection", () => ({ directionSelection }));
      queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
      queueResponse("critique", () => ({ critique: nonBlockingCritique }));
      queueResponse("finalize", () => ({ finalRecipe }));
    };

    script();
    const configA = { configurable: { thread_id: "manual-stepping" } };
    let resultA = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      configA,
    );
    while (resultA.outcome === "in-progress") {
      resultA = await app.invoke(null, configA);
    }
    const historyA = [];
    for await (const snapshot of app.getStateHistory(configA)) historyA.push(snapshot);

    resetResponders();
    script();
    const configB = { configurable: { thread_id: "auto-run" } };
    let resultB = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      configB,
    );
    while (resultB.outcome === "in-progress") {
      resultB = await app.invoke(null, configB);
    }
    const historyB = [];
    for await (const snapshot of app.getStateHistory(configB)) historyB.push(snapshot);

    expect(historyA.length).toBe(historyB.length);
    // SC-005: a full run now takes exactly one more real step than before
    // this feature (parseIngredients, proposeDirections, selectDirection,
    // draftRecipe, critique, finalize = 6 real nodes) — plus the 2 scaffold
    // checkpoints `getStateHistory` always includes (the "input" pre-START
    // entry and the seeded genesis entry).
    expect(historyA.length).toBe(8);
  });

  it("selectDirection judges the candidates; draftRecipe drafts from the selected (non-first) direction (spec US1 AS1)", async () => {
    const directionB = {
      title: "Shakshuka",
      summary: "spiced tomato eggs",
      whyItFits: "uses the spinach too",
    };
    const selection = {
      selectedIndex: 1,
      explanation: "Shakshuka makes better use of the full ingredient list.",
      clearFavorite: true,
    };
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({ directions: [direction, directionB] }));
    queueResponse("selectDirection", () => ({ directionSelection: selection }));
    queueResponse("draftRecipe", () => ({ recipeDraft: { ...draft, title: "Shakshuka" } }));
    queueResponse("critique", () => ({ critique: nonBlockingCritique }));
    queueResponse("finalize", () => ({ finalRecipe: { ...finalRecipe, title: "Shakshuka" } }));

    const config = { configurable: { thread_id: "select-non-zero" } };
    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      config,
    );
    while (result.outcome === "in-progress") {
      result = await app.invoke(null, config);
    }

    expect(result.directionSelection).toEqual(selection);
    expect(result.finalRecipe?.title).toBe("Shakshuka");
  });

  it("a clearFavorite:false verdict is a normal outcome, not a failure — the run still completes (spec FR-004, US1 AS2)", async () => {
    const selection = {
      selectedIndex: 0,
      explanation: "Both directions fit equally well; defaulted to the first.",
      clearFavorite: false,
    };
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("selectDirection", () => ({ directionSelection: selection }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
    queueResponse("critique", () => ({ critique: nonBlockingCritique }));
    queueResponse("finalize", () => ({ finalRecipe }));

    const config = { configurable: { thread_id: "select-no-clear-winner" } };
    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      config,
    );
    while (result.outcome === "in-progress") {
      result = await app.invoke(null, config);
    }

    expect(result.outcome).toBe("finalized");
    expect(result.directionSelection).toEqual(selection);
  });

  it("selectDirection skips the model call entirely with only 1 candidate direction (spec FR-015, research R6)", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
    queueResponse("critique", () => ({ critique: nonBlockingCritique }));
    queueResponse("finalize", () => ({ finalRecipe }));
    // Deliberately no "selectDirection" response queued — if the node called
    // the mocked model anyway, that call would throw for lack of a queued
    // response, failing this test.

    const config = { configurable: { thread_id: "select-single-candidate" } };
    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      config,
    );
    let snapshot = await app.getState(config);
    while (snapshot.next[0] !== "selectDirection") {
      result = await app.invoke(null, config);
      snapshot = await app.getState(config);
    }

    // Simulate an edit down to a single candidate (spec FR-015) — the same
    // shape `/fork` produces for a real user edit — without needing
    // `proposeDirections`'s own OutputSchema (min 2) to allow it directly.
    await app.updateState(config, { directions: [direction] }, "proposeDirections");
    result = await app.invoke(null, config); // selectDirection runs

    expect(result.directionSelection).toEqual({
      selectedIndex: 0,
      explanation: "Only one direction was proposed, so it was used.",
      clearFavorite: true,
    });

    while (result.outcome === "in-progress") {
      result = await app.invoke(null, config);
    }
    expect(result.outcome).toBe("finalized");
  });

  it("draftRecipe falls back to directions[0] when directionSelection is still null (spec FR-014 — a checkpoint predating this feature)", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));

    const config = { configurable: { thread_id: "select-legacy-null" } };
    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      config,
    );
    let snapshot = await app.getState(config);
    while (snapshot.next[0] !== "selectDirection") {
      result = await app.invoke(null, config);
      snapshot = await app.getState(config);
    }

    // Advance straight to draftRecipe without selectDirection ever running —
    // `directionSelection` stays at its default `null`, simulating a
    // checkpoint from before this feature existed.
    await app.updateState(config, {}, "selectDirection");
    result = await app.invoke(null, config); // draftRecipe runs

    expect(result.recipeDraft).toEqual(draft);
  });
});
