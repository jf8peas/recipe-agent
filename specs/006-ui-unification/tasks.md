# Tasks: UI Unification

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/ui-contracts.md](contracts/ui-contracts.md), [research.md](research.md), [quickstart.md](quickstart.md)
**Feature Directory**: `specs/006-ui-unification`
**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v4.0.0 (amended by this feature's own plan — Principle VI, research R8)

Format: `- [ ] [TaskID] [P?] [Story?] Description with exact file path`.
`[P]` = parallelizable (different file, no dependency on an incomplete task).
`[US1]`–`[US5]` = the user story phase (spec.md priorities P1–P3); omitted in
Foundational and Polish.

No new dependency, route, or DB migration (plan.md Constitution Check: PASS).
`lib/graph-progress.ts`'s `deriveRunPath`/types and every existing real
interaction's own logic are reused unchanged throughout — every task below
is presentation/layout only unless explicitly noted otherwise.

---

## Phase 1: Foundational (blocking prerequisite — no user story starts before this)

- [X] T001 [P] Create `components/ui/Button.tsx`: `variant?: "primary" | "secondary" | "link"` (default `"primary"`), extending `ButtonHTMLAttributes` (data-model.md § 1) — folds `ActionToolbar.tsx`'s existing `buttonStyle`/`secondaryButtonStyle` functions into one shared place
- [X] T002 [P] Create `components/ui/Card.tsx`: `{ heading?, children, style? }`, the same bordered/`radius-md`/`surface`/`space-4` visual result `StatePanel.tsx`'s current `sectionStyle` already produces (data-model.md § 1)
- [X] T003 [P] Create `components/ui/ListRow.tsx`: `{ title, subtitle, onOpen, onDelete, deleteLabel }` (data-model.md § 1) — matches `SessionList.tsx`'s existing full-row-button + separately-focusable delete-button pattern
- [X] T004 [P] Create `components/ui/TextArea.tsx`: `{ label } & TextareaHTMLAttributes` (data-model.md § 1) — matches `EntryForm.tsx`'s existing `<label htmlFor>`/`<textarea id>` pattern
- [X] T005 [P] Create `components/ui/Spinner.tsx`: the exact spinning-ring markup + `@keyframes` extracted verbatim from `components/RunningStage.tsx` (data-model.md § 1) — no visual change, just reuse
- [X] T006 [P] Create `components/ui/Toggle.tsx`: `{ checked, onChange, label }`, `role="switch"`, `aria-checked`, Space/Enter-operable, sliding thumb (data-model.md § 1, ported from `design/v003/design_files/Toggle.jsx`) — replaces the raw checkbox in `components/AppHeader.tsx`
- [X] T007 [P] Create `components/ui/Tabs.tsx`: `{ tabs: {id,label}[], activeId, onChange }`, `role="tablist"` + one `role="tab"` per entry with `aria-selected`, horizontally scrollable strip at narrow widths (contracts/ui-contracts.md)
- [X] T008 [P] Create `app/icon.svg`: the 64×64 rounded-square "RA" monospace mark (`--color-accent` background, `--color-accent-contrast` text) — Next.js App Router's file-based favicon convention, auto-wires `<link rel="icon">` with no `app/layout.tsx` edit needed (spec Clarifications — adopted as a permanent asset)
- [X] T009 [P] Create `lib/run-tabs.ts`: `TabId`, `STAGE_TO_TAB: Record<GraphNodeName, TabId | null>`, `TAB_LABELS`, `EDITABLE_TABS`, and the pure `visibleTabs(path: RunPathState): TabId[]` function (data-model.md § 4) — mirrors `lib/graph-progress.ts`'s own pure-module convention; `constraints` gets no tab of its own (research R6)

## Phase 2: User Story 1 - One consistent header, everywhere (Priority: P1)

**Goal**: One shared header component, two states, replacing the app's own header and the About page's separate one.
**Independent Test**: Open the app, the About page, and back again — confirm the header's height/spacing/background/control styling never changes, only its contents do; confirm the pause control operates like a switch via mouse, keyboard, and screen reader.

- [X] T010 [US1] Rewrite `components/AppHeader.tsx`: add `mode: "app" | "about"` prop (data-model.md § 2); `mode="app"` renders the mark+title, `Toggle` (T006), Author link, Feedback link, `Button variant="secondary"` "About This App" (T001); `mode="about"` renders the title+"— how it works" suffix, the existing topic `<nav>` (feature 004, unchanged), `Button variant="primary"` "Return to App" — both modes share the same height/background/border/padding. **State ownership, resolved**: `AppHeader.tsx` KEEPS self-managing its own `isAboutOpen` state and rendering `<AboutPage>` as its own sibling internally for the standard top-level (`mode="app"`, no `onOpenAbout` override passed) usage — exactly as today, no lifting to `app/layout.tsx` or anywhere else. `pauseBetweenStages`/`onTogglePause`/`onOpenAbout`/`onReturn` are optional props only for the second, separate `mode="about"` instance (T011) to use, which is fully props-controlled and owns no state of its own (depends on T001, T006)
- [X] T011 [US1] In `components/about/AboutPage.tsx`, replace its own inline `<header>` block with a *second, separate* `<AppHeader mode="about" onReturn={onClose} />` instance — this instance owns no `isAboutOpen` state itself (it's not the one that opens/closes the page; `AboutPage` already receives `open`/`onClose` from its own existing caller, feature 004) (depends on T010)
- [X] T012 [US1] Confirm `app/layout.tsx`'s existing `<AppHeader />` call site needs no prop changes at all for its default usage — it keeps rendering plain `<AppHeader />` (implicit `mode="app"`, self-managed `isAboutOpen`, matching T010's resolved state-ownership) exactly as today; this task is a verification/no-op unless something about the rewrite in T010 broke that default-usage path (depends on T010)
- [X] T013 [US1] Create `tests/e2e/ui-unification.spec.ts` (part 1): confirm the header's bounding box height and background are identical on an app screen and on the About page; confirm `Toggle` announces as `role="switch"`, toggles via click and via Space/Enter, and its `aria-checked` state is discoverable without sight; call `expectNoA11yViolations` and run a dark-mode pass (`page.emulateMedia({ colorScheme: "dark" })`) on the header itself (depends on T010, T011, T012)

## Phase 3: User Story 2 - The agent graph stays legible and reads as one connected diagram (Priority: P1)

**Goal**: A rebuilt two-row graph where every node stays at or above a legible minimum size at any width, still showing feature 005's real taken/current/not-yet-reached/untaken state correctly.
**Independent Test**: Resize the window from phone to desktop width while a run is active — confirm every node/connector stays legible, the diagram scales as one unit, and neither a horizontal nor vertical scrollbar appears on it.

- [X] T014 [US2] In `lib/graph-progress.ts`, add a `row: 1 | 2` field to `GraphNodeLayout` and update `GRAPH_NODES`'/`DECISION_POINTS`' `x`/`y` coordinates to the two-row layout — row 1: `parseIngredients` → `usable?` → `proposeDirections` → `selectDirection`; row 2 directly below, visually reversed: `draftRecipe` → `critique` → `blocking?` → `finalize` (data-model.md § 3, research R1/R2) — `GraphNodeName`, `NodeVisualState`, `RunPathState`, and `deriveRunPath` itself are UNCHANGED
- [X] T015 [US2] Rewrite `components/AgentGraphProgress.tsx`: render the new two-row SVG geometry (wider `viewBox`); a join connector from `selectDirection` down into `draftRecipe`; `ingredientError` hanging below `usable?` and `refine` hanging below `blocking?` as dashed dead-end branches, `refine` additionally connected back to `critique` by its own diagonal loop-back edge — all reading `RunPathState.nodes`/`.edges` exactly as before (research R2); keep the existing accessible text summary unchanged; add `onSelectNode?`/`selectedNode?` props (contracts/ui-contracts.md); keep the existing legibility-floor + bounded-horizontal-scroll-container fallback pattern from feature 005 (depends on T014)
- [X] T016 [US2] Extend `tests/e2e/ui-unification.spec.ts` (part 2): at a phone width and a desktop width, confirm every node stays legible and neither a horizontal nor a vertical scrollbar appears on the graph itself; re-run the ingredient-error and revised-at-least-once scenarios from `tests/e2e/agent-graph-progress.spec.ts` against the new two-row layout, confirming the accessible summary text is unchanged in content and that each of the four visual states (taken/current/not-yet-reached/untaken) still renders correctly in the new two-row shapes, not just in the text summary; call `expectNoA11yViolations` and run a dark-mode pass on the graph (depends on T015)

## Phase 4: User Story 3 - Jump between a run's stages without losing the controls (Priority: P2)

**Goal**: Stage outputs as tabs synced bidirectionally with the graph, with the action row always reachable.
**Independent Test**: Step a run forward through several stages, use both a graph node and a tab to jump between two completed stages, and confirm the actions row stays reachable throughout.

- [X] T017 [US3] Create `components/RunTabs.tsx`: one tab-body component per `TabId` (data-model.md § 4), each wrapping the corresponding unchanged `components/fields/*` editor (`IngredientsEditor`+`ConstraintsEditor` together on the `ingredients` tab per research R6, `DirectionsEditor`, `DirectionSelectionEditor`, `RecipeDraftEditor`, `CritiquesView`, `FinalRecipeView`) in the new `Card` (T002); editable tabs get a `Button variant="link"` "Edit this stage" wired to the existing real edit-start handler, `critique`/`final` do not; delete `components/StatePanel.tsx` (depends on T002, T009)
- [X] T018 [US3] In `app/page.tsx`: add the one new `activeTab` state variable; compute `visibleTabs(path)` (T009) each render and default `activeTab` to the newest visible tab whenever that set grows (data-model.md § 4); pass `onSelectNode`/`selectedNode` into `AgentGraphProgress` (T015) and `Tabs`/`RunTabs` (T007/T017) so selecting a node selects its tab and vice versa, resolving the `critique`/`refine` shared-tab case by preferring whichever is `current` (depends on T015, T017)
- [X] T019 [US3] Restyle `components/ActionToolbar.tsx`, `components/RunningStage.tsx` (onto the new `Spinner`, T005), `components/StageFailureBanner.tsx`, **and `components/UnsavedResultBanner.tsx`** (the fourth real component rendered in this same slot — the save-retry-after-202 state, previously missed) onto the `Button` primitive (T001) — no behavior change to any of the four. The sticky/bordered/`shadow-md` row treatment (matching `design_files/index.html`'s `.ra-action-row`) is applied **once**, in `app/page.tsx`, as a single wrapper `<div>` around the existing four-way conditional (`pendingSave ? <UnsavedResultBanner> : runningStage ? <RunningStage> : isStageFailure ? <StageFailureBanner> : <ActionToolbar>`) — not duplicated inside each of the four components (depends on T001, T005)
- [X] T020 [US3] Extend `tests/e2e/ui-unification.spec.ts` (part 3): confirm a tab appears as each stage completes; confirm clicking a graph node selects its tab and clicking a tab highlights its node; confirm the action row (idle/running/failed/unsaved-retry/done states) stays visible without scrolling regardless of the active tab or page length; confirm "Edit this stage" appears only on editable tabs; confirm FR-013's persistence rule specifically — select an earlier tab, confirm an unrelated re-render doesn't snap it back, then complete the next stage and confirm *that* moves it; call `expectNoA11yViolations` and run a dark-mode pass (`page.emulateMedia({ colorScheme: "dark" })`) on the running-session view (depends on T018, T019)

## Phase 5: User Story 4 - Every screen shares the same width, type, and building blocks (Priority: P2)

**Goal**: Session list and entry form restyled onto the shared primitives and visual language.
**Independent Test**: Visit the session list, entry form, an active run, and the About page in one sitting — confirm all four share the same content width and heading/list/button styling.

- [X] T021 [US4] Restyle `components/SessionList.tsx` onto `ListRow` (T003) and `Button` (T001) — same real data/handlers (`onOpen`, `onDelete`, `onNewSession`), only the rendering changes
- [X] T022 [US4] Restyle `components/EntryForm.tsx` onto `TextArea` (T004) and `Button` (T001) — same real validation/submit logic, only the rendering changes
- [X] T023 [US4] Extend `tests/e2e/ui-unification.spec.ts` (part 4): confirm the session list, entry form, an active run, and the About page all measure the same maximum content width, and that a session row's and the entry form's primary button visually match `ActionToolbar`'s primary button; call `expectNoA11yViolations` and run a dark-mode pass on the session list and the entry form (depends on T021, T022, T019)

## Phase 6: User Story 5 - The About page scrolls cleanly and matches the new visual language (Priority: P3)

**Goal**: A slim scrollbar, no stray focus outline from scrolling, and the About page's own agent-graph illustration restyled to the new two-row look.
**Independent Test**: Open the About page, scroll it by mouse and by dragging the scrollbar, and tab into its scrolling region — confirm the scrollbar is slim and no visible focus outline appears from scrolling alone.

- [X] T024 [US5] In `components/about/AboutPage.tsx`'s scrollable `<main>`: add `scrollbarWidth: "thin"`, `scrollbarColor: "var(--color-border) transparent"` inline, a scoped `<style>` block for `::-webkit-scrollbar`/`-thumb`/`-track` (matching `RunningStage.tsx`'s own precedent of a component-local `<style>` tag), and an explicit `outline: "none"` on the element itself (research R9) (depends on T011)
- [X] T025 [US5] Restyle `components/about/diagrams.tsx`'s `AgentGraphDiagram` (the About page's own separate, illustrative diagram — kept separate from the live `AgentGraphProgress` per spec Clarifications) to the new two-row visual language established in T015 — same illustrative/static content, new layout/shapes (depends on T015, T011)
- [X] T026 [US5] Extend `tests/e2e/ui-unification.spec.ts` (part 5): confirm the About page's scroll container reports the thin-scrollbar styling and shows no focus outline after a programmatic scroll; confirm its agent-graph illustration renders the two-row shapes; run a dark-mode pass (`page.emulateMedia({ colorScheme: "dark" })`) and `expectNoA11yViolations` on the About page (its own screen-specific check — T013/T016/T020/T023 already cover the header, graph, running-session, and session-list/entry-form screens individually) (depends on T024, T025)

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T027 [P] Run the token-discipline grep from quickstart.md across every file this feature touched; fix any raw hex color or pixel value found outside SVG diagram geometry
- [X] T028 [P] Audit `README.md` for any UI description this feature makes stale (e.g. the header's own described controls, if named) and update — likely minimal, matching research R10's expectation
- [X] T029 Run the full verification pass: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, then `npx playwright test` (full suite, including every existing `tests/e2e/*.spec.ts` — confirming no existing real interaction's behavior changed, only selectors that moved) twice in a row — covers spec SC-001 through SC-007 (depends on T013, T016, T020, T023, T026, T027, T028)

---

## Dependencies

```
T001 [P] ─┬────────────────────────────────────────────────────────────┐
T002 [P] ─┼────────────────────────────────────────────────────────────┤
T003 [P] ─┼────────────────────────────────────────────────────────────┤
T004 [P] ─┼────────────────────────────────────────────────────────────┤
T005 [P] ─┼────────────────────────────────────────────────────────────┤
T006 [P] ─┼────────────────────────────────────────────────────────────┤
T007 [P] ─┼────────────────────────────────────────────────────────────┤
T008 [P] ─┼────────────────────────────────────────────────────────────┤
T009 [P] ─┘  (Foundational — all independent files)                    │
                                                                         │
      ┌──────────────────────────────────────────────────────────────────┘
      │  US1                          US2
      v                               v
T010 (dep T001,T006)            T014 (no dep)
  │                                │
T011 (dep T010)                 T015 (dep T014)
T012 (dep T010)                    │
  │                              T016 (dep T015)
T013 (dep T010,T011,T012)
                                                                         │
      ┌──────────────────────────────────────────────────────────────────┘
      │  US3 (dep on US2's T015)
      v
T017 (dep T002,T009) ─┐
T019 (dep T001,T005) ─┼─> T018 (dep T015,T017) ─> T020 (dep T018,T019)
                                                                         │
      ┌──────────────────────────────────────────────────────────────────┘
      │  US4 (independent of US2/US3)
      v
T021 (dep T001,T003) ─┐
T022 (dep T001,T004) ─┴─> T023 (dep T021,T022,T019)
                                                                         │
      ┌──────────────────────────────────────────────────────────────────┘
      │  US5 (dep on US1's T011, US2's T015)
      v
T024 (dep T011) ─┐
T025 (dep T015,T011) ─┴─> T026 (dep T024,T025)
                                                                         │
                                                                         v
                                                    T027, T028 [P] ─> T029
```

- **Foundational (T001–T009) blocks every user story** — every primitive and
  the pure `run-tabs.ts` module are consumed by at least one later story.
- **US1 (T010–T013) and US2 (T014–T016) are the two P1 stories and are
  independent of each other** — the header doesn't touch the graph, and the
  graph doesn't touch the header. Both can proceed in parallel once
  Foundational is done.
- **US3 (T017–T020) depends on US2's rebuilt graph** (`T015`, for the
  `onSelectNode`/`selectedNode` props) but not on US1.
- **US4 (T021–T023) is independent of US2/US3** — it only needs Foundational
  plus US3's `ActionToolbar` restyle (`T019`) for its own cross-screen
  button-consistency check in `T023`.
- **US5 (T024–T026) depends on US1 (the About page's header swap, `T011`)
  and US2 (the new graph visual language, `T015`)**, but not on US3/US4.
- **T029 closes the feature out** once every story's own tests pass,
  including a full regression pass of the pre-existing e2e suite.

## Parallel Execution Examples

- **Foundational**: T001–T009 are 9 independent files — run all in parallel.
- **After Foundational**: US1's `T010` and US2's `T014` can start
  simultaneously (different files, no shared dependency beyond Foundational).
- **US4**: `T021` and `T022` touch different files — run together.

## Implementation Strategy

1. **Foundational (T001–T009) first** — every primitive, the favicon asset,
   and the pure tab-derivation module, none of which depend on anything else
   in this feature.
2. **US1 (T010–T013) and US2 (T014–T016) next, in parallel** — the two P1
   stories; either alone is independently shippable and already delivers
   real "unification" value (a consistent header, or a legible graph).
3. **US3 (T017–T020)**: the tab/graph sync — the interaction-model payoff,
   building on US2's rebuilt graph.
4. **US4 (T021–T023)**: session list and entry form restyled onto the same
   shared primitives — can run any time after Foundational, shown after US3
   here only because its own cross-screen check (`T023`) references US3's
   restyled `ActionToolbar`.
5. **US5 (T024–T026)**: About page polish — last, since it depends on both
   US1's header swap and US2's new graph visual language.
6. **T027–T029** close the feature out with the same full-suite verification
   rigor used for features 002–005, plus the token-discipline grep specific
   to a feature this visually broad.

---

## Notes — deviations from the staged plan, and real bugs found

All 29 tasks are implemented and marked `[X]` above. The following were
discovered or decided during actual implementation (not anticipated by
tasks.md/data-model.md as originally written) and are recorded here rather
than silently fixed in place:

- **`visibleTabs` bug (data-model.md § 4, fixed in `lib/run-tabs.ts`)**: the
  original sketch added the run's *current* (not-yet-completed) stage's tab
  to the visible set. This directly contradicted FR-011 ("one tab per stage
  that has *already produced output*") and FR-013 ("defaults to the most
  recently *completed* stage") — both explicitly exclude the in-progress
  stage. The real `visibleTabs` only derives from `path.takenInOrder`. Found
  by the pre-existing `tests/e2e/us1-cancel.spec.ts` (and several others)
  failing after wiring T018, since an in-progress stage's tab rendered a Card
  with a heading before that stage had produced anything.
- **`activeTab` growth-detection bug (data-model.md § 4, fixed in
  `app/page.tsx`)**: the original effect sketch only reset `activeTab` when
  it dropped out of the visible set, never when a *new* stage completed
  while the visitor was still on an earlier, still-visible tab. This
  silently violated FR-013's "defaults to the most recently completed
  stage" — completing a new stage must jump the selection forward
  regardless of where the visitor had navigated. Fixed by tracking the
  previous visible-tab count in a `ref` and jumping to the newest tab
  whenever that count grows. Found the same way as the bug above.
- **Edit mode must stack every produced stage, not show one tab at a time**:
  neither tasks.md nor data-model.md anticipated this. The pre-existing
  `patch`/`fork` mechanism in `app/page.tsx` lets one "Try this version"
  save carry edits to *several* fields at once (confirmed by
  `tests/e2e/us3-invalid-edit.spec.ts` and `us3-fork-replay.spec.ts`, both
  of which index into multiple simultaneously-rendered `<textarea>`s by
  position). `app/page.tsx` therefore renders every tab in `visible` stacked
  via `RunTabs` when `editMode` is true (no `Tabs` strip shown), and only
  switches to the one-tab-at-a-time `Tabs` + single `RunTabs` view when
  browsing. `RunTabs` itself is unchanged either way — it always renders
  exactly the one `activeTab` it's given.
- **"Direction selection" vs "Direction selected"**: `TAB_LABELS.selection`
  ("Direction selection", the Tabs strip's own clickable label) differs from
  `StatePanel.tsx`'s prior *content* heading ("Direction selected",
  describing the outcome) — every other tab's old heading text already
  equalled its `TAB_LABELS` entry, so this one mismatch broke three existing
  e2e tests that scope assertions by heading text. `components/RunTabs.tsx`
  keeps the old content-heading wording for this one tab specifically
  (`contentHeading`, separate from the tab strip's own label) rather than
  changing the tests, since the old wording is real, pre-existing product
  copy, not an implementation detail.
- **`AboutPage.tsx`'s topic-nav jump-announcement mechanism moved into
  `AppHeader.tsx`'s `mode="about"` branch wholesale** (the `NAV_LINKS` array,
  the `handleNavClick` focus-and-announce logic, and the visually-hidden
  `aria-live` region) — neither spec.md nor data-model.md's `AppHeaderProps`
  contract mentions this, since the nav itself was already described as
  "unchanged from feature 004" without addressing *which* component now
  owns its interaction logic once the header itself moved. Kept fully
  self-contained in `AppHeader.tsx` (no new props) since `AppHeaderProps` is
  explicitly fixed to `{mode, pauseBetweenStages?, onTogglePause?,
  onOpenAbout?, onReturn?}` in both data-model.md and
  contracts/ui-contracts.md.
- **`Toggle` gained one prop beyond its documented contract**:
  `describedById?: string`, so `AppHeader.tsx` could keep the pre-existing
  "Auto-run" hint text (`aria-describedby`) on the pause switch without
  regressing accessibility parity — the contract's three-field `ToggleProps`
  didn't anticipate this pre-existing hint needing to survive the
  checkbox-to-switch conversion.
- **`Toggle`'s switch `<span>` needed an explicit `aria-label`**: without
  one, axe flagged `aria-toggle-field-name` (no accessible name) since the
  adjacent visible label text is a plain sibling, not a `<label for>`
  association the way a native `<input>` gets one automatically. Found by
  `tests/e2e/ui-unification.spec.ts`'s own new US1 a11y test.
- **Two token-discipline misses caught by T027's grep**, both fixed: the
  About page's `::-webkit-scrollbar` rule used literal `8px`/`4px` instead
  of `var(--space-2)`/`var(--radius-sm)` (which resolve to the same values);
  and `components/about/diagrams.tsx`'s restyled `AgentGraphDiagram` carried
  over a pre-existing literal `fill: "#fff"` from the original single-row
  diagram for the error-End box's label — switched to the existing
  `accentContrast` token, which also fixes a latent dark-mode contrast bug
  (hardcoded white text against the danger color, which itself flips to a
  *lighter* red in dark mode).
- **Flaky pre-existing test infra, not a regression**: `clickStep`'s own
  helper assertion (waiting for a since-clicked button's exact label to
  reach zero count) occasionally timed out under the full 43+ test serial
  suite run, on three different specs across three different full-suite
  runs during this implementation (never the same spec twice, always
  passing 100% in isolation immediately after). This matches
  `playwright.config.ts`'s own documented rationale for `workers: 1` /
  `fullyParallel: false` — the shared ephemeral PGlite instance has known
  protocol-state flakiness under load — and predates this feature entirely.
