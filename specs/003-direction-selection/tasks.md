# Tasks: Direction Selection Stage

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/select-direction-node.md](contracts/select-direction-node.md), [research.md](research.md), [quickstart.md](quickstart.md)
**Feature Directory**: `specs/003-direction-selection`
**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v3.0.0

Format: `- [ ] [TaskID] [P?] [Story?] Description with exact file path`.
`[P]` = parallelizable (different file, no dependency on an incomplete task).
`[US1]`/`[US2]`/`[US3]` = the user story phase (spec.md priorities P1–P3);
omitted in Foundational and Polish.

No new dependency, route, or DB migration in this feature (plan.md
Constitution Check: PASS). Every task touches only `lib/agent/{state,
prompts,graph}.ts`, `lib/agent/nodes/{selectDirection,draftRecipe}.ts`,
`lib/{field-consumers,tree,about-content}.ts`,
`components/{StageProgress,StatePanel}.tsx`,
`components/fields/DirectionSelectionEditor.tsx`, and the 12 existing test
files research R7 verified need a real change (a 19-file grep found 7 false
positives — not touched by any task below).

---

## Phase 1: Foundational (blocking prerequisite — no user story starts before this)

- [X] T001 [P] Add `DirectionSelectionSchema`/`DirectionSelection` and the `directionSelection: DirectionSelection | null` field to `StateSchema`/`INITIAL_STATE` in `lib/agent/state.ts` (data-model.md § 1): `{ selectedIndex: number (int, >= 0); explanation: string; clearFavorite: boolean }`
- [X] T002 Add `selectDirectionPrompt(directions: DishDirection[], constraints: Constraints): string` to `lib/agent/prompts.ts`, following `proposeDirectionsPrompt`/`critiquePrompt`'s structure and `constraintsBlock()` usage — asks the model to judge the candidates and report an index, an explanation, and whether it was a clear favorite (contracts/select-direction-node.md) (depends on T001)
- [X] T003 Update `draftRecipePrompt` in `lib/agent/prompts.ts` to take a new `directionSelection: DirectionSelection | null` parameter and resolve the chosen direction as `directions[directionSelection?.selectedIndex ?? 0]` instead of `directions[0]` — the `?? 0` is the FR-014 defensive fallback for a pre-existing checkpoint only (contracts/select-direction-node.md "Downstream consumer") (depends on T001; same file as T002, sequential after it)
- [X] T004 Create `lib/agent/nodes/selectDirection.ts`, mirroring `lib/agent/nodes/critique.ts`'s shape (`createChatModel(MODELS.default).withStructuredOutput(...)`, `OutputSchema.parse(result)`): when `state.directions.length === 1`, return `{ directionSelection: { selectedIndex: 0, explanation: "Only one direction was proposed, so it was used.", clearFavorite: true } }` directly with no model call (research R6); otherwise invoke the model with `selectDirectionPrompt` and validate the result (depends on T001, T002)
- [X] T005 Update `lib/agent/nodes/draftRecipe.ts`'s call site to pass `state.directionSelection` through to `draftRecipePrompt` (depends on T003)
- [X] T006 In `lib/agent/graph.ts`: add a `directionSelection: Annotation<DirectionSelection | null>()` channel to `GraphState`, add `"selectDirection"` to `NODE_NAMES` (between `"proposeDirections"` and `"draftRecipe"`), and replace `.addEdge("proposeDirections", "draftRecipe")` with `.addEdge("proposeDirections", "selectDirection")` + `.addEdge("selectDirection", "draftRecipe")` (both unconditional — data-model.md § 2) (depends on T001, T004)
- [X] T007 [P] Add `"selectDirection"` to the `TimelineStage` union in `lib/tree.ts`, between `"proposeDirections"` and `"draftRecipe"` (research R2 — no other change needed in `lib/tree.ts`, `lib/history.ts`, or `components/BranchTimeline.tsx`; both are already fully generic over `TimelineStage`)

## Phase 2: User Story 1 - The finished recipe reflects a deliberately chosen direction (Priority: P1)

