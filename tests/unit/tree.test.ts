import { describe, expect, it } from "vitest";
import { buildTree, type TimelineEntry } from "../../lib/tree";
import type { BranchRow } from "../../lib/db/schema";

function entry(overrides: Partial<TimelineEntry> & Pick<TimelineEntry, "checkpointId">): TimelineEntry {
  return {
    threadId: "t1",
    parentCheckpointId: null,
    isBranchRoot: false,
    stage: "parseIngredients",
    step: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    kind: "normal",
    isLeaf: false,
    ...overrides,
  };
}

function branch(overrides: Partial<BranchRow> & Pick<BranchRow, "thread_id">): BranchRow {
  return {
    session_id: "s1",
    parent_thread_id: null,
    forked_from_checkpoint_id: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildTree", () => {
  it("single-root case: one branch, linear history", () => {
    const entries = [
      entry({ checkpointId: "c1", isBranchRoot: true, step: 0 }),
      entry({ checkpointId: "c2", parentCheckpointId: "c1", step: 1, isLeaf: true }),
    ];
    const branches = [branch({ thread_id: "t1" })];

    const roots = buildTree(entries, branches);

    expect(roots).toHaveLength(1);
    const root = roots[0]!;
    expect(root.entry.checkpointId).toBe("c1");
    expect(root.children).toHaveLength(1);
    const child = root.children[0]!;
    expect(child.entry.checkpointId).toBe("c2");
    expect(child.children).toHaveLength(0);
  });

  it("forks within a branch's own history: two children of the same in-thread parent", () => {
    const entries = [
      entry({ checkpointId: "c1", isBranchRoot: true, step: 0 }),
      entry({
        checkpointId: "c2",
        parentCheckpointId: "c1",
        step: 1,
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
      entry({
        checkpointId: "c3",
        parentCheckpointId: "c1",
        step: 1,
        createdAt: "2026-01-01T00:02:00.000Z",
        isLeaf: true,
      }),
    ];
    const branches = [branch({ thread_id: "t1" })];

    const roots = buildTree(entries, branches);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.children.map((c) => c.entry.checkpointId)).toEqual(["c2", "c3"]);
  });

  it("deep nesting: a chain of several stages", () => {
    const entries = [
      entry({ checkpointId: "c1", isBranchRoot: true, step: 0 }),
      entry({ checkpointId: "c2", parentCheckpointId: "c1", step: 1 }),
      entry({ checkpointId: "c3", parentCheckpointId: "c2", step: 2 }),
      entry({ checkpointId: "c4", parentCheckpointId: "c3", step: 3, isLeaf: true }),
    ];
    const branches = [branch({ thread_id: "t1" })];

    const roots = buildTree(entries, branches);

    let node = roots[0]!;
    const chain = [node.entry.checkpointId];
    while (node.children.length > 0) {
      node = node.children[0]!;
      chain.push(node.entry.checkpointId);
    }
    expect(chain).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("stitches two separate branches via a branches row into one tree", () => {
    const entries = [
      entry({ checkpointId: "c1", threadId: "t1", isBranchRoot: true, step: 0 }),
      entry({ checkpointId: "c2", threadId: "t1", parentCheckpointId: "c1", step: 1 }),
      entry({
        checkpointId: "c3",
        threadId: "t1",
        parentCheckpointId: "c2",
        step: 2,
        isLeaf: true,
      }),
      // Forked from t1's c2, replayed as its own thread's root.
      entry({
        checkpointId: "c10",
        threadId: "t2",
        isBranchRoot: true,
        step: 0,
        isLeaf: true,
      }),
    ];
    const branches = [
      branch({ thread_id: "t1" }),
      branch({ thread_id: "t2", parent_thread_id: "t1", forked_from_checkpoint_id: "c2" }),
    ];

    const roots = buildTree(entries, branches);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.entry.checkpointId).toBe("c1");
    const c2 = roots[0]!.children[0]!;
    expect(c2.entry.checkpointId).toBe("c2");
    const childCheckpointIds = c2.children.map((c) => c.entry.checkpointId).sort();
    expect(childCheckpointIds).toEqual(["c10", "c3"]);
  });
});
