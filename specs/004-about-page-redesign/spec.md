# Feature Specification: About Page Redesign (Scrolling Reference Page)

**Feature Directory**: `specs/004-about-page-redesign`
**Created**: 2026-09-18
**Status**: Draft
**Input**: User description: "Replace the existing 'About This App' slideshow (spec 002) with a single, full-scrolling 'About This App' reference page, opened the same way (full-page overlay, same header entry point) but with no slide-by-slide pagination — a sticky top nav with anchor links instead. Content, section order, and visual design must match the reference mockup at design/v002/about.html exactly in substance: the app in one sentence, who built it, the time-travel checkpoint-and-fork idea (with a diagram), what using the app feels like, the six-hop request architecture, the full seven-node agent graph with both conditional edges' exact conditions shown as visible text, the per-stage prompt/model-routing table, the ten-channel GraphState object and where Zod validates it (a model's structured output, and a /fork edit patch) before either overwrites a Postgres-checkpointed channel, the fork/branch-replay mechanism, the three-table data model and how the browsable history tree is rebuilt from it, the repository structure with a GitHub link, the API contract and guardrails, the six constitution principles, and a closing pointer to specs/. All diagrams are single responsive inline SVGs (shapes, connectors, and labels together, no separate HTML overlay). Tokens-only styling, light/dark mode, the same accessibility and responsiveness bar as spec 002. lib/about-content.ts's five-slide model is retired for new content structured however best serves this page. Full replacement — no dual-mode toggle, and design/v002/about.html itself doesn't need to become a live route."

## Clarifications

### Session 2026-09-18

- Q: The widest diagram (the seven-node agent graph) would shrink its embedded text roughly 3x at a 320px phone width under pure viewBox-only scaling. Should the widest diagram(s) get a bounded horizontal-scroll container to stay legible, or scale purely via viewBox with no exception? → A: A bounded horizontal-scroll container for the widest diagram(s) — the SVG renders at a legible minimum size and scrolls within its own bounded region on narrow viewports, matching the pattern spec 002 already established for its own wide diagrams.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get the full picture in one continuous read, with a clear way back (Priority: P1)

A visitor opens "About This App" from the header and gets one continuous, scrollable page covering everything from a one-sentence pitch through the full technical architecture — instead of clicking through a fixed set of slides one at a time. When they're done, one clearly labeled control takes them straight back to exactly the app view they left.

**Why this priority**: This is the entire replacement. Without a working, content-complete scrolling page that opens and closes cleanly, nothing else in this feature has value — and the old slide-by-slide experience it replaces stops existing the moment this ships.

