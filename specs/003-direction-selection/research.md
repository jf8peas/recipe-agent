# Phase 0 Research: Direction Selection Stage

Resolves the technical unknowns for [plan.md](plan.md), and verifies the
planning request's claims directly against the current codebase before
adopting them. Format: **Decision**, **Rationale**, **Alternatives
considered**. Nothing here reopens a product decision already settled in
[spec.md](spec.md) or the [constitution](../../.specify/memory/constitution.md).

---

## R1 — Verified: the gap and the mirrored pattern are real

**Decision**: Proceed exactly as the planning request describes: a new
`selectDirection` node, inserted unconditionally between `proposeDirections`
and `draftRecipe`, shaped like `critique`.

**Rationale**: Read directly against the current code:
- `lib/agent/prompts.ts`'s `draftRecipePrompt` (line 50) does
  `const chosen = directions[0]` unconditionally — confirmed, the described
  defect is real.
- `lib/agent/nodes/critique.ts` confirms the exact shape to mirror: a
  `createChatModel(...).withStructuredOutput(OutputSchema, { name })` call,
  parsed with `OutputSchema.parse(result)`, returning a `Partial<State>`.
- `lib/agent/edges.ts`'s `routeAfterCritique` confirms the *contrast*: that's
  a genuine conditional edge (reads state to pick between two next nodes).
  `proposeDirections → selectDirection → draftRecipe` is not that shape — both
  new edges are unconditional (`.addEdge`), because selection changes what
  `draftRecipe` reads, not which node runs next. No new function belongs in
  `lib/agent/edges.ts`.

**Alternatives considered**: None — this section is verification, not a
design choice.

---

## R2 — Correction: the run-history timeline needs no new rendering code

**Decision**: The only change `lib/tree.ts` needs is adding `"selectDirection"`
to the `TimelineStage` union type. `lib/history.ts` and
`components/BranchTimeline.tsx` need **no** change at all.

**Rationale**: The planning request suggested checking "how a critique
cycle's step is currently rendered... and mirror it," implying possibly
bespoke per-stage rendering. Reading both files shows the opposite: a
checkpoint's `stage` is derived generically in `lib/history.ts:71` as
`parent!.next[0]` (whatever node LangGraph says runs next, read directly off
the checkpoint), and `BranchTimeline.tsx`'s `TreeList` renders
`entry.stage` as plain text with no per-stage switch/lookup anywhere. Once
`selectDirection` is a real node with a real edge into it, any checkpoint
whose parent's `next` is `["selectDirection"]` is automatically labeled and
displayed correctly — this is exactly the same reason `critique`/`refine`
cycles already display correctly with no bespoke code today. This is a
strictly simpler change than the planning request assumed.

**Alternatives considered**: A per-stage label lookup (e.g. "Direction
selected" instead of the raw `"selectDirection"` string) — rejected as scope
creep; no existing stage gets a friendlier label today (`BranchTimeline`
shows `parseIngredients`, `draftRecipe`, etc. verbatim), so `selectDirection`
shouldn't either, for consistency.

---

## R3 — `StageProgress.tsx` has its own separate, hardcoded stage list

**Decision**: `components/StageProgress.tsx`'s `STAGES` constant (currently
`["parseIngredients", "proposeDirections", "draftRecipe", "critique",
"refine", "finalize"]`) gets `"selectDirection"` inserted between
`"proposeDirections"` and `"draftRecipe"`.

**Rationale**: Unlike `BranchTimeline` (R2), this component enumerates the
happy-path stage list a second time, independently, to render the top-level
stepper. It is a second, genuinely separate source of the stage sequence that
the planning request didn't mention and that would otherwise silently
under-count and mis-step once the graph itself changes.

