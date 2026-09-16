# Tasks: About This App Slideshow

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/about-slideshow-ui.md](contracts/about-slideshow-ui.md), [research.md](research.md), [quickstart.md](quickstart.md)
**Feature Directory**: `specs/002-about-app-slideshow`
**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v3.0.0

Format: `- [ ] [TaskID] [P?] [Story?] Description with exact file path`.
`[P]` = parallelizable (different file, no dependency on an incomplete task).
`[US1]`/`[US2]`/`[US3]` = the user story phase (spec.md priorities P1–P3);
omitted in Setup, Foundational, and Polish.

No API route, database, or graph-state change in this feature — every task
touches only `app/tokens.css`, `lib/about-content.ts`,
`components/AboutSlideshow.tsx`, `components/AppHeader.tsx`, and
`tests/e2e/about-slideshow.spec.ts`.

---

## Phase 1: Setup

- [X] T001 [P] Add `--z-overlay` design token to `app/tokens.css` (`:root` block, alongside the existing Layout tokens) — the first stacking-order value the app needs (plan.md Project Structure, research.md R5)

## Phase 2: Foundational (blocking prerequisite — no user story starts before this)

- [X] T002 [P] Create `lib/about-content.ts` exporting `AUTHOR_LINKEDIN_URL`, `AUTHOR_BIO` (1–2 sentences, spec FR-006), `TECH_STACK_ITEMS` (FR-007), `PERSISTENCE_EXPLANATION` with a `deepDive` array covering connection pooling (`lib/db/pool.ts`'s `globalThis`-cached `pg.Pool`), module-scope compiled-graph caching (`lib/agent/runtime.ts`'s `getGraph()`), and cross-branch tree reconstruction (per-thread `parentConfig` chains via `getStateHistory` + the app's own `branches` table — constitution Principle IV; FR-008, FR-011), `DIRECTORY_TREE` (FR-009), `EXECUTION_STAGES` reusing `lib/tree.ts`'s `TimelineStage` names for the 6 happy-path stages (FR-010), and `EXECUTION_DEEP_DIVE` covering the explicit `interruptAfter: [...NODE_NAMES]` array (not a `"*"` wildcard — research.md R4) and last-value-wins `Annotation` channels (FR-011) — see data-model.md § 1 for the full export table and research.md R3/R4/R7 for the exact facts each string must stay faithful to
- [X] T003 Update `components/AppHeader.tsx`: replace the private `AUTHOR_URL` constant with an import of `AUTHOR_LINKEDIN_URL` from `lib/about-content.ts`, used by the existing "Author" link — single source of truth for the URL (data-model.md § 1) (depends on T002)

## Phase 3: User Story 1 - Learn how the app works, end to end (Priority: P1)

**Goal**: A working, content-complete slideshow — open from the header, page through all 5 slides, return to the exact prior view untouched.
**Independent Test**: From the header, open "About This App," advance through all five slides, confirm each slide's required content is present, then "Return to App" and confirm the underlying view is unchanged.

- [X] T004 [US1] Create `components/AboutSlideshow.tsx`: `"use client"` component with `{ open: boolean; onClose: () => void }` props (contracts/about-slideshow-ui.md); local `slideIndex` state, `0`–`4`, reset to `0` on every `open` transition `false → true` (FR-005, data-model.md § 2); `position: fixed; inset: 0` full-viewport container styled with `var(--z-overlay)` and existing color/spacing tokens, `role="dialog" aria-modal="true" aria-label="About This App"`; lay the container out as a flex column with the slide content region as `flex: 1; overflowY: "auto"` and the control bar outside that scrollable region so it's never scrolled away — dense slide content scrolls within itself instead of clipping or overlapping the controls (spec.md Edge Case "Narrow viewport plus a long slide"); "Next"/"Previous" controls that move `slideIndex` by 1 and are `disabled` at the `4`/`0` boundary respectively (FR-003); a "Return to App" control that calls `onClose` (FR-004) — no slide content, focus trap, or keyboard nav yet (later tasks) (depends on T001, T002)
- [X] T005 [US1] Add the Slide 1 ("Author Profile") content section to `components/AboutSlideshow.tsx`: renders `AUTHOR_BIO` and an `<a>` to `AUTHOR_LINKEDIN_URL` with `target="_blank" rel="noopener noreferrer"` (FR-006) (depends on T004)
- [X] T006 [US1] Add the Slide 2 ("High-Level Architecture & Tech Stack") content section to `components/AboutSlideshow.tsx`: renders `TECH_STACK_ITEMS` (FR-007) (depends on T004)
- [X] T007 [US1] Add the Slide 3 ("Database & State Persistence") content section to `components/AboutSlideshow.tsx`: renders `PERSISTENCE_EXPLANATION.summary` and its `deepDive` explanations (FR-008, FR-011) (depends on T004)
- [X] T008 [US1] Add the Slide 4 ("Repository Structure") content section to `components/AboutSlideshow.tsx`: renders `DIRECTORY_TREE` as a styled monospace tree inside an `overflowX: "auto"` bounded container (FR-009, FR-018) (depends on T004)
- [X] T009 [US1] Add the Slide 5 ("End-to-End Execution Flow") content section to `components/AboutSlideshow.tsx`: renders `EXECUTION_STAGES` as an ordered flow (inside an `overflowX: "auto"` bounded container) plus `EXECUTION_DEEP_DIVE` (FR-010, FR-011, FR-018) (depends on T004)
- [X] T010 [P] [US1] Update `components/AppHeader.tsx`: add an "About This App" trigger button, own an `isAboutOpen` boolean state, and mount `<AboutSlideshow open={isAboutOpen} onClose={() => setIsAboutOpen(false)} />` as a sibling of the existing `<header>` markup (FR-001, FR-002) — the underlying `app/page.tsx` tree is a sibling too, so it stays mounted and untouched while the overlay is open, satisfying FR-004 by construction (data-model.md § 3) (depends on T003, T004)
- [X] T011 [US1] Create `tests/e2e/about-slideshow.spec.ts` with the US1 spec (mirroring the `tests/e2e/us*-*.spec.ts` pattern and `expectNoA11yViolations` helper): open "About This App" from the header, verify Slide 1's bio/LinkedIn link, page Next through all 5 slides verifying each slide's required content is present, verify "Next" is disabled on Slide 5 and "Previous" is disabled on Slide 1, select "Return to App" and verify the prior view (including an in-progress session's displayed state) is unchanged, reopen and verify it starts again on Slide 1, zero a11y violations on every slide (spec Acceptance Scenarios 1–7, SC-002, SC-005, SC-006); **also**: start a session, trigger a step so a stage is actively running, open "About This App" while that request is still in flight, wait for it to resolve in the background, select "Return to App," and verify the resolved (not stale pre-step) state is shown — spec Edge Case "Slideshow opened while a recipe stage is actively running," FR-004 (depends on T005, T006, T007, T008, T009, T010)

## Phase 4: User Story 2 - Browse the slideshow with the keyboard alone (Priority: P2)

**Goal**: Full keyboard operability and screen-reader parity, layered onto Story 1's working slideshow.
**Independent Test**: With Story 1 working, open the slideshow and, using only the keyboard, move through every slide with the arrow keys, confirm focus behavior on open/close, confirm slide changes are announced.

- [X] T012 [US2] In `components/AboutSlideshow.tsx`, add focus management: capture `document.activeElement` in a ref when `open` transitions to `true`; move focus to a focusable element inside the overlay at that point; restore focus to the captured element when `open` transitions to `false` (FR-014) (depends on T004)
- [X] T013 [US2] In `components/AboutSlideshow.tsx`, add a focus trap: an overlay-level keydown handler that intercepts Tab/Shift+Tab and cycles focus only among the overlay's own focusable elements (current slide's links + Next/Previous/Return), never letting focus escape to the covered view underneath (FR-014, contracts/about-slideshow-ui.md) (depends on T012)
- [X] T014 [US2] In `components/AboutSlideshow.tsx`, add a container-level `onKeyDown` handler (not a `window` listener — research.md R5) for `ArrowRight`/`ArrowLeft` that move `slideIndex` exactly as "Next"/"Previous" do, clamped to `[0, 4]` (FR-013) (depends on T004)
- [X] T015 [US2] In `components/AboutSlideshow.tsx`, add an `aria-live="polite"` region announcing the current slide's position and title on every `slideIndex` change, plus `aria-roledescription="slide"` and an `aria-label` (e.g. "Slide 2 of 5: ...") on the slide content region (FR-015) (depends on T004)
- [X] T016 [US2] Extend `tests/e2e/about-slideshow.spec.ts` with the US2 spec: navigate every slide using only ArrowRight/ArrowLeft, verify focus lands inside the overlay on open and returns to the "About This App" button on close, verify the `aria-live` region's text updates on each slide change, zero a11y violations (spec Acceptance Scenarios, SC-003); **also**: fire rapid/repeated ArrowRight presses (key-repeat) from Slide 1 and confirm `slideIndex` stops at 4 rather than overshooting or erroring, and likewise rapid ArrowLeft presses stop at 0 — spec Edge Case "Rapid repeated Next/Previous presses or key-repeat" (depends on T012, T013, T014, T015)

## Phase 5: User Story 3 - Read the slideshow comfortably on a phone (Priority: P3)

**Goal**: Every slide remains fully readable and operable at phone width.
**Independent Test**: With Stories 1–2 working, resize to a typical small-phone width and confirm every slide — including Slides 4–5's wider visuals — remains readable and operable without page-level horizontal scrolling.

- [X] T017 [US3] In `components/AboutSlideshow.tsx`, pass over the layout with a responsive/fluid styling using only `app/tokens.css` values: confirm text and controls reflow at narrow widths with no page-level horizontal scroll, and that "Next"/"Previous"/"Return to App" meet the ~44×44 CSS px minimum tappable target and stay reachable (FR-017, FR-019) (depends on T005, T006, T007, T008, T009)
- [X] T018 [US3] Extend `tests/e2e/about-slideshow.spec.ts` with the US3 spec: set the viewport to 320px width (spec SC-004's stated floor) and separately to 1920px (SC-004's stated ceiling), at each verifying no whole-page horizontal scroll and no clipped content across all 5 slides; at 320px, verify Slide 4's directory tree and Slide 5's flow diagram scroll horizontally only within their own bounded containers, verify Slide 3 (the densest text slide) scrolls vertically within itself rather than clipping — spec Edge Case "Narrow viewport plus a long slide" — and verify the controls remain visible, reachable, and each has a computed `boundingBox()` of at least ~44×44 CSS px (FR-019) (spec Acceptance Scenarios, SC-004) (depends on T017)

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T019 Run the full verification pass: `npx tsc --noEmit`, `npx vitest run` (confirm no regression to the existing suite), `npm run build`, then `npx playwright test` twice in a row to confirm no new flakiness — covers spec SC-001 through SC-007 together (depends on T011, T016, T018)

---

## Dependencies

```
T001 (Setup) ────────────────────┐
                                  │
T002 ─> T003 ─┐  (Foundational)  │
              │                  │
              v                  v
                  T004 ─┬─> T005 ─┐
                        │         │
                        ├─> T006 ─┤
                        │         │
                        ├─> T007 ─┼─> T011 (US1 e2e)
                        │         │        │
                        ├─> T008 ─┤        │
                        │         │        │
                        ├─> T009 ─┘        │
                        │                  │
                        └─> T010 ──────────┘
                                            │
                        T012 ─> T013 ─┐     │
                                      │     │
                        T014 ─────────┼─> T016 (US2 e2e)
                                      │     │
                        T015 ─────────┘     │
                        (T012/T014/T015 each depend only on T004)
                                            │
      T017 (depends on T005–T009) ─> T018 (US3 e2e)
                                            │
                                            v
                                     T019 (Polish)
```

- **Foundational (T001–T003) blocks every user story.**
- **US1 (T004–T011) delivers the MVP** and is independently shippable/testable on its own.
- **US2 (T012–T016) and US3 (T017–T018) both layer on top of US1's component (T004 / T005–T009)** but are independent of *each other* — either could be built first, though T012–T017 all edit `components/AboutSlideshow.tsx` sequentially in the order listed to avoid clobbering each other's edits.
- T019 depends on all three e2e phases being in place.

## Parallel Execution Examples

- **Setup + Foundational**: T001 (`app/tokens.css`) and T002 (`lib/about-content.ts`) touch different files with no shared dependency — run together (T004 then needs both, since it reads `var(--z-overlay)` from T001 and imports content from T002).
- **Within US1**: T010 (`components/AppHeader.tsx`) depends only on T003 and T004, not on T005–T009 (`components/AboutSlideshow.tsx`'s slide content) — it can run in parallel with T005–T009 once T004 lands. T005–T009 themselves all edit the same file and must stay sequential.
- **Within US2**: T014 (arrow-key nav) and T015 (ARIA live region) both depend only on T004, not on T012/T013's focus-trap work — in principle parallelizable, though (as above) same-file edits mean sequential is simpler in practice.

## Implementation Strategy

1. **MVP = Phase 1 + 2 + 3 (US1 only, T001–T011)**: a fully content-complete, mouse/tap-operable slideshow reachable from the header. Ship and verify this increment before moving on.
2. **Then US2 (T012–T016)**: keyboard and screen-reader parity, matching the bar every other interactive feature in this app already holds itself to.
3. **Then US3 (T017–T018)**: formal phone-width verification and any responsive touch-ups the token-based styling didn't already cover for free.
4. **T019** closes the feature out with the same full-suite verification rigor used for feature 001 (`tsc`, `vitest`, `build`, `playwright` ×2).
