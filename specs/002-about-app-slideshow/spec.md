# Feature Specification: About This App Slideshow

**Feature Directory**: `specs/002-about-app-slideshow`
**Created**: 2026-09-16
**Status**: Draft
**Input**: User description: "Add an interactive architecture slideshow feature ('About This App') to the Recipe Agent application: a header nav entry opens a 5-slide presentation overlay (author profile, architecture/tech stack, database & state persistence, repository structure, end-to-end execution flow) with Next/Previous/Return controls, keyboard navigation, accessibility support, and responsive layout, going deep on the architectural nuances (serverless lifecycle optimizations, state channel reducer semantics, step-wise execution guarantees, tree-reconstruction logic) wherever doing so deepens the reader's understanding."

## Clarifications

### Session 2026-09-16

- Q: How should the slideshow overlay present itself relative to the current app view? → A: Full-page overlay — replaces the current view entirely, matching the app's existing pattern of swapping whole-view content client-side (entry form ↔ session list ↔ session).
- Q: How long should the Slide 1 author bio be? → A: 1-2 sentences.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Learn how the app works, end to end (Priority: P1)

A curious visitor — technical or not — opens "About This App" from the header and pages through a short slide deck that explains who built it, what it's made of, how it remembers and time-travels through a recipe's history, how the codebase is organized, and what actually happens between typing in ingredients and getting a finished recipe. When they're done, they return to exactly the app view they left, untouched.

**Why this priority**: This is the entire feature. Without a working, content-complete slideshow that opens and closes cleanly, nothing else in this spec has value.

**Independent Test**: From the header, open "About This App," advance through all five slides to the end, confirm each slide's required content is present, then use "Return to App" and confirm the underlying app view (session, list, or entry form) is exactly as it was before opening.

**Acceptance Scenarios**:

1. **Given** the app is open to any view (entry form, session list, or an active session), **When** the user selects "About This App" in the header, **Then** a slideshow overlay opens, starting on Slide 1 ("Author Profile").
2. **Given** the slideshow is open on any slide before the last, **When** the user selects "Next," **Then** the next slide in sequence is shown and "Previous" becomes available (if it wasn't already).
3. **Given** the slideshow is open on any slide after the first, **When** the user selects "Previous," **Then** the prior slide in sequence is shown.
4. **Given** the slideshow is open on the last slide, **When** the user looks for a way to continue, **Then** "Next" is disabled or absent (there is nowhere to advance to), and this is communicated to assistive technology, not just visually.
5. **Given** the slideshow is open on the first slide, **When** the user looks for a way to go back, **Then** "Previous" is disabled or absent, communicated the same way.
6. **Given** the slideshow is open on any slide, **When** the user selects "Return to App," **Then** the overlay closes and the app view underneath is exactly what it was before the slideshow opened — including an in-progress session's displayed state, and including any agent stage that was still running in the background.
7. **Given** the user reopens "About This App" after a previous visit, **When** the overlay opens, **Then** it starts again from Slide 1 (a fresh viewing, not a resumed position).

---

### User Story 2 - Browse the slideshow with the keyboard alone (Priority: P2)

A user who navigates by keyboard — because they prefer it, or because they must — pages through the entire slideshow and back out of it again without ever touching a pointing device, and always knows, via their screen reader or visible focus, where they are.

**Why this priority**: The rest of the app already holds itself to keyboard/screen-reader parity (existing axe-core coverage, ARIA-labeled controls). This story extends that same bar to the new feature; it's a meaningful but separable increment on top of Story 1's working slideshow.

**Independent Test**: With Story 1's slideshow already working via mouse/tap, open it and, using only the keyboard, move forward and back through every slide with the arrow keys, confirm focus lands somewhere sensible when the overlay opens and again when it closes, and confirm a screen reader announces both the slideshow's opening and each slide change.

**Acceptance Scenarios**:

1. **Given** the slideshow is open and focus is anywhere inside it, **When** the user presses the Right arrow key, **Then** the slideshow advances exactly one slide (same result as selecting "Next"), unless already on the last slide.
2. **Given** the slideshow is open, **When** the user presses the Left arrow key, **Then** the slideshow goes back exactly one slide (same result as selecting "Previous"), unless already on the first slide.
3. **Given** the user opens the slideshow, **When** the overlay appears, **Then** keyboard focus moves into the slideshow overlay (not left behind on the header button).
4. **Given** the user closes the slideshow via "Return to App" or a keyboard-equivalent action, **When** the overlay closes, **Then** keyboard focus returns to the control that opened it (the "About This App" nav item).
5. **Given** a screen reader user changes slides by any method, **When** the new slide renders, **Then** the screen reader announces the change (e.g., the current slide's position and title), not just the header/footer chrome.

---

### User Story 3 - Read the slideshow comfortably on a phone (Priority: P3)

A user on a small phone screen opens the slideshow and can read every slide — including the longer, more technical ones — without content being cut off, requiring sideways scrolling of the whole page, or shrinking controls out of reach.

**Why this priority**: Content and keyboard access (Stories 1–2) are the substance of the feature; this story is about the deck remaining usable on the narrowest devices the rest of the app already supports, and can be verified and refined independently once the content and navigation exist.

**Independent Test**: With Stories 1–2 already working, resize the viewport down to a typical small-phone width and confirm every slide — text, any directory-tree or flow diagram, and the Next/Previous/Return controls — remains fully readable and operable without horizontal scrolling of the page itself.

**Acceptance Scenarios**:

1. **Given** the viewport is phone-width, **When** any slide is shown, **Then** its text and visuals reflow to fit without being clipped and without the page needing to scroll sideways.
2. **Given** the viewport is phone-width, **When** the slideshow is open, **Then** "Next," "Previous," and "Return to App" remain visible and reachable (e.g., large enough to tap accurately) without obscuring slide content.
3. **Given** a slide contains content wider than the phone screen by nature (e.g., the directory tree or the stage-flow diagram on Slides 4–5), **When** that slide is shown, **Then** only that specific content region scrolls horizontally within its own bounds — the rest of the page does not.

---

### Edge Cases

- **Slideshow opened while a recipe stage is actively running** (a step is in flight, or Auto-run is mid-loop): opening the slideshow does not cancel that request; it continues in the background, and its outcome is reflected in the app view the user returns to (see Assumptions).
- **Rapid repeated Next/Previous presses or key-repeat**: navigation stays within bounds (never advances past the last slide or before the first) and never desyncs the visible slide from the announced one.
- **Opening the slideshow with no prior sessions on the device** (a brand-new visitor, empty session list): "About This App" is still reachable and fully functional; it has no dependency on any session existing.
- **Narrow viewport plus a long slide** (Slide 3 or 4, the densest ones): content scrolls vertically within the slide rather than being truncated or overlapping the controls.
- **Slideshow left open and the browser tab is backgrounded/restored**: no state is lost; the same slide is still shown on return.

## Requirements *(mandatory)*

### Functional Requirements

**Entry point & overlay behavior**

- **FR-001**: The system MUST provide an "About This App" entry point in the persistent header, visible and reachable from every app view (entry form, session list, and an active session), regardless of whether a session exists.
- **FR-002**: Selecting "About This App" MUST open the slideshow as a full-page overlay that replaces the current view entirely (not a modal dialog layered above it) — the underlying app is not visible or interactive while the slideshow is open — and starts on Slide 1.
- **FR-003**: The slideshow MUST provide "Next" and "Previous" controls that move exactly one slide forward or back per activation, and that are unavailable (disabled or absent, communicated to assistive technology) at the last and first slide respectively.
- **FR-004**: The slideshow MUST provide a clearly labeled "Return to App" control that closes the overlay and restores the exact underlying app view the user had before opening it, with no data loss — including the outcome of any agent stage that finished running in the background while the slideshow was open.
- **FR-005**: The slideshow MUST always reopen on Slide 1; it does not remember or resume a previously viewed slide position across visits.

**Slide content**

- **FR-006**: Slide 1 ("Author Profile") MUST present a 1-2 sentence author bio and an outbound link to the author's LinkedIn profile, opening in a new tab.
- **FR-007**: Slide 2 ("High-Level Architecture & Tech Stack") MUST name and briefly explain the app's core technology choices: the Next.js App Router, the Node.js serverless execution model the app's routes run under, the LangGraph.js agent-graph engine, the Claude models used via OpenRouter (a faster model for routine graph nodes, a stronger model reserved for the critique step), and Zod as the schema-validation layer tying the graph's state together.
- **FR-008**: Slide 3 ("Database & State Persistence") MUST explain how the app persists and retrieves an agent run's history — the Postgres-backed checkpoint mechanism, and in plain terms how each step's checkpoint links back to its parent so that inspecting history, branching, and editing-and-retrying an earlier step ("time travel") are possible.
- **FR-009**: Slide 4 ("Repository Structure") MUST present a visual directory/file tree of the codebase's key areas — the API routes handling a recipe run, the agent graph's node definitions, the shared state schema, the database migration scripts, and the UI layer — with enough labeling that a reader can map each area to what it's responsible for.
- **FR-010**: Slide 5 ("End-to-End Execution Flow") MUST walk through a recipe run's full lifecycle in order: submitting ingredients, a run starting, the sequence of agent stages it passes through (parsing ingredients, proposing directions, drafting the recipe, a critique-and-refine loop, and finalizing), the fact that the run pauses after each stage rather than running straight through, and the finished recipe being shown to the user.
- **FR-011**: Wherever explaining a topic in FR-007 through FR-010 more deeply would meaningfully improve a reader's understanding of how the app behaves — without requiring prior technical background to follow — the relevant slide MUST include that deeper explanation. At minimum, this means covering: why the app reuses a single database connection pool and a single compiled agent graph across requests rather than recreating them each time; why the pieces of a recipe's state are each replaced wholesale on update rather than accumulated, and why that choice is what makes editing an earlier step and re-running from there work cleanly; why a run pauses after every single stage instead of running multiple stages back to back; and, in plain terms, how a flat list of saved steps becomes the branching, forkable history a reader sees when they inspect a run.
- **FR-012**: Every slide's content MUST be understandable by a reader with no prior background in the technologies named, without omitting the specific, correct technical detail — i.e., depth is added through plain-language explanation, not by leaving things out.

**Keyboard & accessibility**

- **FR-013**: While the slideshow is open, the Right and Left arrow keys MUST move to the next and previous slide respectively, equivalent to activating the "Next"/"Previous" controls, subject to the same first/last-slide boundaries.
- **FR-014**: Opening the slideshow MUST move keyboard focus into the overlay; closing it MUST return keyboard focus to the control that opened it.
- **FR-015**: "Next," "Previous," "Return to App," and the current slide's position (e.g., "Slide 2 of 5") MUST be exposed to assistive technology via appropriate ARIA labeling/roles, and a slide change MUST be announced to screen readers.
- **FR-016**: The slideshow MUST meet the same automated accessibility standard already enforced elsewhere in the app (zero critical/serious axe-core violations) on every slide.

**Responsiveness**

- **FR-017**: Every slide MUST render without clipped content and without causing the overall page to scroll horizontally, across viewport widths from a small phone up through a standard desktop display.
- **FR-018**: Where a slide's visual content (the directory tree on Slide 4, the stage-flow diagram on Slide 5) is inherently wider than a narrow viewport, only that content region MUST scroll horizontally within its own bounds, and this MUST be operable by touch as well as pointer/keyboard.
- **FR-019**: The "Next," "Previous," and "Return to App" controls MUST remain visible and reachable at every supported viewport width, at a minimum ~44×44 CSS px tappable target on touch devices (matching WCAG 2.5.5's target-size guidance).

### Key Entities

- **Slide**: One page of the presentation. Has a fixed position in the deck (1–5), a title, and body content (the required topic for that position, per FR-006–FR-010). The five slides are fixed and ordered; this feature does not support adding, removing, or reordering slides at runtime.
- **Author Profile**: The specific content shown on Slide 1 — a short bio and a single outbound LinkedIn link.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can find and open "About This App" from anywhere in the app within 5 seconds, without being told where to look.
- **SC-002**: 100% of the five required topics (author, tech stack, persistence, repository structure, execution flow) are present and locatable in the slideshow at all times.
- **SC-003**: A user can reach the last slide from the first, and return to the first from the last, using only the keyboard — no mouse or touch input required.
- **SC-004**: Every slide renders fully, with no clipped or hidden content and no whole-page horizontal scrolling, at viewport widths from 320px through 1920px.
- **SC-005**: An automated accessibility scan reports zero critical or serious violations on every slide.
- **SC-006**: 100% of the time, closing the slideshow returns the user to the exact app view (including an in-progress session's state) they had before opening it.
- **SC-007**: In an informal read-through by someone unfamiliar with the app's internals, they can correctly describe, in their own words, what happens between submitting ingredients and getting a recipe, and what "forking" a run means — after reading the slideshow and nothing else.

## Assumptions

- The slideshow reuses the author LinkedIn link already published in the app's header ("Author" link, opens in a new tab) as Slide 1's outbound link; the bio text itself is new copy, authored once as part of building this feature and kept as a single, easily-edited piece of content rather than sourced from anywhere else in the app.
- "About This App" carries no access restriction — it's reachable the same way for every visitor, since the app itself has no login/accounts.
- The slideshow's open/closed state and current slide position are transient client-side UI state only; consistent with the app's existing single-route design (no session or view state ever appears in the page URL), the slideshow does not introduce URL-based navigation for individual slides.
- Opening or closing the slideshow never cancels an in-flight agent request; any stage already running when the user opens the slideshow keeps running in the background, and its result is reflected in the app view when the user returns.
- All slide content, including Slide 4's directory tree and Slide 5's stage list, is static, developer-authored copy describing the codebase's structure as it exists at the time this feature is built — not generated or introspected live from the running app. Keeping it accurate as the codebase evolves is an ongoing content-maintenance task, the same as any other documentation in this repository (e.g., the README).

## Dependencies

- The existing persistent app header, as the integration point for the new "About This App" entry point.
- The app's existing accessibility conventions (ARIA labeling, focus management, automated axe-core checks) that this feature is held to the same standard as.
- The author's own bio copy and confirmation that the existing LinkedIn link is the correct one to reuse.

## Out of Scope

- Any in-app authoring or admin UI for editing slide content — content is fixed, developer-maintained copy.
- Usage analytics or engagement tracking for the slideshow.
- Localization/translation of slide content into languages other than the app's existing language.
- Exporting or printing the slideshow (e.g., as a PDF or shareable link to a specific slide).
- Animated diagrams, video, or audio content — visuals are static.
- Adding, removing, or reordering slides at runtime, or supporting more than the five specified slides.