**Independent Test**: From the header, open "About This App," scroll from the very top to the very bottom of the page, confirming every required topic appears somewhere along the way in the right order, then use the "back to the app" control and confirm the underlying view (including an in-progress session's state) is exactly what it was before opening.

**Acceptance Scenarios**:

1. **Given** the app is open to any view (entry form, session list, or an active session), **When** the visitor selects "About This App" in the header, **Then** the reference page opens as a full-page overlay, starting at the very top.
2. **Given** the reference page is open, **When** the visitor scrolls, **Then** they move continuously through every required topic in its specified order — there is no "next slide" or "previous slide" control anywhere on the page.
3. **Given** the reference page is open, **When** the visitor activates the "back to the app" control, **Then** the overlay closes and the underlying app view is exactly what it was before opening — including the outcome of any agent stage that finished running in the background while the page was open.
4. **Given** the visitor closes and later reopens the reference page, **When** it opens, **Then** it starts again at the top — no scroll position is remembered across visits.

---

### User Story 2 - Jump straight to a topic instead of scrolling past everything (Priority: P2)

A visitor who wants one specific thing — say, the API guardrails, or the engineering principles — uses a sticky top navigation to jump directly to that part of the page, rather than scrolling past every section in between.

**Why this priority**: Builds on Story 1's content; without it the page still delivers its full value to someone willing to scroll, but a fast path to a specific topic is what makes a long reference page practically usable, especially for a returning reader.

**Independent Test**: Open the reference page, select a topic link from the sticky navigation partway down the topic list, and confirm the page jumps straight to that section without needing to scroll past the sections in between; confirm the navigation itself stays reachable no matter how far down the page the visitor has scrolled.

**Acceptance Scenarios**:

1. **Given** the reference page is open, **When** the visitor scrolls down, **Then** the topic navigation stays visible and reachable rather than scrolling out of view.
2. **Given** the visitor selects a topic link, **When** the page jumps to that section, **Then** keyboard focus and screen-reader attention move to that section too — not just the visual scroll position.
3. **Given** a visitor using only the keyboard, **When** they tab to the topic navigation, **Then** every link is individually reachable and activatable without a mouse.

---

### User Story 3 - The diagrams stay correct and legible at any screen size (Priority: P3)

A visitor on a phone, and the same visitor later at a wide desktop monitor, both see every diagram (the time-travel/branching picture, the agent graph, and the state/validation/persistence picture) fully legible, correctly proportioned, and with every label staying attached to the shape it describes.

**Why this priority**: The content and navigation (Stories 1-2) are the substance; this story is about the diagrams — the hardest thing to get right responsively — holding together at every width the rest of the app already supports, and can be verified once those exist.

**Independent Test**: Open the reference page at a small-phone width and again at a wide desktop width, and at each, confirm every diagram's shapes, connecting lines, and text labels remain aligned to each other and fully readable, with no label drifting away from what it's labeling.

**Acceptance Scenarios**:

1. **Given** the reference page is open at any supported viewport width, **When** a visitor reaches a diagram, **Then** every shape, connector, and label in it scales together as a single image — never as separately positioned pieces that could drift apart from each other.
2. **Given** the viewport is phone-width, **When** a visitor reaches the widest diagram, **Then** it stays legible — either by fitting comfortably at that width, or by rendering at a legible minimum size and scrolling horizontally within its own bounded region — without causing the whole page to scroll sideways (FR-021a).

---

### Edge Cases

- **Opened while a recipe stage is actively running**: the same guarantee this app already makes elsewhere — opening the reference page never cancels an in-flight request, and its outcome is reflected in the app view the visitor returns to.
- **A visitor who has never started a session** (a brand-new device, empty session list): the reference page is still fully reachable and functional — it has no dependency on any session existing.
- **A visitor with reduced-motion preferences set**: jumping to a section via the topic navigation does not force an animated scroll on a visitor who has asked their system to minimize motion.
- **The narrowest supported viewport, on the densest section** (the seven-node agent graph, the widest diagram): the diagram stays legible by scrolling within its own bounded region rather than shrinking further (FR-021a); the page itself never scrolls horizontally.

## Requirements *(mandatory)*

### Functional Requirements

**Replacing the slideshow**

- **FR-001**: The system MUST replace the existing five-slide "About This App" experience (spec 002) entirely — there MUST NOT be a way to reach the old slide-by-slide presentation once this ships, and there MUST NOT be a toggle between an old and a new version.
- **FR-002**: The reference page MUST open from the same header control, labeled the same way, as the slideshow it replaces.
- **FR-003**: The reference page MUST open as a full-page overlay that replaces the current view, the same way the slideshow it replaces did.
- **FR-004**: The reference page MUST provide no slide-by-slide pagination (no "next"/"previous" controls) — a visitor's only means of moving through the content is scrolling and/or the topic navigation (FR-010).
- **FR-005**: The reference page MUST provide one clearly labeled control that closes it and returns the visitor to the exact app view they had before opening it, with no loss of in-progress state — including the outcome of any agent stage that finished running in the background while the page was open.
- **FR-006**: The reference page MUST always open at the top — it MUST NOT remember or resume a previous scroll position across visits.

**Content and section order**

The content, wording, section order, and visual design are governed by `design/v002/about.html` (the reference mockup) as the authoritative source — the functional requirements below name the required *topics*, in their required order, without repeating that mockup's exact wording here.

- **FR-007**: The page MUST open with a one-sentence statement of what the app does, followed by who built it and a link to the author's LinkedIn profile (reusing the same link already used elsewhere in the app's header).
- **FR-008**: The page MUST explain, in plain language suitable for a non-technical reader, the app's core "time travel" idea — that every stage's output is saved as its own checkpoint, and that editing an earlier one and continuing creates a new branch without disturbing the original — illustrated with a diagram showing an original sequence of checkpoints and a new branch forked from one of them partway through.
- **FR-009**: The page MUST describe what using the app feels like end to end, from typing in ingredients through to a finished, cookable recipe, including that no account or login is needed and that a session is private to the device that created it.
- **FR-010**: The page MUST provide a topic navigation, sticky (remaining reachable regardless of scroll position), linking to each of the page's major technical sections (architecture, agent graph, state & persistence, branching, data model, repository, API, and principles, at minimum) — matching which sections the reference mockup exposes in its own navigation.
- **FR-011**: The page MUST explain the request path a single user action takes from the browser through validation to the agent graph and back, naming each hop and which of those hops is a genuine network round trip versus a same-process function call.
- **FR-012**: The page MUST show the complete seven-stage agent graph (parseIngredients, proposeDirections, selectDirection, draftRecipe, critique, refine, finalize) as a diagram, together with the exact conditions of both of its conditional branch points, shown as visible, readable text — not omitted or only implied by the diagram's shapes.
- **FR-013**: The page MUST provide a table listing, for every stage, which tier of model it uses, what it asks that model to do, and which stage or outcome it leads to next.
- **FR-014**: The page MUST name every channel of the shared state object, and MUST explain that this state is checked against a schema at exactly two moments — when a model's structured reply first comes back, and when a person's edit-and-continue ("fork") request is submitted — before either is trusted to replace a channel that's otherwise saved to the database after every stage, illustrated with a diagram connecting those two check-points to the shared state and to that database.
- **FR-015**: The page MUST explain, as an ordered sequence, how editing an earlier step and continuing works: reading the original branch's recorded history, starting a new branch from it, replaying every step up to the edit exactly as it happened, applying the edit as the final replayed step, and recording the new branch's relationship to the one it came from.
- **FR-016**: The page MUST describe the three-table structure this app's own bookkeeping uses (one table for sessions, one for branch relationships, one for usage/limit tracking) and explain that the browsable history a visitor sees elsewhere in the app is rebuilt by combining a branch's own recorded sequence with the branch-relationship table — neither alone is enough.
- **FR-017**: The page MUST describe the repository's directory structure at a level that maps each major area to what it's responsible for, and MUST include an outbound link to the project's public GitHub repository.
- **FR-018**: The page MUST describe the API-level guardrails a visitor's requests are subject to: the single anonymous credential every request carries, that a failed stage is reported as a normal (non-error) response with its own place in the run's history rather than as a request-level error, and that there are multiple distinct kinds of usage limit that can turn away a request — plus a list of the available routes.
- **FR-019**: The page MUST summarize the project's own governing engineering principles as a short, named list.
- **FR-020**: The page MUST close with a pointer to the `specs/` directory as the ongoing, authoritative source of truth the page itself was built from.

