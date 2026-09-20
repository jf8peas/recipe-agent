import type { TimelineEntry } from "./tree";
import type { State } from "./agent/state";

/**
 * The agent graph's fixed shape and layout for `AgentGraphProgress` (spec
 * 005) — the same 8-node, 2-decision-point topology as `components/about/
 * diagrams.tsx`'s `AgentGraphDiagram`, at coordinates sized for a compact,
 * inline diagram rather than a full-width reference page (research R3).
 *
 * Coordinates are a two-row "boustrophedon" layout (spec 006 US2,
 * data-model.md § 3): row 1 reads left-to-right (parseIngredients →
 * usable? → proposeDirections → selectDirection), row 2 sits directly
 * below and reads right-to-left (draftRecipe → critique → blocking? →
 * finalize) so each row-2 node shares its column (x) with the row-1 node
 * it's "under" — selectDirection/draftRecipe, proposeDirections/critique,
 * parseIngredients/finalize, and both decision diamonds share one column.
 * This makes the join connector (selectDirection → draftRecipe) and the
 * main-path edges within each row simple straight lines with no special
 * routing, and keeps `usable?`'s dead-end branch to `ingredientError` and
 * `blockingAndBudget?`'s to `refine` visually stacked between the rows —
 * every edge in `GRAPH_EDGES` is still just a straight line between two
 * fixed points (research R2); only the coordinate values changed.
 */

export type GraphNodeName =
  | "parseIngredients"
  | "ingredientError"
  | "proposeDirections"
  | "selectDirection"
  | "draftRecipe"
  | "critique"
  | "refine"
  | "finalize";

export interface GraphNodeLayout {
  name: GraphNodeName;
  /** "terminal" = `ingredientError` and `finalize` themselves render with the
   * rounded-rect "End" treatment — no separate untracked decorative shapes;
   * every rendered shape corresponds to exactly one `GraphNodeName`. */
  kind: "node" | "terminal";
  x: number;
  y: number;
  /** Which logical row this node sits in (spec 006 US2, data-model.md § 3).
   * `ingredientError` reads as row 1's dead-end branch (it hangs off row
   * 1's `usable?` diamond); `refine` reads as row 2's (it hangs off row
   * 2's `blockingAndBudget?` diamond and loops back up to `critique`). */
  row: 1 | 2;
}

// Column x-coordinates shared between the two rows so row-2 nodes align
// directly under their row-1 counterpart (see module-level comment above).
const COL_1 = 90; // parseIngredients / finalize
const COL_DIAMOND = 200; // usable? / blockingAndBudget?
const COL_2 = 310; // proposeDirections / critique
const COL_3 = 420; // selectDirection / draftRecipe
const ROW_1_Y = 70;
const ROW_2_Y = 230;

// Declared in natural graph-flow reading order (not layout/z-order) — this
// is also the order the accessible text summary lists nodes in
// (`describeRunPath` in `components/AgentGraphProgress.tsx`), so it should
// read naturally rather than in some incidental internal order.
export const GRAPH_NODES: GraphNodeLayout[] = [
  { name: "parseIngredients", kind: "node", x: COL_1, y: ROW_1_Y, row: 1 },
  { name: "proposeDirections", kind: "node", x: COL_2, y: ROW_1_Y, row: 1 },
  { name: "selectDirection", kind: "node", x: COL_3, y: ROW_1_Y, row: 1 },
  { name: "draftRecipe", kind: "node", x: COL_3, y: ROW_2_Y, row: 2 },
  { name: "critique", kind: "node", x: COL_2, y: ROW_2_Y, row: 2 },
  { name: "refine", kind: "node", x: COL_DIAMOND, y: 310, row: 2 },
  { name: "finalize", kind: "terminal", x: COL_1, y: ROW_2_Y, row: 2 },
  { name: "ingredientError", kind: "terminal", x: COL_DIAMOND, y: 150, row: 1 },
];

