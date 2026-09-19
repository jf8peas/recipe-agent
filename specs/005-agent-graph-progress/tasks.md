# Tasks: Agent Graph Progress Diagram

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/agent-graph-progress-ui.md](contracts/agent-graph-progress-ui.md), [research.md](research.md), [quickstart.md](quickstart.md)
**Feature Directory**: `specs/005-agent-graph-progress`
**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v3.0.0

Format: `- [ ] [TaskID] [P?] [Story?] Description with exact file path`.
`[P]` = parallelizable (different file, no dependency on an incomplete task).
`[US1]`/`[US2]`/`[US3]` = the user story phase (spec.md priorities P1–P3);
omitted in Foundational and Polish.

No new dependency, route, or DB migration in this feature (plan.md
Constitution Check: PASS). No Setup phase — nothing to initialize (no new
tokens, no dead file to clean up); the feature starts directly at
Foundational.

---

## Phase 1: Foundational (blocking prerequisite — no user story starts before this)

- [X] T001 [P] Create `lib/graph-progress.ts`: the `GraphNodeName`, `NodeVisualState`, `RunPathState` types, and the `GRAPH_NODES`/`DECISION_POINTS`/`GRAPH_EDGES` layout constants (data-model.md § 1) — the same 8-node, 2-decision-point shape as `components/about/diagrams.tsx`'s `AgentGraphDiagram` (research R3), as plain coordinate data, no rendering
- [X] T002 In `lib/graph-progress.ts`, add `deriveRunPath(timeline, branchId, next, outcome, checkpointId)` (data-model.md § 2, research R1/R2): filter by `threadId`, drop `isBranchRoot` and `stage-failure` entries, sort by `step`, truncate to the entry matching `checkpointId`'s own step (covers both the live tip and a historical view with one mechanism), prepend `"parseIngredients"` only when it isn't already the first real entry (a fork's replay swallows it into the generic root label; a fresh session doesn't), resolve `current` (terminal → `null`; `stage-failure` → the *viewed* entry's own stage when it's the `stage-failure` one; else → `next[0]`), and compute each node's/edge's one of four states — with `refine` promoted to `untaken` only once `finalize` is taken/current, not merely once `critique` has run once (depends on T001, same file)
- [X] T003 [P] Extend `lib/agent/fake-model.ts`: add an `"e2e-trigger-blocking-critique"` ingredient sentinel (mirroring the existing `e2e-trigger-failure-<node>-<nonce>`/`e2e-slow` pattern documented at the top of the file) that makes `critique`'s fake response return `blocking: true` whenever that ingredient is present — needed because the existing fixture's `FIXED_CRITIQUE.blocking` is hardcoded `false`, so no current e2e test can trigger a `refine` cycle; with the sentinel present, the run naturally cycles `refine` up to `MAX_REFINE_CYCLES` before `routeAfterCritique` forces `finalize`, giving deterministic "revised-at-least-once" coverage. *`critique`'s own prompt has no ingredients list to read the sentinel from directly — see Notes.* (independent of T001/T002 — different file)

## Phase 2: User Story 1 - See the run's real path through the graph, not a misleading straight line (Priority: P1)

**Goal**: The diagram renders the graph's true 8-node topology and shows exactly the path this specific run has actually taken — including the `ingredientError` branch and any `refine` cycle — instead of a straight-line stepper that can misrepresent both.
**Independent Test**: Run a session that takes the ingredient-error path, and separately one that loops through a revision cycle, and confirm the diagram shows exactly what happened in each case.