**Goal**: The core defect is fixed — `draftRecipe` drafts from the judged/selected direction, with a deterministic, honest fallback when no candidate is clearly better.
**Independent Test**: Run the graph through to a finished recipe with a fixture that makes one direction clearly best, and confirm the draft matches that direction, not automatically the first-listed one; separately confirm a no-clear-winner fixture still completes via the first-listed fallback.

- [X] T008 [US1] Extend `tests/integration/graph.test.ts`: (a) a full run where the `selectDirection` fixture picks a non-zero index, asserting `draftRecipe`'s output reflects that direction, not index 0; (b) a run where the fixture reports `clearFavorite: false`, asserting the run still completes and defaults to index 0; (c) a fixture with only 1 proposed direction, asserting `selectDirection` never invokes the mocked model; (d) FR-014 — a state with `directions` populated but `directionSelection` still `null` (simulating a pre-feature checkpoint), asserting `draftRecipe` falls back to `directions[0]` without erroring; (e) SC-005 — for a full run, assert the total count of real (non-`user-edit`) timeline entries is exactly one more than the pre-feature baseline, and that this count is identical whether advanced via manual single-steps or the auto-run loop (mirroring feature 001's SC-011 pattern) (depends on T004, T006)
- [X] T009 [US1] Update `tests/contract/step.test.ts`: the "normal: advances proposeDirections after parseIngredients" case's `expect(json.next).toEqual(["draftRecipe"])` (currently line ~120) must become `["selectDirection"]`; review every other `queueResponse("proposeDirections", ...)` case in the file and insert a `selectDirection` queue/step wherever that test also proceeds on to `draftRecipe` (depends on T004, T006)
- [X] T010 [P] [US1] Update `tests/contract/fork.test.ts`'s `createSessionAtDraft` helper (~line 80–93): insert a `queueResponse("selectDirection", ...)` and one more stage-advance between the existing `proposeDirections`/`draftRecipe` queue calls; update the helper's doc-comment (2 stage-advances → 3) and the "already ran 2 stage-advances" comment at ~line 250 (depends on T004, T006)
- [X] T011 [P] [US1] Update `tests/unit/fork-replay.test.ts`: every fixture that `invoke()`s through `proposeDirections` → `draftRecipe` (~lines 85–98, 132–174, including the off-by-one regression test) now produces one more real checkpoint — insert a `selectDirection` queue/step, and update the expected `realStages`/history-length counts and the chain-description comments accordingly (depends on T004, T006)
- [X] T012 [P] [US1] Update `tests/unit/history.test.ts` (~line 138–141): insert a `queueResponse("selectDirection", ...)` and stage-advance between the existing `proposeDirections`/`draftRecipe` queue calls, and update any timeline-length/stage-sequence assertions that follow (depends on T004, T006)
- [X] T013 [P] [US1] Update `tests/e2e/us1-stage-failure.spec.ts`: (a) fix the existing case (~line 34) — after the forced `proposeDirections` failure retries successfully, the next visible button is now `"Step (selectDirection)"`, not `"Step (draftRecipe)"`, and add one more `clickStep` if the test needs to reach `draftRecipe` afterward; (b) FR-011 — add a new case mirroring the existing `proposeDirections` one, using the `e2e-trigger-failure-selectDirection-<nonce>` fake-model sentinel to force `selectDirection` itself to fail once, confirming it enters `stage-failure` and a subsequent retry succeeds (depends on T004, T006)
- [X] T014 [P] [US1] Update `tests/e2e/us4-resume.spec.ts` (~lines 6–38): insert an extra `clickStep` for the new stage everywhere the test currently assumes one click after `proposeDirections` reaches `"Step (draftRecipe)"` (depends on T004, T006)
- [X] T015 [P] [US1] Update `tests/e2e/about-slideshow.spec.ts`'s "opening the slideshow while a stage is running" test (~line 56–68): after the backgrounded `proposeDirections` stage resolves, the next visible button is now `"Step (selectDirection)"`, not `"Step (draftRecipe)"` — fix that assertion (depends on T004, T006)

## Phase 3: User Story 2 - A user can see which direction was picked, and why (Priority: P2)

**Goal**: The selection is visible — as its own step in the run's history, and with its full detail (chosen direction, explanation, clear-favorite-vs-default signal) viewable in the state panel.
**Independent Test**: After a run has passed selection, open its history and confirm the new step appears in its correct position and shows which candidate was chosen and why — no editing involved.