export interface DecisionPointLayout {
  id: "usable" | "blockingAndBudget";
  x: number;
  y: number;
  after: GraphNodeName;
  /** The two possible next nodes; first = the "main path" side. */
  routesTo: [GraphNodeName, GraphNodeName];
}

export const DECISION_POINTS: DecisionPointLayout[] = [
  {
    id: "usable",
    x: COL_DIAMOND,
    y: ROW_1_Y,
    after: "parseIngredients",
    routesTo: ["proposeDirections", "ingredientError"],
  },
  {
    id: "blockingAndBudget",
    x: COL_DIAMOND,
    y: ROW_2_Y,
    after: "critique",
    routesTo: ["finalize", "refine"],
  },
];

export interface GraphEdge {
  from: GraphNodeName;
  to: GraphNodeName;
}

export const GRAPH_EDGES: GraphEdge[] = [
  { from: "parseIngredients", to: "proposeDirections" },
  { from: "parseIngredients", to: "ingredientError" },
  { from: "proposeDirections", to: "selectDirection" },
  { from: "selectDirection", to: "draftRecipe" },
  { from: "draftRecipe", to: "critique" },
  { from: "critique", to: "finalize" },
  { from: "critique", to: "refine" },
  { from: "refine", to: "critique" },
];

const ALL_NODE_NAMES: GraphNodeName[] = GRAPH_NODES.map((n) => n.name);

export type NodeVisualState = "taken" | "current" | "not-yet-reached" | "untaken";

export interface RunPathState {
  nodes: Record<GraphNodeName, NodeVisualState>;
  /** Keyed by `"<from>->\<to>"`. */
  edges: Record<string, NodeVisualState>;
  current: GraphNodeName | null;
  takenInOrder: GraphNodeName[];
  /** Parallel to `takenInOrder` — the checkpoint that produced each entry,
   * or `null` for the synthesized leading `parseIngredients` (when it
   * wasn't its own distinct timeline entry, e.g. a fork's replayed root).
   * Lets callers that need a *specific past* occurrence of a repeatable
   * stage (`draftRecipe`/`refine`, `critique`) — not just its current
   * value — fetch that occurrence's own historical state. */
  takenCheckpoints: (string | null)[];
}

function edgeKey(from: GraphNodeName, to: GraphNodeName): string {
  return `${from}->${to}`;
}

/**
 * Derives one run's real progress through the graph from its own recorded
 * history (research R1/R2) — `next`/`outcome` alone can't distinguish a
 * straight run from one that took the `ingredientError` branch or looped
 * through `refine`.
 *
 * `checkpointId` is whichever checkpoint is currently being displayed (the
 * live tip, or a historical one from the History panel) — `(viewed ??
 * snapshot).checkpointId`. It's used both to truncate the taken-path list to
 * that point in history, and — for a `stage-failure` outcome specifically —
 * to identify exactly which attempted stage is current, since `next` isn't
 * a reliable source there (research R1 step 6).
 */