- [X] T004 [US1] Create `components/AgentGraphProgress.tsx`: render one `<svg>` with all 8 nodes and both decision points (diamonds), adapted from `components/about/diagrams.tsx`'s `AgentGraphDiagram` geometry at a compact `560×190` viewBox with smaller node radii (research R3); apply `deriveRunPath`'s per-node/per-edge state via the four-treatment styling scheme — taken / current / not-yet-reached / untaken (research R4, contracts). *Built together with T008 (accessible summary) and T010 (bounded-scroll wrapper) in one pass — see Notes.* (depends on T002)
- [X] T005 [US1] In `app/page.tsx`, replace the `StageProgress` import and call with `AgentGraphProgress`, passing `timeline={history?.timeline ?? []}`, `branchId={(viewed ?? snapshot).branchId}`, `next={displayedNext}`, `outcome={displayedState?.outcome ?? snapshot.state.outcome}`, **and `checkpointId={(viewed ?? snapshot).checkpointId}`** (research R7; this last prop is what makes R2's historical-checkpoint truncation — and the stage-failure current-node resolution — actually work; omitting it would silently show the live tip's full path even while browsing an earlier checkpoint via the History panel) (depends on T004); delete `components/StageProgress.tsx`
- [ ] T006 [US1] Create `tests/unit/graph-progress.test.ts`: `deriveRunPath` covering run-just-started (nothing taken), ingredient-error path (only that path taken, zero main-path nodes), several-stages-in-and-paused (exact prefix taken, current marked, rest not-reached), revised-at-least-once (loop taken; assert `refine` is NOT prematurely marked `untaken` on critique's very first blocking pass, before the loop has resolved), a run finalized successfully (full seven-stage path taken, no current node — spec Edge Cases' "just finished" case, distinct from the ingredient-error termination case), the untaken-branch-side case at both decision points, the stage-failure-as-current case (including a branch with more than one dead-end failure, confirming the *displayed* `checkpointId` — not "the branch's leaf failure" — picks the right one), a forked branch's own path (confirming `parseIngredients` is still correctly inferred taken even though it has no directly-labeled entry on that thread), and the historical-checkpoint-truncation case (research R1/R2, data-model.md) (depends on T002)
- [X] T007 [US1] Create `tests/e2e/agent-graph-progress.spec.ts`: the run-just-started (in practice, "immediately after starting" — `/start` already runs `parseIngredients`), ingredient-error, several-stages-in-and-paused, and revised-at-least-once (using T003's new sentinel) scenarios through the real UI, asserting on the accessible text summary; a historical-view scenario (step forward, open an earlier checkpoint via the History panel, confirm truncation); **plus the US2/US3 scenarios, built in the same pass — see Notes.** (depends on T005, T003)

## Phase 3: User Story 2 - Get the same live progress information without seeing the diagram (Priority: P2)

**Goal**: A screen reader user gets the same "which stage is current, which path was taken" understanding a sighted user gets from the diagram, matching (not regressing from) the replaced component's `aria-current="step"` behavior.
**Independent Test**: Using only a screen reader, determine which stage a run is paused at and whether it took the ingredient-error path or a revision loop, for the same runs used in US1's test.

- [X] T008 [US2] Extend `components/AgentGraphProgress.tsx`: add a visually-hidden `<p>` (the `visuallyHiddenStyle` object already defined identically in `StageProgress.tsx`/`AboutSlideshow.tsx`) immediately before the `<svg>`, containing a generated sentence naming the current stage and the taken/not-taken path (research R5); add `aria-hidden="true"` to the `<svg>` itself — no `aria-live` region (research R5 — `RunningStage.tsx`'s own `role="status" aria-live="polite"` already announces stage transitions in flight; a second live region here would double-announce) (depends on T005)
- [X] T009 [US2] Extend `tests/e2e/agent-graph-progress.spec.ts`: confirm the visually-hidden summary names the current stage and the path taken; confirm the `<svg>` is `aria-hidden`; confirm no duplicate announcement fires alongside `RunningStage`'s existing live region while a stage is in flight; call `expectNoA11yViolations` (depends on T007, T008)

## Phase 4: User Story 3 - The diagram fits naturally into the running-session view (Priority: P3)

**Goal**: The diagram stays legible at the modest size appropriate for an inline status element, without forcing the page to scroll sideways at any supported width, and matches the app's light/dark theme.
**Independent Test**: View the running-session page at a range of widths, including a small phone width, and confirm the diagram stays legible and the page never scrolls sideways.

- [X] T010 [US3] In `components/AgentGraphProgress.tsx`, wrap the `<svg>` in the established bounded-horizontal-scroll-container pattern (`data-testid`, `role="group"`, `aria-label`, `tabIndex={0}`, `style={{ overflowX: "auto" }}`) as a narrow-viewport fallback (research R3) — the same pattern already used three times elsewhere in this codebase (depends on T008)
- [X] T011 [US3] Extend `tests/e2e/agent-graph-progress.spec.ts`: set the viewport to 320px, confirm no whole-page horizontal scroll while the diagram renders, and call `expectNoA11yViolations` at that width; repeat the no-overflow check at 1920px; toggle dark mode (via `prefers-color-scheme` emulation) and confirm the diagram renders (depends on T009, T010)

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T012 Run the full verification pass: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, then `npx playwright test` (full suite) twice in a row to confirm no new flakiness — covers spec SC-001 through SC-006 together (depends on T011)

## Notes — deviations from the staged plan, and bugs found during implementation

- **T004/T005/T008/T010 and T006/T007/T009/T011 built together, not staged.** As with prior features this session, the overlay/component and its e2e coverage were built once, correctly, in one continuous pass rather than through a deliberately-incomplete intermediate state.
- **A real prop-contract correction, found while implementing T002**: `deriveRunPath`'s planned optional `uptoCheckpointId` param was replaced with a single, always-required `checkpointId` (whichever checkpoint is currently displayed — tip or historical). Two reasons, both found only once the stage-failure logic was actually written: (a) a branch can accumulate more than one dead-end stage-failure across retries, each staying `isLeaf: true` forever — "the branch's leaf failure" doesn't reliably identify the *current* one, but the exact checkpoint being displayed does; (b) one mechanism doing both jobs (truncation + current-node resolution) is simpler than two parameters that would need to independently agree. `data-model.md`, `research.md` (R1/R2), and `contracts/agent-graph-progress-ui.md` were all corrected to match before the rest of the implementation proceeded.
- **A real logic bug caught before it shipped**: the first implementation of "untaken" promotion for `critique`'s decision point used "has `critique` run at all" as the trigger — which would have marked `refine` as permanently rejected the moment `critique`'s *first* pass decided to loop back to it (since `critique` having "run" doesn't mean its looping is *over*). Fixed to trigger only once `finalize` itself is taken/current — `research.md` R4 already specified this correctly; the bug was in a first draft of the code, not the design. A dedicated unit test ("refine is NOT prematurely marked untaken on critique's very first blocking pass") guards this.
- **A second, unanticipated data nuance found while writing T002**: re-reading `lib/fork-replay.ts` directly (not just its unit test) showed a forked thread's own first checkpoint is *always* generically labeled `"user-edit"` — including when it represents a replayed `parseIngredients`, unlike a fresh session's own two-checkpoint shape where `parseIngredients` gets its own correctly-labeled entry. `deriveRunPath` prepends `"parseIngredients"` only when it isn't already the first real entry, correctly handling both shapes without double-counting. `research.md` R1 was corrected to describe this precisely (an earlier draft of that section had this backwards for the forked case).
- **A real test-fixture bug found while writing T003/T007**: `critique`'s own prompt template has no ingredients list to read the `"e2e-trigger-blocking-critique"` sentinel from directly (unlike every other stage). Fixed by threading the sentinel through `recipeDraft.toBuy` in `draftRecipe`'s fake response (preserved by `refine`'s), since critique's prompt *does* include the full `recipeDraft` as JSON.
- **A real flakiness bug found only under the full e2e suite** (passed reliably standalone, failed intermittently in the full run): `useSession.ts`'s `step()` calls `setSnapshot(...)` synchronously but fires `fetchHistory()` unawaited — so `outcome` (tied to `snapshot`) and `timeline` (tied to `history`, a separate async fetch) can transiently disagree for one render. Not a component bug — fixed by switching the e2e assertions from a one-shot `textContent()` read to Playwright's auto-retrying `expect(locator).toHaveText(...)`, which waits out that window the same way the rest of this app's own tests already do.
- **A readability fix**: `GRAPH_NODES`' declared order (also the order the accessible summary lists nodes in) was reordered to natural graph-flow reading order (`..., critique, refine, finalize, ingredientError`) instead of an incidental layout-driven order, so the generated sentence reads naturally rather than in a `finalize, refine` sequence.

---

## Dependencies

```
T001 [P] ─> T002 ─────────────────────────┐
T003 [P] ──────────────────────────────────┤ (independent of T001/T002)
                                            │
      ┌─────────────────────────────────────┘
      │  US1
      v
T004 (dep T002) ─> T005 ─> T007 (dep T003 too)
              └──> T006 (dep T002)
                                            │
      ┌─────────────────────────────────────┘
      │  US2
      v
T008 (dep T005) ─> T009 (dep T007, T008)
                                            │
      ┌─────────────────────────────────────┘
      │  US3
      v
T010 (dep T008) ─> T011 (dep T009, T010)
                                            │
                                            v
                                          T012
```

- **Foundational (T001–T003) blocks every user story.** T003 (the fake-model
  sentinel) is independent of T001/T002 (different file) but still gates
  US1's own e2e task, since that's where the new sentinel is first used.
- **US1 (T004–T007) delivers the actual replacement** — the diagram exists,
  renders the true topology, and correctly reflects a specific run's path.
  Independently shippable: this alone already fixes the misleading
  ingredient-error bug that motivated the whole feature.
- **US2 (T008–T009) and US3 (T010–T011) both build on US1's finished
  component**, but are independent of each other — US2 only touches
  accessibility markup, US3 only touches the narrow-viewport wrapper.
- T012 closes the feature out once every story is in place.

## Parallel Execution Examples

- **Foundational**: T001 and T003 touch unrelated files — run together; T002
  depends on T001 (same file).
- **Polish**: nothing to parallelize — T012 is the single closing task.

## Implementation Strategy

1. **Foundational (T001–T003) first** — the pure derivation logic and the
   test-fixture sentinel needed to exercise it end-to-end.
2. **US1 (T004–T007) next**: the actual replacement ships here — correct
   topology, correct per-run state, wired into the page. This alone already
   retires the misleading straight-line stepper.
3. **US2 (T008–T009)**: the accessible text-summary layer, matching the
   replaced component's own accessibility bar.
4. **US3 (T010–T011)**: the narrow-viewport fallback and theme check.
5. **T012** closes the feature out with the same full-suite verification
   rigor used for features 002–004.
