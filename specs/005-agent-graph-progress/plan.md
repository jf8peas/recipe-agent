# Implementation Plan: Agent Graph Progress Diagram

**Feature Directory**: `specs/005-agent-graph-progress`
**Created**: 2026-09-19
**Status**: Draft
**Spec**: [spec.md](spec.md)
**Input**: Replace `components/StageProgress.tsx`'s flat, linear stepper
with a diagram showing a run's actual progression through the agent graph's
true topology — including its two conditional decision points and the
`ingredientError` node the replaced component omits entirely — reflecting
one specific run's real path (taken / current / not-yet-reached / untaken),
not an inferred straight line.

## Summary

`components/StageProgress.tsx` is deleted; a new `components/
AgentGraphProgress.tsx` replaces it at its exact call site in `app/page.tsx`,
now also receiving `timeline` and `branchId` (already fetched by
`useSession()` for the existing `BranchTimeline`, no new data source) so it
can reconstruct the real path taken rather than inferring progress from
`next`/`outcome` alone. A new pure module, `lib/graph-progress.ts`, derives
a per-node/per-edge visual state (taken/current/not-yet-reached/untaken)
from the timeline, correcting for a genuine data nuance confirmed in
research (a thread's own seed checkpoint is generically labeled
`"user-edit"`, one entry earlier than `parseIngredients`'s own, correctly-
labeled checkpoint — not a mislabeling of it). The diagram's visual
vocabulary is adapted from `components/about/diagrams.tsx`'s existing
`AgentGraphDiagram` (spec 004), resized to a compact `560×190` viewBox for
inline use. Accessibility is carried by a visually-hidden generated text
summary (not a second `aria-live` region, which would double up with
`RunningStage`'s existing one). No graph, edge, or API change.

## Technical Context

**Language / Runtime**: TypeScript, Node.js (existing toolchain — no
change; this feature ships no server/route code).
**Framework**: React components under Next.js App Router — no Route
Handler touched.
**Primary Dependencies**: None new. Inline SVG is a native browser feature,
already used elsewhere in this codebase.
**Storage**: None — reads already-fetched `TimelineEntry[]` data; no new
query, no new table, no migration.
**External Services**: None.
**Testing**: Vitest (`tests/unit/graph-progress.test.ts`, new — the pure
derivation function) and Playwright (`tests/e2e/agent-graph-progress.spec.ts`,
new) — no existing coverage to carry forward (confirmed: no unit test file
for `StageProgress.tsx` exists, and no e2e spec asserts on its output).
**Target Platform**: Unchanged — same Vercel deployment, same browser
target as every other feature.
**Performance Goals**: None beyond rendering promptly — `deriveRunPath`
runs over at most a few dozen timeline entries per render, negligible cost.
**Constraints**: No new dependency (Principle I); every new visual value
resolves through `app/tokens.css` (Principle VI); no Edge-runtime concern
(no route touched).
**Scale/Scope**: 1 file deleted (`components/StageProgress.tsx`), 2 new
files (`components/AgentGraphProgress.tsx`, `lib/graph-progress.ts`), 1 file
modified (`app/page.tsx`, call site only), 2 new test files.

No unresolved NEEDS CLARIFICATION — spec.md's own Clarifications session
resolved the one open product question (the revision loop's binary, not
counted, representation). The planning request's own open question (whether
`next`/`outcome` suffice) is fully resolved in research.md R1/R2.

## Constitution Check

*Gate: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I. Fixed Technology Stack | PASS | No dependency added or substituted. Inline SVG is a standard browser feature already used three times in this codebase. |
| II. Schema-Validated Graph State | N/A | No graph state channel touched — reads `State["outcome"]` and `TimelineEntry` (already-validated, already-produced data), writes nothing. |
| III. Node.js Serverless Runtime Discipline | N/A | No API route added, modified, or removed. |
| IV. Time-Travel State Integrity | N/A | No checkpoint, thread, or branch write — read-only over existing checkpoint-derived timeline data. |
| V. Client-Driven Step Execution | N/A | No step/invoke call added or changed. |
| VI. Session & UI Boundaries | PASS | No auth/sharing change. Every new visual value resolves through `app/tokens.css` — no new hard-coded value. This component sits in the existing running-session view's own layout, not a new panel — doesn't implicate the three-panel session structure any differently than the component it replaces did. |

**Result**: PASS — no deviations requiring justification.

## Project Structure

```
components/
  StageProgress.tsx            # DELETED — replaced by AgentGraphProgress
  AgentGraphProgress.tsx        # NEW — the diagram component (research R3/R4/R5)
lib/
  graph-progress.ts             # NEW — GRAPH_NODES/DECISION_POINTS constants +
                                 #   deriveRunPath (research R1/R2, data-model.md)
app/
  page.tsx                      # MODIFIED — call site only (research R7):
                                 #   StageProgress -> AgentGraphProgress, two
                                 #   new props (timeline, branchId)
tests/
  unit/
    graph-progress.test.ts      # NEW — deriveRunPath, every scenario in
                                 #   spec.md's US1 acceptance scenarios +
                                 #   Edge Cases (research R8)
  e2e/
    agent-graph-progress.spec.ts # NEW — the same scenarios through the real UI
```

`components/about/diagrams.tsx` (spec 004) is **not** touched — this
feature adapts its visual vocabulary (research R3) into a new, separate
component with its own run-state concept; the two diagrams share no code
and are never shown together.

## Phase 0: Research

See [research.md](research.md). Covers: confirming `history.timeline` (not
`buildTree()`) is the right data source, and the genuine nuance in how its
`isBranchRoot`/`"user-edit"` labeling actually works (R1); truncating by
`step` for a historical checkpoint view (R2); adapting spec 004's existing
`AgentGraphDiagram` visual vocabulary at a smaller, inline-appropriate size
(R3); the four required visual states and how the "untaken" side of a
decision point is distinguished from "not-yet-reached" (R4); the
accessibility approach — a visually-hidden text summary, an `aria-hidden`
`<svg>`, and explicitly no second `aria-live` region alongside
`RunningStage`'s existing one (R5); confirmation that no agent/graph code
needs to change (R6); the exact component/prop shape replacing
`StageProgress` (R7); and the test coverage plan (R8).

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — the graph topology constant, the
  `deriveRunPath` pure function's full contract, and the component's props.
- [contracts/agent-graph-progress-ui.md](contracts/agent-graph-progress-ui.md)
  — `AgentGraphProgress`'s prop contract and behavioral guarantees, in
  place of an API contract (no HTTP surface exists to change).
- [quickstart.md](quickstart.md) — manual verification flow for all three
  user stories, plus the automated test commands.

## Constitution Check (post-design)

Re-evaluated after Phase 1 — unchanged from pre-design; no new principle
implicated by the data model or contract. Still **PASS**.

## Complexity Tracking

No constitution deviation. One addition beyond the literal "replace this
component" framing, required by FR-004–FR-007's own correctness bar: a new
`lib/graph-progress.ts` module (rather than inlining the derivation inside
the component) — justified the same way `lib/session-title.ts` and
`lib/tree.ts` already are in this codebase: logic this fiddly (timeline
reinterpretation, step-truncation) is worth keeping independently testable
from its presentational caller, not a deviation from anything the
constitution requires.

## Progress Tracking

- [x] Technical Context filled
- [x] Constitution Check (pre-design) passed
- [x] Phase 0 research complete
- [x] Phase 1 data-model complete
- [x] Phase 1 contracts complete
- [x] Phase 1 quickstart complete
- [x] Constitution Check (post-design) passed
- [x] Agent context file updated