export function deriveRunPath(
  timeline: TimelineEntry[],
  branchId: string,
  next: string[],
  outcome: State["outcome"],
  checkpointId: string,
): RunPathState {
  const branchTimeline = timeline.filter((e) => e.threadId === branchId);
  const viewedEntry = branchTimeline.find((e) => e.checkpointId === checkpointId);

  let realEntries = branchTimeline
    .filter((e) => !e.isBranchRoot && e.kind !== "stage-failure")
    .sort((a, b) => a.step - b.step);

  if (viewedEntry) {
    realEntries = realEntries.filter((e) => e.step <= viewedEntry.step);
  }

  // The very first non-root entry on ANY thread (root or forked) is
  // sometimes `parseIngredients` itself, correctly labeled (a fresh
  // session's own `/start` produces two automatic checkpoints — the
  // generic pre-run seed, then parseIngredients's real output) — and
  // sometimes not (a fork's replay writes only ONE checkpoint for
  // everything up to and including parseIngredients's replayed output,
  // generically labeled "user-edit" as ITS thread's own root, per
  // tests/unit/history.test.ts). Either way, the existence of any real
  // entry at all proves parseIngredients completed; prepend it only when
  // it isn't already the first real entry, to avoid double-counting it.
  const takenInOrder: GraphNodeName[] = [];
  const takenCheckpoints: (string | null)[] = [];
  if (realEntries.length > 0 && realEntries[0]!.stage !== "parseIngredients") {
    takenInOrder.push("parseIngredients");
    takenCheckpoints.push(null);
  }
  for (const e of realEntries) {
    takenInOrder.push(e.stage as GraphNodeName);
    takenCheckpoints.push(e.checkpointId);
  }

  const takenSet = new Set(takenInOrder);

  let current: GraphNodeName | null;
  if (outcome === "finalized" || outcome === "ingredient-error") {
    current = null;
  } else if (outcome === "stage-failure") {
    current =
      (viewedEntry?.kind === "stage-failure"
        ? (viewedEntry.stage as GraphNodeName)
        : (next[0] as GraphNodeName)) ?? null;
  } else {
    current = (next[0] as GraphNodeName) ?? null;
  }

  const nodes = {} as Record<GraphNodeName, NodeVisualState>;
  for (const name of ALL_NODE_NAMES) {
    if (name === current) nodes[name] = "current";
    else if (takenSet.has(name)) nodes[name] = "taken";
    else nodes[name] = "not-yet-reached";
  }

  // usable? — parseIngredients -> proposeDirections | ingredientError.
  // Exactly one side is untaken once the other side is taken/current.
  if (nodes.ingredientError === "taken" || nodes.ingredientError === "current") {
    if (nodes.proposeDirections === "not-yet-reached") nodes.proposeDirections = "untaken";
  } else if (nodes.proposeDirections === "taken" || nodes.proposeDirections === "current") {
    if (nodes.ingredientError === "not-yet-reached") nodes.ingredientError = "untaken";
  }

  // blocking & budget? — critique -> finalize | refine (loops back to
  // critique, possibly more than once). refine only reads as definitively
  // untaken once the run has reached finalize without ever visiting it —
  // not on critique's very first pass, which would prematurely mark a
  // still-reachable future refine cycle as "rejected" (research R4).
  // finalize itself never needs "untaken" — every successful run reaches it.
  if (nodes.finalize === "taken" || nodes.finalize === "current") {
    if (nodes.refine === "not-yet-reached") nodes.refine = "untaken";
  }

  // An edge's own state reflects whether *that specific transition* really
  // happened — not just its target node's state, which a naive `nodes[to]`
  // lookup would wrongly apply to every edge pointing at the same node
  // (e.g. both `draftRecipe->critique` and `refine->critique` land on
  // `critique`, but only one of them was actually just traversed, and the
  // other may never have happened at all). "taken" = this transition
  // occurred at least once (a consecutive pair anywhere in `takenInOrder`);
  // "current" = the one edge from the last completed stage into the
  // in-progress one. Any other edge defaults to "not-yet-reached" — except
  // a decision point's own two outgoing edges (`routesTo`), which fall back
  // to the target's own state so a rejected branch still reads "untaken".
  const lastTaken = takenInOrder[takenInOrder.length - 1] ?? null;
  function isDecisionBranch(from: GraphNodeName, to: GraphNodeName): boolean {
    return DECISION_POINTS.some((dp) => dp.after === from && (dp.routesTo[0] === to || dp.routesTo[1] === to));
  }
  function edgeState(from: GraphNodeName, to: GraphNodeName): NodeVisualState {
    for (let i = 0; i < takenInOrder.length - 1; i++) {
      if (takenInOrder[i] === from && takenInOrder[i + 1] === to) return "taken";
    }
    if (current && lastTaken === from && current === to) return "current";
    return isDecisionBranch(from, to) ? nodes[to] : "not-yet-reached";
  }

  const edges = {} as Record<string, NodeVisualState>;
  for (const { from, to } of GRAPH_EDGES) {
    edges[edgeKey(from, to)] = edgeState(from, to);
  }

  return { nodes, edges, current, takenInOrder, takenCheckpoints };
}
