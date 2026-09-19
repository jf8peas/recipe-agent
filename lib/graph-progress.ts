import type { TimelineEntry } from "./tree";
import type { State } from "./agent/state";

/**
 * The agent graph's fixed shape and layout for `AgentGraphProgress` (spec
 * 005) — the same 8-node, 2-decision-point topology as `components/about/
 * diagrams.tsx`'s `AgentGraphDiagram`, at coordinates sized for a compact,
 * inline diagram rather than a full-width reference page (research R3).
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
}

// Declared in natural graph-flow reading order (not layout/z-order) — this
// is also the order the accessible text summary lists nodes in
// (`describeRunPath` in `components/AgentGraphProgress.tsx`), so it should
// read naturally rather than in some incidental internal order.
export const GRAPH_NODES: GraphNodeLayout[] = [
  { name: "parseIngredients", kind: "node", x: 35, y: 45 },
  { name: "proposeDirections", kind: "node", x: 175, y: 45 },
  { name: "selectDirection", kind: "node", x: 245, y: 45 },
  { name: "draftRecipe", kind: "node", x: 315, y: 45 },
  { name: "critique", kind: "node", x: 385, y: 45 },
  { name: "refine", kind: "node", x: 455, y: 150 },
  { name: "finalize", kind: "terminal", x: 525, y: 45 },
  { name: "ingredientError", kind: "terminal", x: 105, y: 150 },
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
    x: 105,
    y: 45,
    after: "parseIngredients",
    routesTo: ["proposeDirections", "ingredientError"],
  },
  {
    id: "blockingAndBudget",
    x: 455,
    y: 45,
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
  if (realEntries.length > 0 && realEntries[0]!.stage !== "parseIngredients") {
    takenInOrder.push("parseIngredients");
  }
  for (const e of realEntries) takenInOrder.push(e.stage as GraphNodeName);

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

  const edges = {} as Record<string, NodeVisualState>;
  for (const { from, to } of GRAPH_EDGES) {
    edges[edgeKey(from, to)] = nodes[to];
  }

  return { nodes, edges, current, takenInOrder };
}
