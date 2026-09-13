import type { BranchRow } from "./db/schema";

export type TimelineStage =
  | "parseIngredients"
  | "ingredientError"
  | "proposeDirections"
  | "draftRecipe"
  | "critique"
  | "refine"
  | "finalize"
  | "user-edit";

export type TimelineEntryKind =
  | "normal"
  | "in-progress"
  | "finalized"
  | "ingredient-error"
  | "stage-failure";

export interface TimelineEntry {
  checkpointId: string;
  threadId: string;
  parentCheckpointId: string | null;
  isBranchRoot: boolean;
  stage: TimelineStage;
  step: number;
  createdAt: string;
  kind: TimelineEntryKind;
  isLeaf: boolean;
}

export interface TreeNode {
  entry: TimelineEntry;
  children: TreeNode[];
}

/**
 * Builds the unified cross-branch tree (data-model.md § 2, research R2): a
 * branch-root entry's tree-parent is looked up via its `branches` row's
 * `forkedFromCheckpointId` (on the parent thread), not its own
 * `parentCheckpointId` (which is null within its own thread). Entries whose
 * resolved parent checkpoint isn't present in `entries` become roots — this
 * naturally covers a session's true root branch (`forkedFromCheckpointId`
 * null) as well as any orphaned/partial data.
 */
export function buildTree(entries: TimelineEntry[], branches: readonly BranchRow[]): TreeNode[] {
  const branchByThreadId = new Map(branches.map((b) => [b.thread_id, b]));
  const nodeByCheckpointId = new Map<string, TreeNode>();
  for (const entry of entries) {
    nodeByCheckpointId.set(entry.checkpointId, { entry, children: [] });
  }

  function resolveParentCheckpointId(entry: TimelineEntry): string | null {
    if (!entry.isBranchRoot) return entry.parentCheckpointId;
    const branch = branchByThreadId.get(entry.threadId);
    return branch?.forked_from_checkpoint_id ?? null;
  }

  const roots: TreeNode[] = [];
  for (const entry of entries) {
    const node = nodeByCheckpointId.get(entry.checkpointId)!;
    const parentCheckpointId = resolveParentCheckpointId(entry);
    const parentNode = parentCheckpointId ? nodeByCheckpointId.get(parentCheckpointId) : undefined;
    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byCreatedAt = (a: TreeNode, b: TreeNode) => a.entry.createdAt.localeCompare(b.entry.createdAt);
  for (const node of nodeByCheckpointId.values()) node.children.sort(byCreatedAt);
  roots.sort(byCreatedAt);

  return roots;
}