**Alternatives considered**: Deriving `StageProgress`'s list from
`NODE_NAMES` directly instead of its own constant — a real simplification,
but out of scope here (it would also need to filter out `ingredientError`,
which `NODE_NAMES` includes but the happy-path stepper doesn't show); noted
as a nice-to-have, not required by this feature.

---

## R4 — `FIELD_SCHEMAS.directions` needs a `.min(1)` added to make FR-015 real

**Decision**: `lib/field-consumers.ts`'s `FIELD_SCHEMAS.directions` changes
from `z.array(DishDirectionSchema)` (no length constraint today) to
`z.array(DishDirectionSchema).min(1)`.

**Rationale**: Spec FR-015 (from the clarification session) requires that an
edit leaving 0 candidate directions is "rejected as an invalid edit, same as
any edit that would leave a run unable to proceed." Today,
`FIELD_SCHEMAS.directions` has no minimum length — an edit down to `[]`
would pass validation silently and reach `selectDirection` with nothing to
judge. `.min(1)` makes the rejection real, surfacing through the exact same
inline-validation-error UX `DirectionsEditor.tsx` already has for any other
invalid edit (spec FR-024, already built) — no new error path needed. The
1-candidate case (FR-015's other half) is **not** a schema constraint; it's
handled inside `selectDirection` itself (R6).

**Alternatives considered**: Enforcing the full original 2-3 range on edits
too (`.min(2).max(3)`) — this was `/speckit-clarify`'s non-recommended
option (a new business rule beyond what the feature asked for); rejected,
matching the clarification's resolution.

---

## R5 — `directionSelection`'s shape

**Decision**:

```ts
export const DirectionSelectionSchema = z.object({
  selectedIndex: z.number().int().nonnegative(),
  explanation: z.string(),
  clearFavorite: z.boolean(),
});
export type DirectionSelection = z.infer<typeof DirectionSelectionSchema>;
```

`selectedIndex` indexes into `state.directions` (the array already in state —
no duplicated copy of the chosen direction's fields). `clearFavorite` is the
honest signal from the clarification session (`/speckit-clarify`, Q1): `true`
when a candidate was clearly favored, `false` when the pick was a default
among equivalents — mirroring `CritiqueSchema.blocking`'s role as a
structured, machine-readable verdict signal the app's own logic (not just the
displayed text) can branch on.

**Rationale**: An index is the natural, minimal reference given `directions`
is already an ordered array in state — the same pattern `draftRecipePrompt`
already used informally (`directions[0]`), just now explicit and recorded.
Keeping `explanation` a single string (not a structured breakdown like
`CritiqueSchema`'s `feasibility`/`flavorBalance`/`missingOrUnclear`) matches
spec.md's own Assumption: selection is "judging which idea to pursue, not
critiquing a finished piece of work" — a lighter judgment than critique's,
so a lighter output shape.

**Alternatives considered**: Storing a copy of the full chosen `DishDirection`
object instead of an index — rejected: it would duplicate data already in
`state.directions` and create an inconsistency risk if a later edit changes
`directions` without updating the copy. A structured explanation (mirroring
`Critique`) — rejected per spec.md's Assumption above.

---

## R6 — The 1-candidate case skips the model call entirely

**Decision**: `selectDirection` checks `state.directions.length` first. When
it's exactly 1, the node returns
`{ directionSelection: { selectedIndex: 0, explanation: "Only one direction was proposed, so it was used.", clearFavorite: true } }`
directly — no model call. Otherwise it proceeds with the structured-output
call the planning request describes.

**Rationale**: Spec FR-015 requires the 1-candidate case to be "trivially"
selected, not judged. There is nothing to compare, so invoking a model to
"choose" the only option would be pure wasted latency/cost for a
deterministic outcome — the same reasoning `routeAfterParseIngredients`
already applies by skipping straight to `ingredientError` without a model
call when there's nothing usable to propose from.

**Alternatives considered**: Always calling the model, letting it "confirm"
the single candidate — rejected as needless cost/latency for a knowably
constant outcome.

---

## R7 — Existing test blast radius (for `/speckit-tasks` to enumerate, not resolved here)

**Decision**: 19 test files matched an initial grep for
`proposeDirections`/`draftRecipe`; reading each match in context narrows that
to **12 files with a real, necessary change** and 7 confirmed false
positives (a string match unrelated to stage sequencing — e.g.
`step-commit.test.ts`'s comment asserting `proposeDirections` was *not*
invoked during a commit-retry, or `start.test.ts`/`state.test.ts` asserting
`next` right after `parseIngredients`, which is unaffected since
`proposeDirections` still immediately follows it).

**Files needing a real change** (exact fix enumerated per-file in
`tasks.md`): `tests/integration/graph.test.ts`,
`tests/contract/{step,fork}.test.ts`,
`tests/unit/{field-consumers,fork-replay,history}.test.ts`,
`tests/e2e/{us1-stage-failure,us2-inspect-history,us3-fork-replay,
us3-invalid-edit,us4-resume,about-slideshow}.spec.ts`.

**Confirmed no change needed** (grep matched, content inspected, unrelated to
stage sequencing): `tests/unit/edges.test.ts` (matches a return-value string
in an unrelated `routeAfterParseIngredients` test), `tests/unit/
use-auto-run.test.ts` (a generic `next: [...]` loop-mechanics fixture —
any stage name works identically), `tests/contract/{start,state,
step-commit}.test.ts` (as above), `tests/e2e/{us1-cancel,us3-two-tabs}.
spec.ts` (both only reference `proposeDirections` as the stage immediately
after `parseIngredients`, unaffected).

**Rationale**: Every fixture that scripts a full run by queuing
`proposeDirections` then `draftRecipe` responses now needs a
`selectDirection` response queued (or a real one, for the 1-candidate fast
path) between them, and one more `step`/`invoke` call to actually advance
through the new node — the new node adds one real step to every full run
(spec FR-006, SC-005). This is real, mechanical, necessary propagation work
with no design decision left in it.

**Alternatives considered**: None.

---

## R8 — `about-content.ts` (feature 002) needs its stage list updated

**Decision**: `lib/about-content.ts`'s `EXECUTION_STAGES` array (currently 6
happy-path stages, feature 002) gains a `selectDirection` entry between
`proposeDirections` and `draftRecipe`.

**Correction (verified against the code)**: an earlier draft of this
research claimed `EXECUTION_STAGES`'s type (`ExecutionStage.name:
TimelineStage`) makes omitting the new entry a compile error. That's wrong —
`EXECUTION_STAGES: ExecutionStage[]` is a plain array with no exhaustiveness
check against the `TimelineStage` union; each element's `name` must be a
*valid* `TimelineStage`, but nothing requires every `TimelineStage` to
appear. Omitting `selectDirection` would compile fine and silently leave the
slideshow's Slide 5 content stale — this needs a real task in `tasks.md`,
not a "the compiler will catch it" assumption.

**Rationale**: Confirmed by the spec's own checklist note (flagged during
`/speckit-specify`) — this is real and small, but not self-enforcing; it
must be an explicit task.

**Alternatives considered**: None.

---

## R9 — No new API contract; no new dependency; no new route

**Decision**: No change to any `app/api/**/route.ts` file's shape, no new
route, no new dependency, no new database migration.

**Rationale**: `/state`, `/history`, `/step`, and `/fork` all already return
generic `State`/`TimelineEntry`-shaped payloads (confirmed:
`specs/001-recipe-agent/contracts/api.md` line 69 already types `next` as a
plain string array, not an enumerated literal union baked into the contract
doc) — adding a channel to `State` and a stage to `TimelineStage` flows
through automatically with no endpoint-level contract change.
`directionSelection` lives in the existing checkpoint-serialized graph state,
the same as every other channel — no new table, no migration.

**Alternatives considered**: None — this confirms Constitution Principle III
compliance (no new route, no new migration) directly.
