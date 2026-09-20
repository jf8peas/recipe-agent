# Feature Specification: UI Unification

**Feature Directory**: `specs/006-ui-unification`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "Unify Recipe Agent's UI using the high-fidelity design handoff at design/v003/ — one top bar (app/about states), a real Toggle control, a rebuilt two-row agent graph with a legible node-size floor and auto-fit scaling, the running-session screen restructured into stage tabs synced with the graph, the session list and entry form brought onto the same 720px column/type-scale/component set as the rest of the app, the About page's scroll container fixed (thin scrollbar, no stray focus ring), and a new 'RA' mark used as both favicon and in-header logotype. Recreate the design_files/ HTML/React references in the app's real Next.js/.tsx components — not shipped as-is — preserving feature 005's real agent-graph run-state derivation and every existing real interaction (edit & fork, step/play/cancel, retry, history browsing). Accessibility parity with what's being replaced (aria-current/role=switch/role=tab semantics, zero critical/serious axe violations) is a hard requirement, matching every prior UI feature in this repo."

## Clarifications

### Session 2026-09-20

- Q: The design reference's screens (session list, entry form, running session) call out shared primitives — `Button` (primary/secondary/link variants), `Card`, `ListRow`, `TextArea`, `Spinner` — sourced from an external prototype-only library that doesn't exist in this app. This app's own convention to date (features 001–005) is bespoke, inline-styled components per screen, no shared UI-primitives layer. → A: Introduce a small internal `components/ui/` module (`Button`, `Card`, `ListRow`, `TextArea`, `Spinner`) that every unified screen uses — matches the design reference's own structure and this codebase's existing precedent of factoring out repeated style patterns (e.g. `components/about/shared.ts`).
- Q: `design_files/AboutPage.jsx`'s own "Agent graph" section embeds the *same* `AgentGraphProgress` component (fed an illustrative, hardcoded status) in place of the About page's existing separate, static, purely-illustrative diagram (spec 004's `AgentGraphDiagram`/agent-graph section). → A: Keep the About page's own existing separate static diagram, restyled to match the new two-row visual language — lower risk, and doesn't require inventing an illustrative "demo mode" for a component (feature 005's `AgentGraphProgress`) built specifically around real, derived run state.
- Q: The handoff document itself flags the new "RA" mark (used as both the favicon and an in-header logotype) as "a deliberate, minimal departure from the design system's 'no logo' stance... confirm with design before treating it as a permanent brand asset." → A: Adopt it now as a permanent real asset (new `favicon.svg`, in-header logotype mark) as part of this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One consistent header, everywhere (Priority: P1)

Someone using the app sees the exact same top bar — same height, spacing, background, and control style — whether they're on the entry form, their session list, an active run, or the About page, with only the specific controls in it changing to match where they are. The "Pause between stages" control looks and behaves like a real switch, not a plain checkbox.

**Why this priority**: Everything else in this feature assumes one shared header exists; it's the smallest independently-shippable piece and the most visible immediate sign of "unification."

**Independent Test**: Open the app, the About page, and back again — confirm the header's height, spacing, background, and control styling never changes, only its contents (app controls vs. about controls) do; confirm the pause control operates like a switch via mouse, keyboard, and screen reader.

**Acceptance Scenarios**:

1. **Given** any app screen (session list, entry form, or an active run), **When** the header renders, **Then** it shows the product mark and title, the pause switch, the Author and Feedback links, and the "About This App" control, all in the app's shared visual language.
2. **Given** the About page is open, **When** its header renders, **Then** it shows the same title (with a "— how it works" suffix), the existing topic navigation, and a "Return to App" control, at the same height and with the same background/border treatment as the app header.
3. **Given** a visitor using only the keyboard or a screen reader, **When** they reach the pause control, **Then** it's operable with Space/Enter, announces as a switch, and its on/off state is conveyed non-visually.

---

### User Story 2 - The agent graph stays legible and reads as one connected diagram (Priority: P1)

Someone watching a run sees every node and connector at a comfortably readable size, however narrow or wide their window is — the diagram shrinks or grows as a whole rather than ever letting individual node text become too small to read, and the "path not taken" / "revised at least once" visual language (introduced in the previous feature) still reads clearly in the new two-row layout.

**Why this priority**: The graph is this app's single most information-dense visual element; a comfortably legible diagram is a P1 alongside the header, and every other piece of this feature (the tabs, the About page's own graph illustration) depends on the rebuilt component existing first.

**Independent Test**: Resize the window from a small phone width to a wide desktop width while a run is active — confirm every node/connector/label stays at or above its minimum comfortable size throughout, the whole diagram scales as a single unit with no per-element shrinking below that floor, and neither a horizontal nor a vertical scrollbar ever appears on the diagram itself.

