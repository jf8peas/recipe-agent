# Tasks: About Page Redesign

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/about-page-ui.md](contracts/about-page-ui.md), [research.md](research.md), [quickstart.md](quickstart.md)
**Feature Directory**: `specs/004-about-page-redesign`
**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v3.0.0

Format: `- [ ] [TaskID] [P?] [Story?] Description with exact file path`.
`[P]` = parallelizable (different file, no dependency on an incomplete task).
`[US1]`/`[US2]`/`[US3]` = the user story phase (spec.md priorities P1–P3);
omitted in Setup, Foundational, and Polish.

No new dependency, route, or DB migration in this feature (plan.md
Constitution Check: PASS). `design/v002/about.html` is the authoritative
content/wording/layout source for every content-authoring task below — read
the relevant section of that file directly, don't paraphrase from spec.md.

---

## Phase 1: Setup

- [X] T001 [P] Add `--text-2xl: 2rem;` and `--text-3xl: 2.75rem;` to `app/tokens.css`'s type-scale block (research R2) — the two sizes `design/v002/about.html` needs beyond the app's existing scale, added to the shared token source rather than hardcoded locally
- [X] T002 [P] Delete `public/about.html` (research R1 — confirmed a byte-for-byte duplicate of `design/v002/about.html`, unreferenced by any code, live at `/about.html` only because Next.js auto-routes `public/`)

## Phase 2: Foundational (blocking prerequisite — no user story starts before this)