**Diagrams**

- **FR-021**: Every diagram on the page (the time-travel/branching diagram, the agent graph, and the state/validation/persistence diagram) MUST be built as a single scalable image containing every shape, connecting line, and text label together — so the whole diagram, labels included, resizes as one piece and never drifts out of alignment at a width other than the one it was designed at.
- **FR-021a**: Where scaling a diagram down to fit a narrow viewport would shrink its text below a comfortably legible size, that diagram MUST instead render at a legible minimum size and scroll horizontally within its own bounded region, rather than continuing to shrink — this applies at minimum to the agent graph diagram (the widest one), and MUST NOT cause the surrounding page to scroll horizontally.

**Visual design, theming, accessibility, responsiveness**

- **FR-022**: The page MUST use only the app's existing shared design tokens for every color, font, spacing, and corner-radius value — no new hard-coded visual value introduced for this page alone.
- **FR-023**: The page MUST render correctly in both light and dark mode, following the same automatic (system-preference-based) switching every other screen in the app already uses.
- **FR-024**: The page MUST meet the same automated accessibility standard already enforced elsewhere in the app (zero critical/serious violations).
- **FR-025**: The page MUST be fully operable by keyboard alone, including every topic-navigation link, with a visible indication of keyboard focus at every step, and MUST announce section changes reached via the topic navigation to assistive technology.
- **FR-026**: The page MUST render without clipped content and without causing the overall page to scroll horizontally, across viewport widths from a small phone up through a standard desktop display.