- [X] T016 [US2] Create `components/fields/DirectionSelectionEditor.tsx`: a **read-only** view for now (mirrors `components/fields/CritiquesView.tsx`/`FinalRecipeView.tsx`'s read-only-only shape, not yet `DirectionsEditor.tsx`'s dual-mode shape) — props `{ directionSelection: DirectionSelection | null }`, rendering the chosen direction's title/summary (cross-referenced from the sibling `directions` array by `selectedIndex`), the explanation, and a plain-text (not color-only) indicator for `clearFavorite` (depends on T001)
- [X] T017 [P] [US2] In `components/StageProgress.tsx`, insert `"selectDirection"` into the `STAGES` constant between `"proposeDirections"` and `"draftRecipe"` (research R3 — this is a second, separate stage list from `TimelineStage`, not derived from it)
- [X] T018 [US2] In `components/StatePanel.tsx`, add a "Direction selected" section rendering `<DirectionSelectionEditor directionSelection={state.directionSelection} />` whenever `state.directionSelection` is non-null, following the same conditional-section pattern already used for the "Critique" and "Final recipe" sections (depends on T016)
- [X] T019 [US2] Extend `tests/e2e/us2-inspect-history.spec.ts`: insert the extra `clickStep` for `selectDirection` (~lines 6–7), and add an assertion that, after that step, the "Direction selected" section is visible showing the chosen candidate and explanation (depends on T006, T016, T018)

## Phase 4: User Story 3 - A user can correct the selection and continue from it (Priority: P3)

**Goal**: A user can edit the recorded selection (or the candidates it judged) and continue the run from that edit, via the existing fork mechanism — no new editing infrastructure.
**Independent Test**: Edit a completed selection to point at a different candidate, continue the run, and confirm the drafted recipe matches the edited selection, not the original.

- [X] T020 [US3] In `lib/field-consumers.ts` (data-model.md § 3, research R4): change `FIELD_CONSUMERS.directions` from `"draftRecipe"` to `"selectDirection"`; add `directionSelection: "draftRecipe"`; add `directionSelection: DirectionSelectionSchema` to `FIELD_SCHEMAS`; change `FIELD_SCHEMAS.directions` from `z.array(DishDirectionSchema)` to `z.array(DishDirectionSchema).min(1)`; insert `"selectDirection"` into `STAGE_ORDER` between `"proposeDirections"` and `"draftRecipe"` (depends on T001)
- [X] T021 [US3] Upgrade `components/fields/DirectionSelectionEditor.tsx` to a full dual-mode editor: add `editable`/`onChange` props and a JSON-textarea edit branch validated against `FIELD_SCHEMAS.directionSelection`, mirroring `components/fields/DirectionsEditor.tsx`'s exact pattern (raw-JSON state, inline schema-validated error, `onChange(value, error)`) (depends on T016, T020)
- [X] T022 [US3] In `components/StatePanel.tsx`, wire `editable`/`onFieldChange` through to `DirectionSelectionEditor` the same way every other editable field's section already does (depends on T018, T021)
- [X] T023 [P] [US3] Update `tests/unit/field-consumers.test.ts`: change the assertion of `FIELD_CONSUMERS.directions` to `"selectDirection"`; add a test case for the new `directionSelection` → `"draftRecipe"` entry; add a case confirming `FIELD_SCHEMAS.directions` now rejects an empty array (research R4) (depends on T020)
- [X] T024 [US3] Extend `tests/e2e/us3-fork-replay.spec.ts`: insert the extra `clickStep` for `selectDirection` wherever the test currently assumes 2 clicks reach `draftRecipe` (~lines 6–7, 44); add two new cases — per spec Acceptance Scenario 1, edit the recorded selection to a different candidate, continue the run, and confirm the drafted recipe reflects the edited selection with no new model call for selection itself; **and** per spec Acceptance Scenario 2 (FR-010), instead edit the candidate `directions` themselves right after they're proposed, continue the run, and confirm `selectDirection` runs (or re-runs) against the edited set rather than the original candidates (depends on T006, T021, T022)
- [X] T025 [US3] Review `tests/e2e/us3-invalid-edit.spec.ts` (~line 6): confirm (and update if needed) whatever it asserts about which stage an edit to `directions` replays into — that consumer changed from `"draftRecipe"` to `"selectDirection"` (data-model.md § 3) (depends on T020)

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T026 [P] Insert a `selectDirection` entry into `EXECUTION_STAGES` in `lib/about-content.ts` (feature 002's "About This App" slideshow, Slide 5), between `proposeDirections` and `draftRecipe` — **not** compiler-enforced (research R8's correction: `EXECUTION_STAGES: ExecutionStage[]` has no exhaustiveness check against `TimelineStage`), so this is a manual task, not a safety net (depends on T007)
- [X] T027 Run the full verification pass: `npx tsc --noEmit`, `npx vitest run` (confirms no regression beyond the files this feature intentionally changed), `npm run build`, then `npx playwright test` twice in a row to confirm no new flakiness — covers spec SC-001 through SC-005 together (depends on T008–T026)