**Acceptance Scenarios**:

1. **Given** the running-session view is open at any supported window width, **When** the graph renders, **Then** every node stays at or above its minimum comfortable size, and the diagram as a whole scales down only as far as needed to fit its available width, never smaller than that floor requires and never clipped.
2. **Given** a run that took the ingredient-error path, **When** the graph renders, **Then** the ingredient-error branch reads clearly as a distinct, dashed, "not taken" or "taken" dead-end hanging below its decision point — the same real state feature 005 already computes, now in the new layout.
3. **Given** a run that has revised its draft at least once, **When** the graph renders, **Then** the revision loop back to the critique stage reads clearly as its own connector, distinct from the diagram's other connectors.
4. **Given** any of the above, **When** the same information is requested non-visually, **Then** the accessible summary text already required by feature 005 continues to convey which stage is current and which path was taken, unchanged by this feature's visual rebuild.

---

### User Story 3 - Jump between a run's stages without losing the controls (Priority: P2)

Someone reviewing a run in progress can jump straight to any stage that has already produced output — by clicking its tab or its node on the graph — and always has the Step/Play/Edit/Cancel controls within reach, without scrolling past everything else to find them.

**Why this priority**: Builds on Story 2's graph; this is the interaction model change that makes a long run practical to review, but it isn't useful until the graph it's wired to already exists.

**Independent Test**: Step a run forward through several stages, use both a graph node and a tab to jump between two already-completed stages, and confirm the actions row stays reachable throughout without needing to scroll back up.

**Acceptance Scenarios**:

1. **Given** a run has completed one or more stages, **When** the visitor looks below the graph, **Then** a tab exists for each stage that has produced output so far, and selecting one shows that stage's own content.
2. **Given** a tab for an already-completed stage is showing, **When** the visitor clicks that stage's node on the graph instead, **Then** the same tab becomes active — and the reverse (selecting a tab highlights its corresponding node) also holds.
3. **Given** any tab is active, **When** the visitor looks at the bottom of the screen, **Then** the current action (Step/Play/Edit while idle; a running indicator and Cancel while a stage is in flight; Retry after a stage failure; "Start a new session" once finished) is visible without scrolling.
4. **Given** a stage supports editing, **When** its tab is active, **Then** an "Edit this stage" affordance is present and starts the app's existing real edit-and-fork flow; a stage that doesn't support editing (critique, the final recipe) shows no such affordance.

---

### User Story 4 - Every screen shares the same width, type, and building blocks (Priority: P2)

Someone moving between their session list, the entry form, an active run, and the About page experiences one consistent-feeling application — same content column width, same heading sizes, same look for lists, buttons, and cards — rather than a patchwork of screens that each evolved their own styling.

**Why this priority**: This is the visible payoff of "unification" for the screens that aren't the header or the graph; it depends on Stories 1–3 already having established the shared visual language those screens also use.

**Independent Test**: Visit the session list, the entry form, an active run, and the About page in one sitting — confirm all four share the same centered content width and the same heading, list, and button styling.

**Acceptance Scenarios**:

1. **Given** the session list, the entry form, an active run, or the About page, **When** any of them renders, **Then** its main content sits in the same centered, fixed-maximum-width column as the others.
2. **Given** the session list, **When** it renders, **Then** each session appears as a consistently-styled row (title, last-opened detail, open and delete affordances) matching the visual language used elsewhere in the app.
3. **Given** the entry form, **When** it renders, **Then** its ingredients field and its primary action button match the styling used for equivalent controls elsewhere in the app.

---

### User Story 5 - The About page scrolls cleanly and matches the new visual language (Priority: P3)

Someone reading the About page sees a slim, unobtrusive scrollbar instead of a heavy default one, doesn't see a stray focus outline appear around the whole scrolling area just from scrolling it, and sees its own graph illustration drawn in the same style as the real running-session graph.

**Why this priority**: A visual-polish pass on a page whose content and navigation were already finished in the previous feature; lowest priority since it depends on Story 2's rebuilt graph and doesn't block anything else.

**Independent Test**: Open the About page, scroll it with a mouse wheel and by dragging the scrollbar, and tab into and out of its scrolling region — confirm the scrollbar reads as slim/unobtrusive and no visible focus outline appears around the scroll region from scrolling alone.

**Acceptance Scenarios**:

1. **Given** the About page is open, **When** its content is scrolled, **Then** the scrollbar is slim and unobtrusive rather than a heavy default browser scrollbar.
2. **Given** the About page is open, **When** the scroll region is scrolled without using the keyboard to focus it directly, **Then** no visible focus outline appears around it.
3. **Given** the About page's own agent-graph illustration, **When** it renders, **Then** it uses the same two-row visual language as the real running-session graph, as its own separate, restyled illustration (Clarifications) — not the same component instance the running-session view uses.

---

### Edge Cases

- **A window narrower than the graph's legibility floor allows**: the diagram scales down to its comfortable minimum and, if that's still wider than the available space, scrolls horizontally within its own bounded region rather than shrinking further or forcing the whole page to scroll sideways (matching feature 005's own existing narrow-viewport fallback).
- **A stage failure**: the failed stage's tab (if any) and its node both continue to reflect "current, not yet complete," and the action row shows the existing real retry control, unchanged in behavior from today.
- **Viewing an earlier checkpoint via the History panel**: the graph and the visible/available tabs both reflect that historical point, not the live run's later progress — matching feature 005's own existing historical-view behavior.
- **A run that finishes via the ingredient-error path**: no further tabs beyond the ones already produced appear, and the action row shows "Start a new session," consistent with today's real behavior.
- **Reduced-motion preference**: the graph's auto-fit scaling and the toggle's thumb slide are simple, near-instant visual adjustments, not the kind of decorative animation reduced-motion preferences are meant to suppress; no new looping or attention-drawing motion is introduced.

## Requirements *(mandatory)*

### Functional Requirements

**Unified header**

- **FR-001**: The app MUST use one shared header component, in two states (an "app" state and an "about" state), everywhere a header currently appears — replacing the two separately-maintained headers that exist today.
- **FR-002**: The header MUST keep the same height, background, border, and padding in both states.
- **FR-003**: The "app" state MUST show, in order: the product mark and title, a real switch-style control for "Pause between stages," the Author link, the Feedback link, and the "About This App" control.
- **FR-004**: The "about" state MUST show the title with its "— how it works" suffix, the existing topic navigation, and a "Return to App" control.
- **FR-005**: The "Pause between stages" control MUST be operable and understandable the same way a native switch is — by mouse, by keyboard, and by assistive technology — not a plain checkbox.

**Agent graph**

- **FR-006**: The agent graph MUST render its two rows of stages (the four-stage main sequence, then the four-stage continuation directly below it) so that every node stays at or above a defined minimum comfortable size at any supported window width.
- **FR-007**: When the graph's natural size is wider than the space available to it, the whole diagram MUST scale down as one unit to fit — nodes and connectors together — rather than the app shrinking individual node text below the minimum from FR-006.
- **FR-008**: The graph MUST continue to show, exactly as established in the previous feature, which stages/connections are taken, current, not-yet-reached, or an untaken branch side for the run being viewed — this feature changes the graph's layout and sizing, not the correctness of what it displays.
- **FR-009**: The graph MUST continue to provide the non-visual text summary established in the previous feature, unchanged in what it conveys.
- **FR-010**: The connection allowing a revised draft to be re-reviewed MUST remain visually distinguishable from the diagram's other connections in the new layout.

**Running-session tabs**

- **FR-011**: The running-session view MUST show one tab per stage that has already produced output, appearing as each stage completes.
- **FR-012**: Selecting a graph node MUST select that node's corresponding tab, and selecting a tab MUST highlight its corresponding node on the graph.
- **FR-013**: The active tab MUST default to the most recently completed stage, but MUST stay on whichever tab the visitor last chose until the next stage completes.
- **FR-014**: A tab whose stage supports editing MUST offer a way to start the app's existing edit-and-continue flow for that stage; a tab whose stage doesn't support editing MUST NOT offer one.
- **FR-015**: The row of current actions (step forward, play, edit, cancel, retry, or start a new session, whichever apply to the run's current state) MUST remain visible without scrolling, regardless of which tab is active or how long the page's content is.

**Shared layout across screens**

- **FR-016**: The session list, entry form, running-session view, and About page MUST all present their main content in the same centered, fixed-maximum-width column.
- **FR-017**: These same screens MUST use the same heading sizes and the same visual treatment for equivalent elements (buttons, list rows, form fields) wherever they appear.

**About page**

- **FR-018**: The About page's scrolling content region MUST use a slim, unobtrusive scrollbar rather than the platform's heavy default, without changing what content it contains or how that content is organized (established in the previous feature).
- **FR-019**: The About page's scrolling content region MUST NOT show a visible focus outline as a result of being scrolled by mouse or touch alone.

**Accessibility & theming (carried over, not new)**

- **FR-020**: Every control and region introduced or restructured by this feature MUST meet the same automated accessibility standard already enforced elsewhere in the app (zero critical/serious violations).
- **FR-021**: Every visual value introduced by this feature MUST resolve through the app's existing shared design tokens, and MUST render correctly in both light and dark mode.
- **FR-022**: No existing real interaction — starting a session, stepping or auto-running a stage, cancelling, retrying a failed stage, editing and forking a stage, deleting a session, browsing history — MUST change in behavior as a result of this feature; only how each is presented and reached may change.

### Key Entities

- **Header State**: Which of the two header presentations ("app" or "about") is currently shown — driven by the same existing state that already decides which top-level view is showing.
- **Visible Tabs**: The set of stage-output tabs currently offered on the running-session view — derived from how far the run being viewed has actually progressed (reusing feature 005's own real run-state derivation), not a separate, independently-tracked list.
- **Active Tab**: Which single tab is currently selected — defaults to the most recently completed stage, overridable by an explicit tab or node selection until the next stage completes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor moving between the session list, entry form, an active run, and the About page sees the same header height, background, and control styling on every one of them.
- **SC-002**: Every node in the agent graph stays at or above its defined minimum comfortable size, and the diagram never forces the surrounding page to scroll sideways, at window widths from a small phone through a standard desktop display.
- **SC-003**: A visitor can reach any already-completed stage's output within one interaction (one tab click or one graph-node click), from any other tab, without scrolling to find the action controls afterward.
- **SC-004**: An automated accessibility scan of every screen this feature touches reports zero critical or serious violations.
- **SC-005**: The session list, entry form, running-session view, and About page all measure the same maximum content width and use visually matching headings, buttons, and list rows.
- **SC-006**: Every screen this feature touches renders correctly in both light and dark mode, with no unstyled or hard-coded-looking element.
- **SC-007**: 100% of the app's existing real interactions (start, step, play, cancel, retry, edit & fork, delete, browse history) continue to work exactly as before this feature, verified by the app's existing test coverage for each.

## Assumptions

- The design handoff's own sample content, sample session data, and any prototype-only simulation logic (e.g. the reference's own auto-play timer) are illustrative only — this feature wires the real design onto the app's actual data and existing real state machine (`useSession`, `useAutoRun`, etc.), not the prototype's own simplified stand-ins.
- "Edit this stage" in the new tabbed layout maps onto the app's existing real edit-and-fork mechanism (spec 001/003's `/fork` flow) — this feature changes where that entry point appears, not how forking itself works.
- The running-session view's History disclosure keeps its existing real content and behavior (spec 001's `BranchTimeline`) — this feature only affects its surrounding layout, not its own internal structure.
- Session list and entry form content (real session titles, real ingredient input, real delete confirmation) stays wired to the app's existing real data; only their visual presentation changes.
- Where the design reference is illustrative-only for one screen (e.g., its simplified session/data samples), the real screen's existing full, real content is preserved except where a requirement above explicitly says otherwise.
- Per Clarifications, this feature introduces a small internal shared-presentation layer (a handful of reusable primitives — a button, a card, a list row, a text area, a spinner) that the unified screens draw on, rather than each screen re-implementing the same visual result independently — the specific module shape is a planning-time decision, not a product-scope one.
- Per Clarifications, the About page keeps its own existing, separate agent-graph illustration (spec 004) — restyled to the new two-row visual language, but not replaced with the same component instance the running-session view uses.
- Per Clarifications, the new "RA" mark is adopted as a permanent real asset (favicon and in-header logotype), not a placeholder pending further confirmation.

## Dependencies

- Feature 005's real agent-graph run-state derivation (`taken`/`current`/`not-yet-reached`/`untaken`, the accessible text summary) — reused, not re-implemented, by this feature's rebuilt graph layout.
- Feature 004's About page content and structure — reused unchanged except for the header it's mounted in, the scroll-container fix, and restyling its own agent-graph illustration to the new two-row visual language (Clarifications).
- The app's existing real interactions this feature re-presents but does not change: starting a session, stepping/auto-running, cancelling, retrying, editing & forking, deleting a session, and browsing history.
- The app's existing shared design tokens and the accessibility/responsiveness conventions already enforced elsewhere in the app.

## Out of Scope

- Any change to the agent graph's actual topology, to any API route, to the database schema, or to how any existing real interaction behaves — this feature is a presentation and layout change over already-correct, already-implemented functionality.
- Any new dependency or component library brought in from outside this codebase — the design reference's own prototype-only library is a visual reference, not something to install.
- Any content change to the About page's existing sections (its wording, section order, or the topics it covers) beyond what's named above.
- Localization or any language other than the app's existing one.
