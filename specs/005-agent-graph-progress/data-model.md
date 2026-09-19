# Phase 1 Data Model: Agent Graph Progress Diagram

No graph state channel, database table, or API contract changes (research
R6) — this is a pure client-side derivation over already-fetched data, plus
a presentational component. "Data model" here means the shape of the pure
derivation function, the topology constant it operates against, and the
component's own props.

---

## 1. Graph topology (`lib/graph-progress.ts`)

A fixed constant describing the same 8-node, 2-decision-point shape
documented in `design/v002/about.html` / `components/about/diagrams.tsx`'s
`AgentGraphDiagram` (research R3) — this feature's own source of truth for
layout, not re-derived from `lib/agent/graph.ts` (which has no
coordinate/layout concept of its own):

```ts
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
   * rounded-rect "End" treatment the About page's diagram gives its separate
   * End boxes — this compact version has no untracked decorative shapes, so
   * every rendered shape corresponds to exactly one `GraphNodeName` with its
   * own visual state (research R4), not a two-piece node+End-box pairing. */
  kind: "node" | "terminal";
  x: number;
  y: number;
}

export const GRAPH_NODES: GraphNodeLayout[]; // 8 entries, fixed coordinates

export interface DecisionPointLayout {
  id: "usable" | "blockingAndBudget";
  x: number;
  y: number;
  /** The node whose completion this decision follows. */
  after: GraphNodeName;
  /** The two possible next nodes, in a fixed order (first = "main path"). */
  routesTo: [GraphNodeName, GraphNodeName];
}

export const DECISION_POINTS: DecisionPointLayout[]; // 2 entries

export interface GraphEdge {
  from: GraphNodeName;
  to: GraphNodeName;
}

export const GRAPH_EDGES: GraphEdge[]; // 8 entries, the graph's fixed connections
```