---

## Dependencies

```
T001 ─┬─> T002 ─> T003 ─> T005 ─┐
      │                          │
      ├─> T004 ────────────────┐ │
      │                        │ │
      └─────────> T006 <───────┘ │
                    │             │
      T007 ─────────┼─────────────┘  (independent type-only change)
                     │
   ┌─────────────────┼───────────────────────────────────┐
   │ US1 (T008–T015, all depend on T004 + T006)           │
   └─────────────────┬───────────────────────────────────┘
                      │
   ┌──────────────────┼───────────────────────────────────┐
   │ US2: T016 (dep T001) -> T018 (dep T016) -> T019       │
   │      T017 [P] independent                              │
   └──────────────────┬───────────────────────────────────┘
                      │
   ┌──────────────────┼───────────────────────────────────┐
   │ US3: T020 (dep T001) -> T021 (dep T016,T020) -> T022  │
   │      (dep T018,T021) -> T024 (dep T006,T021,T022)     │
   │      T023 [P] (dep T020); T025 (dep T020)              │
   └──────────────────┬───────────────────────────────────┘
                      │
                      v
              T026 (dep T007) ─> T027 (dep everything)
```

- **Foundational (T001–T007) blocks every user story** — this is a single
  cohesive graph change; unlike features 001/002, none of it is
  meaningfully splittable per-story, since even US1's own defect fix
  requires the full node/schema/edge wiring to exist.
- **US1 (T008–T015)** is the MVP: the defect is fixed and verified, with no
  UI visibility or editing yet (a developer could confirm this via the
  integration test alone).
- **US2 (T016–T019) and US3 (T020–T025) both build on US1's graph wiring**,
  but are independent of *each other* at the data layer — US2 (T016)
  intentionally builds only a read-only view; US3 (T021) upgrades that same
  component to a full editor rather than duplicating it, so **US3 depends on
  US2's T016**, not the other way around.
- T026–T027 close the feature out after every story is in place.

## Parallel Execution Examples

- **Foundational**: T007 (`lib/tree.ts`) is independent of the whole
  `state.ts → prompts.ts → nodes → graph.ts` chain (T001–T006) — run it
  alongside that chain.
- **Within US1**: T010, T011, T012, T013, T014, T015 all depend only on
  T004+T006 (already done by the time US1 starts), touch different files,
  and have no dependency on each other — five-way parallelizable. T008 and
  T009 are best done first/sequentially since they validate the mechanism
  the other test-file updates assume is correct.
- **Within US3**: T023 and T025 both depend only on T020, not on T021/T022's
  UI work — parallelizable with the editor upgrade.

## Implementation Strategy

1. **Foundational (T001–T007) first, always** — this feature has no
   meaningful "MVP slice" smaller than the full graph wiring; US1 cannot be
   even integration-tested without it.
2. **US1 (T008–T015) next**: the actual defect fix, verified by the
   integration test and every existing fixture that now needs to account
   for the new step. Ship-able on its own — the run is now correct, even
   before any UI shows the new step.
3. **US2 (T016–T019)**: visibility. Low-risk, additive UI.
4. **US3 (T020–T025)**: editability, building directly on US2's component
   rather than duplicating it.
5. **T026–T027** close the feature out with the same full-suite
   verification rigor used for features 001 and 002.
