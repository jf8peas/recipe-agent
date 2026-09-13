import type { State } from "./agent/state";
import type { BranchRow } from "./db/schema";
import type { TimelineEntry, TimelineEntryKind, TimelineStage } from "./tree";
import type { buildGraph } from "./agent/graph";

type CompiledRecipeGraph = ReturnType<ReturnType<typeof buildGraph>["compile"]>;

interface RawSnapshot {
  checkpointId: string;
  parentCheckpointId: string | null;
  values: State;
  next: string[];
  createdAt: string;
  source: string;
  step: number;
}

/**
 * Flattens one branch's (LangGraph thread's) full checkpoint history into
 * `TimelineEntry[]` (data-model.md § 2). `getStateHistory` (`checkpointer.list`
 * under the hood) enumerates every checkpoint for the thread — including
 * sibling forks-within-a-thread (e.g. a failed attempt + its retry) — not
 * just the tip's ancestry chain, so this naturally captures those too.
 *
 * Each checkpoint's producing stage is derived from its PARENT's `next[0]`
 * (there is no `metadata.writes` field on this LangGraph version to read it
 * from directly): the parent's `next` names exactly the node that was about
 * to run, and `updateState`'s `asNode` is constrained to be one of those
 * names, so this holds for both real (`invoke`) and replayed (`updateState`)
 * checkpoints alike. A checkpoint with no visible parent (the branch's own
 * root — either a fresh fork's genesis, or the very first real checkpoint of
 * the session's root branch, whose true parent is LangGraph's internal
 * `"input"`/`"__start__"` scaffolding) is labeled `"user-edit"`: state
 * provided directly rather than produced by a node.
 */
async function readBranchTimeline(
  app: CompiledRecipeGraph,
  branch: BranchRow,
): Promise<TimelineEntry[]> {
  const raw: RawSnapshot[] = [];
  for await (const snapshot of app.getStateHistory({
    configurable: { thread_id: branch.thread_id },
  })) {
    raw.push({
      checkpointId: (snapshot.config.configurable as { checkpoint_id: string }).checkpoint_id,
      parentCheckpointId:
        (snapshot.parentConfig?.configurable as { checkpoint_id?: string } | undefined)
          ?.checkpoint_id ?? null,
      values: snapshot.values as State,
      next: snapshot.next,
      createdAt: snapshot.createdAt ?? new Date(0).toISOString(),
      source: snapshot.metadata?.source ?? "loop",
      step: snapshot.metadata?.step ?? 0,
    });
  }

  const byId = new Map(raw.map((r) => [r.checkpointId, r] as const));
  const childCount = new Map<string, number>();
  for (const r of raw) {
    if (r.parentCheckpointId) {
      childCount.set(r.parentCheckpointId, (childCount.get(r.parentCheckpointId) ?? 0) + 1);
    }
  }

  const entries: TimelineEntry[] = [];
  for (const r of raw) {
    if (r.source === "input") continue; // LangGraph's internal pre-START scaffolding

    const parent = r.parentCheckpointId ? byId.get(r.parentCheckpointId) : undefined;
    const isBranchRoot = !parent || parent.source === "input";
    const stage: TimelineStage = isBranchRoot ? "user-edit" : (parent!.next[0] as TimelineStage);

    entries.push({
      checkpointId: r.checkpointId,
      threadId: branch.thread_id,
      parentCheckpointId: isBranchRoot ? null : r.parentCheckpointId,
      isBranchRoot,
      stage,
      step: r.step,
      createdAt: r.createdAt,
      kind: kindOf(r.values, (childCount.get(r.checkpointId) ?? 0) === 0),
      isLeaf: (childCount.get(r.checkpointId) ?? 0) === 0,
    });
  }
  return entries;
}

function kindOf(values: State, isLeaf: boolean): TimelineEntryKind {
  if (values.outcome === "finalized") return "finalized";
  if (values.outcome === "ingredient-error") return "ingredient-error";
  if (values.outcome === "stage-failure") return "stage-failure";
  return isLeaf ? "in-progress" : "normal";
}

/** Builds the full, flat, newest-first timeline across every branch of a session. */
export async function buildTimeline(
  app: CompiledRecipeGraph,
  branches: readonly BranchRow[],
): Promise<TimelineEntry[]> {
  const perBranch = await Promise.all(branches.map((branch) => readBranchTimeline(app, branch)));
  return perBranch.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