- [X] T003 [P] Create `components/about/shared.ts`: reusable style-object helpers (`cardStyle`, `gridStyle(columns)`, `calloutStyle`, `badgeStyle`, `tableStyle`, and any other pattern repeated across more than ~3 sections in `design/v002/about.html`'s `<style>` block) — every value resolves through `app/tokens.css` custom properties, none hardcoded (FR-022)
- [X] T004 Create `components/about/AboutPage.tsx`: the overlay shell — `{ open, onClose }` props (contracts/about-page-ui.md); fixed full-viewport `role="dialog" aria-modal="true"` container; focus-restore-on-close (capture `document.activeElement` on open, `.focus()` it on close) and the Tab-trap `onKeyDown` handling, both ported from `components/AboutSlideshow.tsx` unchanged (research R7); a sticky header containing the page title, a `<nav aria-label="Page sections">` with one plain `<a href="#id">` per nav-exposed section, and a "Return to App" button calling `onClose`; an `aria-live="polite"` region; a single scrollable `<main>` region (depends on T003). *Built together with T015/T018 in one pass rather than staged with a placeholder `<main>` — see Notes.*
- [X] T005 [P] Create `components/about/diagrams.tsx`: all three inline-SVG diagrams — `TimeTravelDiagram`, `AgentGraphDiagram`, `StatePersistenceDiagram` — each one `<svg viewBox>` containing every shape/connector/label (FR-021), ported from `design/v002/about.html`'s own `<svg>` markup for each (`#time-travel`, `#agent-graph`, `#state` sections), using `var(--color-*)` tokens directly as `fill`/`stroke` values, matching `AboutSlideshow.tsx`'s existing `ArchitectureDiagram`/`DiagramBox` technique (research R6)
- [X] T006 In `lib/about-content.ts` (part 1/5): replace the 5-slide exports with `AUTHOR_BIO`, `PITCH_HEADLINE`, `PITCH_FLOW_STEPS`, `PITCH_HIGHLIGHTS`, `TIME_TRAVEL_EXPLANATION` (data-model.md § 1) — content read directly from `design/v002/about.html`'s `#author`, `#pitch`, and `#time-travel` sections; keep `AUTHOR_LINKEDIN_URL` unchanged
- [X] T007 In `lib/about-content.ts` (part 2/5): add `JOURNEY_STEPS`, `JOURNEY_CALLOUT`, `ARCHITECTURE_HOPS` — content from `design/v002/about.html`'s `#journey` and `#architecture` sections (depends on T006, same file)
- [X] T008 In `lib/about-content.ts` (part 3/5): add `AGENT_GRAPH_EDGES`, `PROMPT_ROUTING_TABLE`, `STATE_CHANNELS` — content from `design/v002/about.html`'s `#agent-graph` edges table, `#prompts` table, and `#state`'s channel list (depends on T007, same file)
- [X] T009 In `lib/about-content.ts` (part 4/5): add `BRANCHING_STEPS`, `BRANCHING_CALLOUTS`, `DATA_MODEL_TABLES`, `DATA_MODEL_TREE_EXPLANATION`, `REPO_AREAS`, `REPO_URL` — content from `design/v002/about.html`'s `#branching`, `#data-model`, and `#repo` sections (depends on T008, same file)
- [X] T010 In `lib/about-content.ts` (part 5/5): add `API_GUARDRAILS`, `API_ROUTES`, `PRINCIPLES`, `CLOSING_POINTERS` — content from `design/v002/about.html`'s `#api`, `#principles`, and `#closing` sections (depends on T009, same file)
- [X] T011 [P] Update `components/AppHeader.tsx`: import `AboutPage` from `@/components/about/AboutPage` instead of `AboutSlideshow`; rename the rendered component — `isAboutOpen` state and the `open`/`onClose` props stay unchanged (contracts/about-page-ui.md, research R7); also update the file's JSDoc comment above `AppHeader`, which currently describes `AboutSlideshow` as "the About This App slideshow trigger (spec 002, FR-001)" — reword it to describe the new reference page instead, so it doesn't keep citing the retired slideshow (research R9) (depends on T004)

## Phase 3: User Story 1 - Get the full picture in one continuous read, with a clear way back (Priority: P1)

**Goal**: Every required topic renders, in order, in one continuous scroll, with working close-and-restore behavior — the core replacement for spec 002's slideshow.
**Independent Test**: Open "About This App," scroll from top to bottom confirming every required topic appears in order, then close it and confirm the underlying view (including an in-progress session) is exactly as it was.

- [X] T012 [US1] Create `components/about/sections.tsx` (part 1/3): `CoverSection`, `AuthorSection`, `PitchSection`, `TimeTravelSection` (embeds `<TimeTravelDiagram />`), `JourneySection` — layout/wording matching `design/v002/about.html`'s corresponding sections exactly, styled via `components/about/shared.ts` helpers and `app/tokens.css` only (FR-022) (depends on T003, T005, T006, T007)
- [X] T013 [US1] Extend `components/about/sections.tsx` (part 2/3): `UnderTheHoodDivider`, `ArchitectureSection`, `AgentGraphSection` (embeds `<AgentGraphDiagram />`), `PromptsSection`, `StateSection` (embeds `<StatePersistenceDiagram />`) — including the agent graph's two conditional-edge conditions shown as visible table/text, not only implied by the diagram (FR-012) (depends on T008, same file as T012 — sequential). *`AgentGraphSection` was built with T020's bounded-scroll wrapper already in place — see Notes.*
- [X] T014 [US1] Extend `components/about/sections.tsx` (part 3/3): `BranchingSection`, `DataModelSection`, `RepoSection` (including the outbound GitHub link, FR-017), `ApiSection`, `PrinciplesSection`, `ClosingSection` (depends on T009, T010, same file as T013 — sequential)
- [X] T015 [US1] In `components/about/AboutPage.tsx`, replace the placeholder `<main>` with the full ordered list of section components from `components/about/sections.tsx`, in the exact order `design/v002/about.html` uses (FR-006) (depends on T012, T013, T014)
- [X] T016 [US1] Create `tests/e2e/about-page.spec.ts` (delete `tests/e2e/about-slideshow.spec.ts` in the same change — research R9): open "About This App" from the header; confirm the hero/hook content and a heading for every major section appear in document order with no "Next"/"Previous" control anywhere; select "Return to App" and confirm the prior view (including an in-progress session's displayed state) is unchanged; reopen and confirm it starts at the top again; call `expectNoA11yViolations` near the top of the page (depends on T011, T015)

## Phase 4: User Story 2 - Jump straight to a topic instead of scrolling past everything (Priority: P2)

**Goal**: The sticky topic navigation actually moves keyboard focus and screen-reader attention to the target section, not just the visual scroll position.
**Independent Test**: Open the page, select a topic link partway down the nav, and confirm the page jumps straight there (focus included) without scrolling past intervening sections; confirm the nav stays reachable at any scroll position.

- [X] T017 [US2] In `components/about/sections.tsx`, give every section's outer element `id` (already present, from T012–T014) and `tabIndex={-1}` so each is programmatically focusable (research R5)
- [X] T018 [US2] In `components/about/AboutPage.tsx`: add an `onClick` handler to every topic-nav link that (without calling `preventDefault` — native hash navigation still scrolls) looks up the target section by id, calls `.focus()` on it, and updates the `aria-live="polite"` region's text to that section's name; scope the scrollable region's own `scrollBehavior` to `"auto"` when `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, `"smooth"` otherwise (research R5, spec Edge Cases) (depends on T017)
- [X] T019 [US2] Extend `tests/e2e/about-page.spec.ts`: using only the keyboard, Tab to a topic-nav link partway down the list and activate it — confirm focus lands on that section and the `aria-live` region's text updates; confirm every nav link and the "Return to App" control are individually Tab-reachable; confirm the nav remains visible after scrolling past it; call `expectNoA11yViolations` again (depends on T016, T018). *Discovered and fixed a real bug here: with 16 sections' worth of in-content links, "Return to App" is not the last focusable element before the trap wraps — see Notes.*

## Phase 5: User Story 3 - The diagrams stay correct and legible at any screen size (Priority: P3)

**Goal**: The widest diagram (the agent graph) stays legible at narrow viewports via a bounded scroll region instead of shrinking indefinitely (FR-021a); no diagram causes the whole page to scroll horizontally at any supported width.
**Independent Test**: Open the page at a small-phone width and again at a wide desktop width; at each, confirm every diagram's shapes/connectors/labels stay aligned and legible, with the page itself never scrolling sideways.

- [X] T020 [US3] In `components/about/sections.tsx`'s `AgentGraphSection`, wrap `<AgentGraphDiagram />` in the exact bounded-horizontal-scroll container pattern already used for `AboutSlideshow.tsx`'s `DirectoryTreeSlide`/`ExecutionFlowSlide` (`data-testid="agent-graph-scroll"`, `role="group"`, `aria-label`, `tabIndex={0}`, `style={{ overflowX: "auto" }}`) — research R6, FR-021a (depends on T013)
- [X] T021 [US3] Extend `tests/e2e/about-page.spec.ts`: set the viewport to 320px width, scroll through the page confirming no whole-page horizontal scroll at any point; confirm the agent-graph diagram's bounded container has `scrollWidth > clientWidth`; repeat the whole-page-no-horizontal-scroll check at 1920px; call `expectNoA11yViolations` on the agent-graph section specifically (depends on T019, T020)

## Final Phase: Polish & Cross-Cutting Concerns

- [X] T022 [P] Delete `components/AboutSlideshow.tsx` (fully superseded — nothing imports it once T011 lands)
- [X] T023 [P] In `README.md`'s "In the app" section, change "opens a slideshow walking a reader through..." to describe a scrolling reference page instead (research R10) — also updated the intro spec list and "Where to look next" section's feature-002 pointers to feature 004, which had gone stale the same way
- [X] T024 Run the full verification pass: `npx tsc --noEmit`, `npx vitest run`, `npm run build`, then `npx playwright test` (full suite, twice) — all green. Covers spec SC-001 through SC-006. The manual light/dark toggle pass (FR-023) was not run interactively in this environment; token-only styling (T001–T003) makes it low-risk, and no other FR/SC depends on it (see Notes) (depends on T021, T022, T023)

## Notes — deviations from the staged plan, and bugs found during implementation

- **T004/T015/T018 built together, not staged.** The task list staged the overlay shell (T004, empty `<main>`), then wiring sections in (T015), then adding nav focus/announce behavior (T018) as three separate passes for reviewability. Implemented in one continuous session instead, so `AboutPage.tsx` was written once, correctly, rather than through an intermediate broken-then-fixed state. Same for T013/T020 (the agent-graph diagram was wrapped in its bounded-scroll container from the start, not added later).
- **Real a11y bug found and fixed (not anticipated by any task)**: `design/v002/about.html`'s own `.badge-*` and `.accent-row` styles (a `color-mix()`-tinted background with color-matched text) measure under WCAG AA's 4.5:1 contrast threshold — axe caught it immediately. Fixed by swapping the tinted background for a plain surface background with a colored border/left-border instead, keeping the same visual "highlight" cue at a passing contrast ratio. Also fixed two spots where a light-background text color (`--color-text-muted` / `--color-accent`) was reused verbatim on the forced-dark "Under the hood" divider and the pitch section's dark middle card — switched to `--color-bg` (at reduced opacity), matching the callout pattern already used elsewhere on the page.
- **Real bug found and fixed in the Tab-trap test itself**: unlike the old single-slide-at-a-time `AboutSlideshow`, this page renders all 16 sections' content simultaneously, including 3 in-content external links (author/repo/closing). That means "Return to App" is *not* the last focusable element before the trap wraps — it sits near the start of the focusable sequence. The test was rewritten to check the trap at its real boundary (the closing section's LinkedIn link); the component's Tab-trap logic itself needed no change.
- **spec.md/contracts correction during implementation**: the `/speckit-analyze` pass on 2026-09-18 had "fixed" `contracts/about-page-ui.md`'s nav example to drop `#pitch`, based on spec.md's own (incorrect) Assumptions bullet claiming pitch wasn't nav-linked. Re-reading `design/v002/about.html`'s actual `<nav>` directly during implementation showed the mockup's nav *does* link to `#pitch` (labeled "Overview") and `#journey` ("Using it") — spec.md's Assumptions bullet was the one that was wrong. Corrected spec.md and contracts/about-page-ui.md to the real 10-link list before building `AboutPage.tsx`'s nav.
- **`us4-resume.spec.ts`'s second test flaked once** in a full-suite run (passed 3/3 in isolation, and passed in two other full-suite runs) — pre-existing timing flakiness unrelated to this feature; that file was not touched.

---

## Dependencies

```
T001 [P] ─┐
T002 [P] ─┤ (Setup, independent of everything)
          │
T003 [P] ─┬─> T004 ─────────────────────┐
          │                              │
T005 [P] ─┼──────────────────────────────┤  (Foundational)
          │                              │
T006 ─> T007 ─> T008 ─> T009 ─> T010 ────┤
          │                              │
          └─────────> T011 (dep T004) ───┘
                                          │
      ┌───────────────────────────────────┘
      │  US1
      v
T012 ─> T013 ─> T014 ─> T015 ─> T016
(dep T003,T005,        (dep T012-14) (dep T011,T015)
 T006,T007)  (dep T008) (dep T009,T010)
                                          │
      ┌───────────────────────────────────┘
      │  US2
      v
T017 ─> T018 ─> T019
                                          │
      ┌───────────────────────────────────┘
      │  US3
      v
T020 (dep T013) ─> T021 (dep T019, T020)
                                          │
                                          v
                        T022 [P], T023 [P] ─> T024
```

- **Setup (T001–T002) and Foundational (T003–T011) block every user story.**
  Foundational is unusually large for this repo's own precedent because the
  overlay shell, all three diagrams, and the entire content module are all
  genuinely required before any section can render — there's no smaller
  slice of "the page exists at all" to carve out as an MVP within
  Foundational itself.
- **US1 (T012–T016) delivers the actual replacement** — content-complete,
  closes correctly, no pagination. Independently shippable: a user gets the
  full picture even before US2/US3 land.
- **US2 (T017–T019) and US3 (T020–T021) both build on US1's finished
  `sections.tsx`**, but are independent of *each other* — US2 only touches
  focus/nav behavior, US3 only touches the agent-graph diagram's own
  wrapper.
- T022–T024 close the feature out once every story is in place.

## Parallel Execution Examples

- **Setup**: T001 and T002 touch unrelated files — run together.
- **Foundational**: T003 (`shared.ts`), T005 (`diagrams.tsx`), and the
  T006→T010 content-authoring chain are three independent tracks (different
  files) — run in parallel; T004 depends only on T003; T011 depends only on
  T004.
- **Polish**: T022 and T023 are independent — run together.

## Implementation Strategy

1. **Setup + Foundational (T001–T011) first, always** — this feature has no
   meaningful smaller MVP slice; a half-built overlay shell or half-written
   content module isn't independently useful to any story.
2. **US1 (T012–T016) next**: the actual replacement ships here — full
   content, correct order, working open/close. This alone already retires
   spec 002's slideshow (FR-001).
3. **US2 (T017–T019)**: nav-link focus/announce behavior, layered on.
4. **US3 (T020–T021)**: the one diagram-specific responsive fix (FR-021a).
5. **T022–T024** close the feature out with the same full-suite
   verification rigor used for features 002 and 003.