### Key Entities

- **Reference Page Section**: One topic of the scrolling page — a heading, its body content, and (for most, but not all, sections — matching the mockup) an entry in the sticky topic navigation. Sections are fixed in number and order; this feature does not support reordering or adding sections at runtime.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor can reach every required topic (FR-007–FR-020) by scrolling from top to bottom of the page a single time, in the specified order, with no pagination control anywhere on the page.
- **SC-002**: A visitor can reach any of the page's major technical sections directly from the topic navigation, from anywhere on the page, without first scrolling past intervening sections.
- **SC-003**: Every diagram renders fully legible, with no clipped or misaligned label, at viewport widths from 320px through 1920px — via fitting the viewport directly, or, for the widest diagram(s), via a bounded internal horizontal scroll (FR-021a) — with the page itself never scrolling horizontally.
- **SC-004**: An automated accessibility scan reports zero critical or serious violations on the page.
- **SC-005**: 100% of the time, closing the page returns the visitor to the exact app view (including an in-progress session's state) they had before opening it.
- **SC-006**: A visitor using only the keyboard can reach and activate every topic-navigation link and the "back to the app" control, with visible focus at every step.

## Assumptions

- The reference page keeps the same overlay presentation semantics the slideshow it replaces already used (a full-page takeover that visually and interactively supersedes the rest of the app while open), since the request explicitly says it is "opened the same way." Within that, it is presented as a genuine scrollable document (proper heading levels, standard page-landmark semantics) rather than a bounded dialog — a long reference page with many in-page and outbound links reads more naturally to assistive technology as a page than as a small modal, and nothing in the request requires the old slideshow's tighter dialog framing to carry over along with its presentation.
- The header control that opens this page keeps its existing label ("About This App") — the request changes what it opens, not what it's called.
- `design/v002/about.html` remains a design-reference artifact only (matching this repository's existing `design/v001/` convention for non-shipped design mockups) — it is not deleted, and it is not wired up as a servable route.
- The exact wording, section styling, and content details are drawn directly from `design/v002/about.html` at build time; this spec names the required topics and their order without duplicating that file's prose.
- Section anchors in the sticky topic navigation match which sections the reference mockup itself exposes there: Overview (pitch), Using it (journey), Architecture, Agent graph, State & persistence, Branching, Data model, Repo, API, and Principles — ten entries. The cover, author bio, time-travel, "under the hood" divider, and closing sections are reached by scrolling, not by a nav link — matching the mockup.

## Dependencies

- `design/v002/about.html` — the authoritative source for this page's exact content, wording, and layout.
- The existing header control and full-page-overlay presentation pattern this feature carries over from spec 002.
- The existing design tokens (`app/tokens.css`) and accessibility/responsiveness conventions already enforced elsewhere in the app.
- The author's LinkedIn link already used in the app's header.

## Out of Scope

- Any change to the underlying app, agent graph, or API this page describes — this feature only changes how that existing system is *documented* to a reader.
- A standalone, publicly servable version of this page outside the app's own overlay (e.g., a static `/about` route reachable without opening the app).
- Preserving or migrating any user-facing state from the old slideshow (e.g., a remembered slide position) — there is none to carry over.
- Translating this page into a language other than the app's existing one.
