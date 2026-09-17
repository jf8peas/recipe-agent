# Implementation Plan: Direction Selection Stage

**Feature Directory**: `specs/003-direction-selection`
**Created**: 2026-09-17
**Status**: Draft
**Spec**: [spec.md](spec.md)
**Input**: Close the gap where `proposeDirections` generates 2-3 candidate
directions but `draftRecipe` always drafts from `directions[0]`, discarding
the rest — add a `selectDirection` node mirroring `critique`'s shape that
judges the candidates and records which was chosen, wired into the graph,
timeline, and edit/fork mechanism the same way every other stage already is.

## Summary

One new node (`selectDirection`), one new state channel
(`directionSelection`), two edge changes (both unconditional — inserting the
new node between `proposeDirections` and `draftRecipe`), and updates to the
handful of existing places that already enumerate the fixed stage sequence
by name (the edit/fork consumer map, the on-screen stepper, the
`TimelineStage` type, and feature 002's slideshow content). No new
dependency, no new route, no new database table — `directionSelection` is
just one more channel in the existing checkpoint-serialized graph state, and
every existing API route already returns that state generically. The
heaviest part of this change isn't new code — it's updating the ~12 existing
test files that script a full run through the old
`proposeDirections → draftRecipe` sequence.

## Technical Context

**Language / Runtime**: TypeScript, Node.js (existing project toolchain — no
change; this feature ships no server/route code).
**Framework**: `@langchain/langgraph` graph definition
(`lib/agent/graph.ts`) — one new node, two edge changes. No Route Handler
touched.
**Primary Dependencies**: None new. Same `@langchain/openai`-via-OpenRouter
model call shape every other node already uses (constitution Principle I).
**Storage**: None new — `directionSelection` lives in the existing
`PostgresSaver`-checkpointed graph state; no migration.
**External Services**: None new — same OpenRouter integration point,
`MODELS.default` (the same tier `proposeDirections` already uses, not
`MODELS.critique` — research R5's rationale: judging which idea to pursue is
a lighter task than critiquing a finished draft).
**Testing**: Vitest (`tests/integration/graph.test.ts`,
`tests/contract/{step,fork}.test.ts`, `tests/unit/{field-consumers,
fork-replay,history}.test.ts`) + Playwright (`tests/e2e/{us1-stage-failure,
us2-inspect-history,us3-fork-replay,us3-invalid-edit,us4-resume,
about-slideshow}.spec.ts`) — all extended, none new (research R7, verified
per-file — an initial grep found 19 candidate files, 7 turned out to be
false positives on inspection).
**Target Platform**: Unchanged — same Vercel deployment, same graph compiled
once per warm lambda (`lib/agent/runtime.ts`, untouched).
**Performance Goals**: One additional model call per run in the common case
(2-3 candidates) — none in the 1-candidate case (research R6 skips the model
call entirely). No new latency target beyond the existing per-stage
expectations every node already meets.
**Constraints**: No new dependency (Principle I); every channel still a
plain last-value-wins `Annotation` (Principle IV); the new node picks up
`interruptAfter` automatically via `NODE_NAMES` (Principle V) — no
`runtime.ts` change.
**Scale/Scope**: 1 new node file, 1 new Zod schema + prompt function, 2 edge
changes, 1 new channel, 2 field-consumer-map entries, 1 new UI editor
component, 2 existing "enumerate every stage" call sites updated
(`StageProgress.tsx`, `TimelineStage`), 1 feature-002 content update, ~12
existing test files extended.

No unresolved NEEDS CLARIFICATION — spec.md's own Clarifications session
resolved the two decisions that would otherwise have landed here (the
tie/fallback verdict shape, the edited-candidate-count edge case); research.md
Phase 0 resolves every remaining implementation-detail question the planning
request left open (the `directions` edit-time floor, the 1-candidate fast
path, and two corrections against the planning request's assumptions — see
Complexity Tracking).

## Constitution Check

*Gate: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I. Fixed Technology Stack | PASS | No dependency added or substituted. Model call goes through the same `createChatModel(MODELS.default)` → OpenRouter → `@langchain/openai` path every node already uses; model ID still resolves only in `lib/agent/models.ts`. |
| II. Schema-Validated Graph State | PASS | New channel `directionSelection` gets its own Zod schema (`DirectionSelectionSchema`, data-model.md § 1), validated at the node boundary via `OutputSchema.parse(result)` exactly like `critique`'s own `CritiqueSchema` boundary check. |
| III. Node.js Serverless Runtime Discipline | PASS | No new API route — nothing to set `runtime`/`maxDuration` on. No new DB pool, no new migration; `directionSelection` is a graph-state channel, checkpointed by the existing `PostgresSaver` the existing pooled connection already uses. |
| IV. Time-Travel State Integrity | PASS | `directionSelection` is a plain `Annotation<DirectionSelection \| null>()` — last-value-wins, no reducer — so an edit (`/fork`) overwrites it cleanly, same as every other editable channel. No thread/branch semantics touched; forking still seeds a new thread by replaying recorded outputs (`lib/fork-replay.ts`, untouched). |
| V. Client-Driven Step Execution | PASS | `selectDirection` joins `NODE_NAMES`, so `interruptAfter: [...NODE_NAMES]` (`lib/agent/runtime.ts`, unmodified) picks it up automatically — it gets its own pause boundary for free. Step and Auto-run code (`hooks/useSession.ts`, `hooks/useAutoRun.ts`) need no change; a full run simply now takes one more single-node step (spec FR-006/SC-005). |
| VI. Session & UI Boundaries | PASS | No new route, no auth/sharing change. New UI (`DirectionSelectionEditor`) uses only `app/tokens.css` values, matching every existing field editor — no new design token needed (nothing here is a new *kind* of visual element, just one more object-shaped field using the same JSON-textarea editor pattern `DirectionsEditor`/`RecipeDraftEditor` already use). |

**Result**: PASS — no deviations requiring justification.

## Project Structure

```
lib/agent/
  state.ts               # MODIFIED — add DirectionSelectionSchema, DirectionSelection type,
                          #            directionSelection channel to StateSchema/INITIAL_STATE
  prompts.ts              # MODIFIED — add selectDirectionPrompt; draftRecipePrompt resolves
                          #            the chosen direction via directionSelection, not directions[0]
  graph.ts                # MODIFIED — directionSelection Annotation channel, "selectDirection"
                          #            in NODE_NAMES, rewired edges (proposeDirections ->
                          #            selectDirection -> draftRecipe, both unconditional)
  nodes/
    selectDirection.ts    # NEW — mirrors nodes/critique.ts's shape; skips the model call
                          #        entirely when only 1 candidate exists (research R6)
lib/
  field-consumers.ts       # MODIFIED — directions' consumer -> "selectDirection";
                          #            new directionSelection entry -> "draftRecipe";
                          #            FIELD_SCHEMAS.directions gains .min(1); STAGE_ORDER
                          #            gains "selectDirection"
  tree.ts                  # MODIFIED — TimelineStage gains "selectDirection"
  about-content.ts         # MODIFIED (feature 002) — EXECUTION_STAGES gains an entry
components/
  StageProgress.tsx         # MODIFIED — STAGES gains "selectDirection"
  StatePanel.tsx             # MODIFIED — dispatches to the new editor
  fields/
    DirectionSelectionEditor.tsx  # NEW — mirrors fields/DirectionsEditor.tsx's
                                   #        JSON-textarea + schema-validate pattern
tests/
  integration/graph.test.ts, contract/{step,fork}.test.ts,
  unit/{field-consumers,fork-replay,history}.test.ts,
  e2e/{us1-stage-failure,us2-inspect-history,us3-fork-replay,
  us3-invalid-edit,us4-resume,about-slideshow}.spec.ts
                          # MODIFIED (research R7, verified per-file) — every fixture that
                          #   scripts a full run now queues/steps through selectDirection too
```

No file outside this list is touched — in particular, `lib/history.ts`,
`components/BranchTimeline.tsx`, and `lib/agent/runtime.ts` need **no**
change (research R2, R1).

## Phase 0: Research

See [research.md](research.md). Covers: verifying the planning request's
claims against the real code (R1), two corrections against assumptions in
the planning request — the timeline needs no new rendering code (R2), and
`StageProgress.tsx` is a second, separate stage-list source the request
didn't mention (R3) — plus the `.min(1)` edit-validation fix the
clarification session's resolution requires but didn't spell out (R4), the
new schema's shape (R5), the 1-candidate fast path (R6), the full existing
test blast radius (R7), feature 002's propagation (R8), and confirmation of
no new API contract (R9).

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — the new channel, the amended
  `directions` row, the edge-graph before/after, the field-consumer-map
  amendment, and the feature 002 propagation (a manual task, not
  compiler-enforced — research R8's correction).
- [contracts/select-direction-node.md](contracts/select-direction-node.md) —
  `selectDirection`'s own input/output contract, in place of an API contract
  (no HTTP surface changes).
- [quickstart.md](quickstart.md) — manual verification flow for all three
  user stories, plus the (unchanged) automated test commands.

## Constitution Check (post-design)

Re-evaluated after Phase 1 — unchanged from pre-design; no new principle
implicated by the data model or contract. Still **PASS**.

## Complexity Tracking

No constitution deviation. Two corrections against the literal planning
request, both *simplifications*, recorded in full in research.md rather than
here:

- The run-history timeline needs no new rendering logic at all (R2) — the
  planning request's instruction to "check how a critique cycle's step is
  rendered and mirror it" turned out to already be automatic; the only real
  change is a type addition.
- `StageProgress.tsx` is a second, separate stage-list the planning request
  didn't mention, but does need the same one-line addition as
  `TimelineStage` (R3) — found by tracing every existing place the fixed
  stage sequence is hard-coded, not assumed from the request.

One addition beyond the literal request, required to make a clarified
requirement (FR-015) actually true rather than just described:
`FIELD_SCHEMAS.directions` gains `.min(1)` (R4) — without it, "0 candidates
is rejected as an invalid edit" would not actually happen.

## Progress Tracking

- [x] Technical Context filled
- [x] Constitution Check (pre-design) passed
- [x] Phase 0 research complete
- [x] Phase 1 data-model complete
- [x] Phase 1 contracts complete
- [x] Phase 1 quickstart complete
- [x] Constitution Check (post-design) passed
- [x] Agent context file updated
