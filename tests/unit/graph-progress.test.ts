import { describe, expect, it } from "vitest";
import { deriveRunPath, type GraphNodeName, type NodeVisualState } from "../../lib/graph-progress";
import type { TimelineEntry, TimelineStage, TimelineEntryKind } from "../../lib/tree";

const BRANCH = "branch-1";

let checkpointCounter = 0;
function entry(overrides: Partial<TimelineEntry> & { stage: TimelineStage; step: number }): TimelineEntry {
  checkpointCounter += 1;
  return {
    checkpointId: overrides.checkpointId ?? `cp-${checkpointCounter}`,
    threadId: overrides.threadId ?? BRANCH,
    parentCheckpointId: overrides.parentCheckpointId ?? null,
    isBranchRoot: overrides.isBranchRoot ?? false,
    stage: overrides.stage,
    step: overrides.step,
    createdAt: overrides.createdAt ?? new Date(2026, 0, 1, 0, 0, overrides.step).toISOString(),
    kind: overrides.kind ?? ("normal" as TimelineEntryKind),
    isLeaf: overrides.isLeaf ?? true,
  };
}

function root(step = 0): TimelineEntry {
  return entry({ stage: "user-edit", step, isBranchRoot: true, isLeaf: false });
}

const NODE_NAMES: GraphNodeName[] = [
  "parseIngredients",
  "ingredientError",
  "proposeDirections",
  "selectDirection",
  "draftRecipe",
  "critique",
  "refine",
  "finalize",
];

function statesFor(nodes: Record<GraphNodeName, NodeVisualState>, names: GraphNodeName[]): NodeVisualState[] {
  return names.map((n) => nodes[n]);
}

