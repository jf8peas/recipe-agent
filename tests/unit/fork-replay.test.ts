import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { INITIAL_STATE, toRawIngredient } from "../../lib/agent/state";
import { buildGraph, NODE_NAMES } from "../../lib/agent/graph";
import { forkReplay } from "../../lib/fork-replay";

type Responder = () => unknown;
const responders = new Map<string, Responder[]>();
const invocationCounts = new Map<string, number>();

function queueResponse(nodeName: string, respond: Responder) {
  const queue = responders.get(nodeName) ?? [];
  queue.push(respond);
  responders.set(nodeName, queue);
}

function resetResponders() {
  responders.clear();
  invocationCounts.clear();
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

const usableIngredient = {
  ...toRawIngredient("2 eggs"),
  name: "egg",
  quantity: "2",
  usable: true,
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
const directionSelection = {
  selectedIndex: 0,
  explanation: "Frittata makes the best use of the ingredients.",
  clearFavorite: true,
};

describe("forkReplay", () => {
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

  it("replaying a 4-stage prefix onto a fresh thread reproduces the exact recorded values, and makes NO model call", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("selectDirection", () => ({ directionSelection }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));

    const sourceThreadId = "fork-source-1";
    const config = { configurable: { thread_id: sourceThreadId } };
    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      config,
    );
    // Stop right after `draftRecipe` runs (before critique), so the tip's
    // predecessor chain is: [genesis, parseIngredients, proposeDirections,
    // selectDirection, draftRecipe] — the predecessor of `critique`, which
    // consumes `recipeDraft`.
    while (!result.recipeDraft) {
      result = await app.invoke(null, config);
    }

    const draftCheckpoint = await app.getState(config);
    const draftCheckpointId = draftCheckpoint.config.configurable!.checkpoint_id as string;

    invocationCounts.clear();

    const editedDraft = { ...draft, title: "Spinach Frittata (extra salty)" };
    const replay = await forkReplay(app, {
      sourceThreadId,
      checkpointId: draftCheckpointId,
      newThreadId: "fork-target-1",
      patch: { recipeDraft: editedDraft },
    });

    expect(invocationCounts.size).toBe(0); // no model call happened during replay

    expect(replay.state.ingredients).toEqual([usableIngredient]);
    expect(replay.state.directions).toHaveLength(2);
    expect(replay.state.recipeDraft).toEqual(editedDraft);
    expect(replay.state.critiques).toEqual([]);
    expect(replay.next).toEqual(["critique"]);

    // The new thread is independently steppable for real from here.
    queueResponse("critique", () => ({ critique: nonBlockingCritique }));
    const stepped = await app.invoke(null, { configurable: { thread_id: "fork-target-1" } });
    expect(stepped.critiques).toHaveLength(1);
  });

  it('forking from a checkpoint 2+ real stages deep produces exactly one checkpoint per real stage — no spurious extra entry from the pre-"__start__" input checkpoint', async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("selectDirection", () => ({ directionSelection }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));

    const sourceThreadId = "fork-source-deep";
    const config = { configurable: { thread_id: sourceThreadId } };
    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      config,
    );
    while (!result.recipeDraft) {
      result = await app.invoke(null, config);
    }
    const draftCheckpoint = await app.getState(config);
    const draftCheckpointId = draftCheckpoint.config.configurable!.checkpoint_id as string;

    const newThreadId = "fork-target-deep";
    await forkReplay(app, {
      sourceThreadId,
      checkpointId: draftCheckpointId,
      newThreadId,
      patch: { recipeDraft: { ...draft, title: "Deep Fork Draft" } },
    });

    const targetHistory: { next: string[]; source: string }[] = [];
    for await (const snap of app.getStateHistory({ configurable: { thread_id: newThreadId } })) {
      targetHistory.push({ next: snap.next, source: (snap.metadata?.source as string) ?? "loop" });
    }
    targetHistory.reverse(); // oldest-first
    const realStages = targetHistory.filter((entry) => entry.source !== "input");

    // Exactly one checkpoint per real stage replayed (seeded genesis,
    // parseIngredients, proposeDirections, selectDirection, draftRecipe) —
    // regression check for the off-by-one bug where forkReplay's unfiltered
    // history shifted every index by one and replayed an extra, spurious
    // step using the literal "__start__" as asNode, producing a duplicated
    // parseIngredients entry in the branch's timeline (caught via a live
    // production fork).
    expect(realStages).toHaveLength(5);
    expect(realStages.map((entry) => entry.next[0])).toEqual([
      "parseIngredients",
      "proposeDirections",
      "selectDirection",
      "draftRecipe",
      "critique",
    ]);
  });

  it("forking at the genesis checkpoint (ingredient-error recovery) seeds directly with the patch, no replay chain", async () => {
    const badIngredient = {
      ...toRawIngredient("a rock"),
      usable: false,
      reason: "not-food" as const,
    };
    queueResponse("parseIngredients", () => ({ ingredients: [badIngredient] }));

    const sourceThreadId = "fork-source-genesis";
    const config = { configurable: { thread_id: sourceThreadId } };
    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("a rock")] },
      config,
    );
    while (result.outcome === "in-progress") {
      result = await app.invoke(null, config);
    }
    expect(result.outcome).toBe("ingredient-error");

    // Genesis checkpoint = the oldest entry with source !== "input" — the
    // true empty pre-"__start__" checkpoint is filtered out by forkReplay
    // (matching lib/history.ts's buildTimeline) and is never a valid fork
    // target.
    const history = [];
    for await (const snap of app.getStateHistory(config)) history.push(snap);
    const genesis = history.filter((snap) => snap.metadata?.source !== "input").at(-1)!;
    const genesisCheckpointId = genesis.config.configurable!.checkpoint_id as string;

    invocationCounts.clear();
    const correctedIngredients = [{ ...toRawIngredient("2 eggs"), usable: true }];
    const replay = await forkReplay(app, {
      sourceThreadId,
      checkpointId: genesisCheckpointId,
      newThreadId: "fork-target-genesis",
      patch: { ingredients: correctedIngredients },
    });

    expect(invocationCounts.size).toBe(0);
    expect(replay.state.ingredients).toEqual(correctedIngredients);
    expect(replay.next).toEqual(["parseIngredients"]);
  });
});
