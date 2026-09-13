import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { INITIAL_STATE, toRawIngredient } from "../../lib/agent/state";
import { buildGraph, NODE_NAMES } from "../../lib/agent/graph";
import { forkReplay } from "../../lib/fork-replay";
import { buildTimeline } from "../../lib/history";
import type { BranchRow } from "../../lib/db/schema";

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

const usableIngredient = { ...toRawIngredient("2 eggs"), name: "egg", usable: true };
const direction = { title: "Frittata", summary: "eggy bake", whyItFits: "uses the eggs" };
const draft = {
  title: "Spinach Frittata",
  servings: 2,
  steps: [{ order: 1, text: "Whisk eggs", minutes: 2, technique: null }],
  toBuy: [],
};

function branchRow(overrides: Partial<BranchRow> & Pick<BranchRow, "thread_id">): BranchRow {
  return {
    session_id: "s1",
    parent_thread_id: null,
    forked_from_checkpoint_id: null,
    created_at: new Date(),
    ...overrides,
  };
}

describe("buildTimeline", () => {
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

  afterEach(() => resetResponders());
  afterAll(async () => {
    await checkpointer.end();
    await testDb.stop();
  });

  it("flattens a single branch's real run, oldest step0 entry labeled user-edit, later ones by stage", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));

    const threadId = "history-single";
    const config = { configurable: { thread_id: threadId } };
    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      config,
    );
    while (result.ingredients[0]?.name === undefined) {
      result = await app.invoke(null, config);
    }

    const timeline = await buildTimeline(app, [branchRow({ thread_id: threadId })]);

    expect(timeline.length).toBeGreaterThanOrEqual(2);
    const oldestFirst = [...timeline].reverse();
    expect(oldestFirst[0]!.isBranchRoot).toBe(true);
    expect(oldestFirst[0]!.stage).toBe("user-edit");
    expect(oldestFirst[1]!.isBranchRoot).toBe(false);
    expect(oldestFirst[1]!.stage).toBe("parseIngredients");
    expect(oldestFirst[1]!.parentCheckpointId).toBe(oldestFirst[0]!.checkpointId);

    // Sorted newest-first overall.
    for (let i = 1; i < timeline.length; i += 1) {
      expect(timeline[i - 1]!.createdAt >= timeline[i]!.createdAt).toBe(true);
    }
  });

  it("shows a stage-failure entry and its retry as siblings sharing the same parent", async () => {
    queueResponse("parseIngredients", () => {
      throw new Error("boom");
    });
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));

    const threadId = "history-failure-retry";
    const config = { configurable: { thread_id: threadId } };
    const seed = { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] };
    await expect(app.invoke(seed, config)).rejects.toThrow("boom");

    const beforeFailure = await app.getState(config);
    // Simulate the /step route's stage-failure checkpoint write (research R4).
    await app.updateState(
      beforeFailure.config,
      { outcome: "stage-failure", failureReason: "boom" },
      "parseIngredients",
    );
    // Retry: plain invoke from the same pre-failure checkpoint (research R3).
    await app.invoke(null, beforeFailure.config);

    const timeline = await buildTimeline(app, [branchRow({ thread_id: threadId })]);
    const failureEntry = timeline.find((e) => e.kind === "stage-failure");
    const retryEntry = timeline.find((e) => e.kind === "normal" && e.stage === "parseIngredients");

    expect(failureEntry).toBeDefined();
    expect(retryEntry).toBeDefined();
    expect(failureEntry!.parentCheckpointId).toBe(retryEntry!.parentCheckpointId);
    expect(failureEntry!.checkpointId).not.toBe(retryEntry!.checkpointId);
  });

  it("stitches a forked branch onto its parent branch's fork point via the branches row", async () => {
    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));

    const sourceThreadId = "history-fork-source";
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

    const newThreadId = "history-fork-target";
    await forkReplay(app, {
      sourceThreadId,
      checkpointId: draftCheckpointId,
      newThreadId,
      patch: { recipeDraft: { ...draft, title: "Edited Title" } },
    });

    const branches = [
      branchRow({ thread_id: sourceThreadId }),
      branchRow({
        thread_id: newThreadId,
        parent_thread_id: sourceThreadId,
        forked_from_checkpoint_id: draftCheckpointId,
      }),
    ];
    const timeline = await buildTimeline(app, branches);

    const forkRootEntry = timeline.find((e) => e.threadId === newThreadId && e.isBranchRoot);
    expect(forkRootEntry).toBeDefined();
    expect(forkRootEntry!.stage).toBe("user-edit");
    // Its in-thread parentCheckpointId is null (its true parent is on a
    // different thread, resolved by lib/tree.ts via the branches row).
    expect(forkRootEntry!.parentCheckpointId).toBeNull();

    const sourceEntries = timeline.filter((e) => e.threadId === sourceThreadId);
    expect(sourceEntries.some((e) => e.checkpointId === draftCheckpointId)).toBe(true);
  });
});