describe("deriveRunPath", () => {
  it("run just started: nothing taken, parseIngredients is current", () => {
    const timeline = [root(0)];
    const result = deriveRunPath(timeline, BRANCH, ["parseIngredients"], "in-progress", timeline[0]!.checkpointId);

    expect(result.takenInOrder).toEqual([]);
    expect(result.current).toBe("parseIngredients");
    expect(statesFor(result.nodes, NODE_NAMES)).toEqual([
      "current", // parseIngredients
      "not-yet-reached", // ingredientError
      "not-yet-reached", // proposeDirections
      "not-yet-reached", // selectDirection
      "not-yet-reached", // draftRecipe
      "not-yet-reached", // critique
      "not-yet-reached", // refine
      "not-yet-reached", // finalize
    ]);
  });

  it("ingredient-error path: only that path taken, zero main-path nodes taken", () => {
    const timeline = [
      root(0),
      entry({ stage: "parseIngredients", step: 1, isLeaf: false }),
      entry({ stage: "ingredientError", step: 2, kind: "ingredient-error" }),
    ];
    const tip = timeline[timeline.length - 1]!;
    const result = deriveRunPath(timeline, BRANCH, [], "ingredient-error", tip.checkpointId);

    expect(result.takenInOrder).toEqual(["parseIngredients", "ingredientError"]);
    expect(result.current).toBeNull();
    expect(result.nodes.proposeDirections).toBe("untaken");
    expect(result.nodes.selectDirection).toBe("not-yet-reached");
    expect(result.nodes.draftRecipe).toBe("not-yet-reached");
    expect(result.nodes.critique).toBe("not-yet-reached");
    expect(result.nodes.refine).toBe("not-yet-reached");
    expect(result.nodes.finalize).toBe("not-yet-reached");
  });

  it("several stages in and paused: exact prefix taken, current marked, rest not-reached", () => {
    const timeline = [
      root(0),
      entry({ stage: "parseIngredients", step: 1, isLeaf: false }),
      entry({ stage: "proposeDirections", step: 2, isLeaf: false }),
      entry({ stage: "selectDirection", step: 3 }),
    ];
    const tip = timeline[timeline.length - 1]!;
    const result = deriveRunPath(timeline, BRANCH, ["draftRecipe"], "in-progress", tip.checkpointId);

    expect(result.takenInOrder).toEqual(["parseIngredients", "proposeDirections", "selectDirection"]);
    expect(result.current).toBe("draftRecipe");
    expect(result.nodes.ingredientError).toBe("untaken");
    expect(result.nodes.critique).toBe("not-yet-reached");
    expect(result.nodes.refine).toBe("not-yet-reached");
    expect(result.nodes.finalize).toBe("not-yet-reached");
  });

  it("refine is NOT prematurely marked untaken on critique's very first blocking pass", () => {
    const timeline = [
      root(0),
      entry({ stage: "parseIngredients", step: 1, isLeaf: false }),
      entry({ stage: "proposeDirections", step: 2, isLeaf: false }),
      entry({ stage: "selectDirection", step: 3, isLeaf: false }),
      entry({ stage: "draftRecipe", step: 4, isLeaf: false }),
      entry({ stage: "critique", step: 5 }),
    ];
    const tip = timeline[timeline.length - 1]!;
    // critique's first pass just decided to loop back to refine.
    const result = deriveRunPath(timeline, BRANCH, ["refine"], "in-progress", tip.checkpointId);

    expect(result.current).toBe("refine");
    expect(result.nodes.refine).toBe("current");
    expect(result.nodes.finalize).toBe("not-yet-reached");
  });

  it("revised at least once: the loop is taken, distinguishing it from a straight-through run", () => {
    const timeline = [
      root(0),
      entry({ stage: "parseIngredients", step: 1, isLeaf: false }),
      entry({ stage: "proposeDirections", step: 2, isLeaf: false }),
      entry({ stage: "selectDirection", step: 3, isLeaf: false }),
      entry({ stage: "draftRecipe", step: 4, isLeaf: false }),
      entry({ stage: "critique", step: 5, isLeaf: false }),
      entry({ stage: "refine", step: 6, isLeaf: false }),
      entry({ stage: "critique", step: 7 }),
    ];
    const tip = timeline[timeline.length - 1]!;
    const result = deriveRunPath(timeline, BRANCH, ["finalize"], "in-progress", tip.checkpointId);

    expect(result.takenInOrder).toContain("refine");
    expect(result.nodes.refine).toBe("taken");
    expect(result.current).toBe("finalize");
  });

  it("a run finalized successfully (no revision): full path taken, no current node, refine reads untaken", () => {
    const timeline = [
      root(0),
      entry({ stage: "parseIngredients", step: 1, isLeaf: false }),
      entry({ stage: "proposeDirections", step: 2, isLeaf: false }),
      entry({ stage: "selectDirection", step: 3, isLeaf: false }),
      entry({ stage: "draftRecipe", step: 4, isLeaf: false }),
      entry({ stage: "critique", step: 5, isLeaf: false }),
      entry({ stage: "finalize", step: 6, kind: "finalized" }),
    ];
    const tip = timeline[timeline.length - 1]!;
    const result = deriveRunPath(timeline, BRANCH, [], "finalized", tip.checkpointId);

    expect(result.takenInOrder).toEqual([
      "parseIngredients",
      "proposeDirections",
      "selectDirection",
      "draftRecipe",
      "critique",
      "finalize",
    ]);
    expect(result.current).toBeNull();
    expect(result.nodes.refine).toBe("untaken");
    expect(result.nodes.ingredientError).toBe("untaken");
  });

  it("stage-failure as current: the failed stage is current, not taken, not never-reached", () => {
    const failureCp = "cp-failure";
    const timeline = [
      root(0),
      entry({ stage: "parseIngredients", step: 1, isLeaf: false }),
      entry({
        checkpointId: failureCp,
        stage: "proposeDirections",
        step: 2,
        kind: "stage-failure",
      }),
    ];
    const result = deriveRunPath(timeline, BRANCH, [], "stage-failure", failureCp);

    expect(result.current).toBe("proposeDirections");
    expect(result.takenInOrder).toEqual(["parseIngredients"]);
    expect(result.nodes.proposeDirections).toBe("current");
  });

  it("stage-failure as current: picks the checkpoint actually displayed, not just any dead-end failure on the branch", () => {
    const timeline = [
      root(0),
      entry({ stage: "parseIngredients", step: 1, isLeaf: false }),
      // An earlier failure that was retried successfully — stays a
      // childless sibling forever, but is no longer "current".
      entry({ checkpointId: "cp-old-failure", stage: "proposeDirections", step: 2, kind: "stage-failure" }),
      entry({ stage: "proposeDirections", step: 2, isLeaf: false }),
      entry({ stage: "selectDirection", step: 3, isLeaf: false }),
      entry({ stage: "draftRecipe", step: 4, isLeaf: false }),
      // The actually-current failure.
      entry({ checkpointId: "cp-current-failure", stage: "critique", step: 5, kind: "stage-failure" }),
    ];
    const result = deriveRunPath(timeline, BRANCH, [], "stage-failure", "cp-current-failure");

    expect(result.current).toBe("critique");
  });

  it("a forked branch's own path: parseIngredients is still correctly inferred taken with no directly-labeled entry", () => {
    // A fork's replay writes exactly one checkpoint for its own root
    // (generically "user-edit", representing parseIngredients's replayed
    // output — lib/fork-replay.ts's START-attributed call), then correctly
    // labels every subsequent replayed stage.
    const forkedThread = "branch-fork";
    const timeline = [
      entry({ threadId: forkedThread, stage: "user-edit", step: 0, isBranchRoot: true, isLeaf: false }),
      entry({ threadId: forkedThread, stage: "proposeDirections", step: 1, isLeaf: false }),
      entry({ threadId: forkedThread, stage: "selectDirection", step: 2, isLeaf: false }),
      entry({ threadId: forkedThread, stage: "draftRecipe", step: 3 }),
    ];
    const tip = timeline[timeline.length - 1]!;
    const result = deriveRunPath(timeline, forkedThread, ["critique"], "in-progress", tip.checkpointId);

    expect(result.takenInOrder).toEqual([
      "parseIngredients",
      "proposeDirections",
      "selectDirection",
      "draftRecipe",
    ]);
    expect(result.current).toBe("critique");
  });

  it("viewing a historical checkpoint: truncates to that point, ignoring the live tip's later progress", () => {
    const timeline = [
      root(0),
      entry({ stage: "parseIngredients", step: 1, isLeaf: false }),
      entry({ stage: "proposeDirections", step: 2, isLeaf: false }),
      entry({ checkpointId: "cp-select", stage: "selectDirection", step: 3, isLeaf: false }),
      entry({ stage: "draftRecipe", step: 4, isLeaf: false }),
      entry({ stage: "critique", step: 5, isLeaf: false }),
      entry({ stage: "finalize", step: 6, kind: "finalized" }),
    ];
    // The caller passes the VIEWED checkpoint's own next/outcome, not the tip's.
    const result = deriveRunPath(timeline, BRANCH, ["draftRecipe"], "in-progress", "cp-select");

    expect(result.takenInOrder).toEqual(["parseIngredients", "proposeDirections", "selectDirection"]);
    expect(result.current).toBe("draftRecipe");
    expect(result.nodes.critique).toBe("not-yet-reached");
    expect(result.nodes.finalize).toBe("not-yet-reached");
  });
});