`DECISION_POINTS`:
- `usable` — after `parseIngredients`, routes to `["proposeDirections", "ingredientError"]`.
- `blockingAndBudget` — after `critique`, routes to `["finalize", "refine"]` (`refine` loops back to `critique`, per `lib/agent/edges.ts`'s `routeAfterCritique`).

`GRAPH_EDGES` (8, used both for rendering connectors and for `deriveRunPath`'s
per-edge state): `parseIngredients->proposeDirections`,
`parseIngredients->ingredientError`, `proposeDirections->selectDirection`,
`selectDirection->draftRecipe`, `draftRecipe->critique`, `critique->finalize`,
`critique->refine`, `refine->critique`.

---

## 2. Run path derivation (`lib/graph-progress.ts`)

```ts
export type NodeVisualState = "taken" | "current" | "not-yet-reached" | "untaken";

export interface RunPathState {
  /** Per-node visual state, one entry for every GraphNodeName. */
  nodes: Record<GraphNodeName, NodeVisualState>;
  /** Per-edge visual state, keyed by "<from>->\<to>" (e.g. "critique->refine"). */
  edges: Record<string, NodeVisualState>;
  /** The single current node, or null if the run (as viewed) is terminal. */
  current: GraphNodeName | null;
  /** Ordered list of taken nodes, for the accessible text summary (research R5). */
  takenInOrder: GraphNodeName[];
}

export function deriveRunPath(
  timeline: TimelineEntry[],
  branchId: string,
  next: string[],
  outcome: State["outcome"],
  checkpointId: string, // whichever checkpoint is currently displayed — tip or historical
): RunPathState;
```

Behavior (research R1/R2, restated as the function's contract):

1. Filter `timeline` to `threadId === branchId`; locate `checkpointId`'s own
   entry within it (`viewedEntry`) to read its `step`.
2. Drop `isBranchRoot` entries and `kind === "stage-failure"` entries from
   the branch's own entries, sort by `step`, then filter to `step <=
   viewedEntry.step` — this naturally covers both the live tip (`checkpointId`
   is the tip's own, so nothing is truncated) and a historical view (research
   R2) with one mechanism, not two.
3. `takenInOrder` = the resulting `.stage` sequence, with `"parseIngredients"`
   prepended **only when the first real entry isn't already labeled
   `"parseIngredients"` itself** — a fresh session's own two automatic
   checkpoints (the generic pre-run seed, then parseIngredients's real,
   correctly-labeled output) already include it directly; a fork's replay
   writes only one checkpoint for that same territory, generically labeled
   `"user-edit"` as its own thread's root, so it needs the explicit prepend
   instead (confirmed against `tests/unit/history.test.ts` for both shapes).
   An empty list correctly represents the "run just started" case (spec Edge
   Cases) — including a fork at the very genesis checkpoint, before any node
   ran, which replays nothing.
4. `current` = terminal outcome → `null`; `"stage-failure"` outcome → the
   *viewed* entry's own `.stage` if it's the one with `kind: "stage-failure"`
   (falling back to `next[0]` if, unexpectedly, it isn't); otherwise →
   `next[0]` cast to `GraphNodeName`, or `null` if `next` is empty. Using
   `checkpointId` to identify the exact stage-failure entry (rather than
   scanning the branch for "the" stage-failure entry) is deliberate: a
   branch can accumulate more than one dead-end failure across retries,
   each staying `isLeaf: true` forever even after a later retry succeeds, so
   only the checkpoint actually being displayed unambiguously identifies
   the current one.
5. `nodes[n]` = `"current"` if `n === current`; else `"taken"` if `n` is in
   `takenInOrder`; else `"not-yet-reached"` (provisionally — decision points
   can still promote a `"not-yet-reached"` node to `"untaken"`, next).
6. Untaken-side promotion, evaluated **after** step 5, each independently:
   - `usable?`: once `ingredientError` is `taken`/`current`, `proposeDirections`
     (if still `"not-yet-reached"`) becomes `"untaken"` — and symmetrically
     the other way. Exactly one side ever gets promoted, since the run can
     only have gone one way.
   - `blocking & budget?`: `refine` (if still `"not-yet-reached"`) becomes
     `"untaken"` **only once `finalize` is `taken`/`current`** — not merely
     once `critique` has run once. `critique`'s own decision can re-resolve
     on every pass (a loop, not a one-shot fork like `usable?`), so treating
     "critique has run" as enough to promote `refine` would incorrectly mark
     a still-reachable future revision cycle as rejected the very first time
     `critique` completes and decides to refine. `finalize` itself never
     needs an `"untaken"` treatment — every successful run reaches it
     eventually, unlike `ingredientError`/`refine`, which a given run may
     permanently never revisit once past that point.
7. `edges["<from>-><to>"]` = `nodes[to]` for every fixed edge in
   `GRAPH_EDGES` — an edge's state is fully determined by the state of the
   node it leads into (including `refine->critique`, the loop-back edge,
   which reads `nodes.critique`).

Pure, synchronous, no React/DOM import — mirrors `lib/session-title.ts`'s
and `lib/tree.ts`'s own shape (a `lib/*.ts` module of plain functions,
imported by both the component and its unit tests).

---

## 3. Component props (`components/AgentGraphProgress.tsx`)

```ts
export interface AgentGraphProgressProps {
  timeline: TimelineEntry[];
  branchId: string;
  next: string[];
  outcome: State["outcome"];
  /** Whichever checkpoint is currently displayed — the live tip, or a
   * historical one from the History panel (research R2). Always required:
   * `deriveRunPath` uses it both to truncate the taken-path list and to
   * resolve the current node precisely for a `stage-failure` outcome. */
  checkpointId: string;
}
```

Calls `deriveRunPath` once per render (cheap — at most a few dozen timeline
entries per branch) and renders:
- A visually-hidden `<p>` (research R5) with the generated text summary.
- One `<svg aria-hidden="true">` (research R3/R4), optionally wrapped in the
  established bounded-horizontal-scroll-container pattern at narrow
  viewports (research R3).

No local component state — a pure function of props, same as the component
it replaces.

---

## 4. Relationship to existing entities

`TimelineEntry` (`lib/tree.ts`) and `State["outcome"]` (`lib/agent/state.ts`)
are read, never written. `GRAPH_NODES`/`DECISION_POINTS` are a new,
feature-owned layout constant — not a duplicate of `lib/agent/graph.ts`'s
own topology (which has no coordinates), and not a duplicate of
`components/about/diagrams.tsx`'s `AgentGraphDiagram` (a different,
illustrative-only component this one does not import from or share state
with — research R3 reuses its *visual vocabulary*, not its code, since that
component has no run-state concept at all).
