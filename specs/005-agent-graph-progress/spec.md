# Feature Specification: Agent Graph Progress Diagram

**Feature Directory**: `specs/005-agent-graph-progress`
**Created**: 2026-09-19
**Status**: Draft
**Input**: User description: "Replace the flat, linear stage-progress stepper (components/StageProgress.tsx, rendered in app/page.tsx above the running session) with a diagram that shows a run's actual progression through the agent graph — nodes and edges, including its two conditional branch points — instead of a straight-line list of pills. Today's component hard-codes a single linear STAGES array and marks each one done, active, or upcoming purely by its index versus `next[0]`. This doesn't match the graph's real shape and produces a specifically misleading result today: parseIngredients's own conditional edge can route to either proposeDirections or a separate ingredientError node, but the component has no node for ingredientError at all — so when outcome is 'ingredient-error', it currently marks every one of the seven forward stages as 'done', which never happened. The new version must render the graph's true topology, distinguish which nodes/edges are actually part of the path taken so far versus never reached, remain at least as accessible as the semantic `<ol>`/`aria-current='step'` it replaces, and use the same inline-SVG/tokens-only diagramming approach already established in design/v002/about.html's agent-graph diagram — except this one reflects one specific run's real, live state rather than being illustrative."

## Clarifications

### Session 2026-09-19

- Q: When a run has looped through `refine` → `critique` one or more times, how should the diagram represent that loop? → A: A simple taken/not-taken indicator — the same binary treatment every other edge and node in the diagram gets. No cycle count against the revision budget is surfaced.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the run's real path through the graph, not a misleading straight line (Priority: P1)

Someone watching a recipe come together sees, at any point in an active run, an accurate picture of what the agent has actually done so far — including when the run took a side path (an ingredient couldn't be used) or looped back to revise the draft — instead of a checklist that always implies straight-line progress even when that isn't what happened.

**Why this priority**: This is the entire reason for the change. The component it replaces is actively misleading today (a run that hit the ingredient-error path shows as if all seven forward stages completed successfully) — fixing that, for every viewer including one relying on a screen reader, is the whole point; nothing else in this feature has value without it.

**Independent Test**: Run a session that takes the ingredient-error path, and separately a session that loops through a revision cycle before finishing — in both cases, confirm the diagram (and its non-visual equivalent) shows exactly what happened: the real path taken, not an inferred straight line, visible to a sighted user and discoverable by a screen reader user.

**Acceptance Scenarios**:

1. **Given** a run has just started and hasn't completed its first stage yet, **When** the diagram is shown, **Then** no node or edge is marked as taken, and the first stage is marked as the current one.
2. **Given** a run's first stage found an ingredient it couldn't use, **When** the diagram is shown, **Then** only the path into the ingredient-error outcome is marked as taken, and none of the seven main-path stages are marked as taken.
3. **Given** a run has completed several stages along the main path and is paused awaiting its next stage, **When** the diagram is shown, **Then** exactly the stages and connections actually completed are marked as taken, the paused-at stage is marked as current, and every stage still ahead is marked as not-yet-reached.
4. **Given** a run has revised its draft one or more times before finishing, **When** the diagram is shown, **Then** the revision loop is marked as taken, distinguishing it from a run that went straight through without ever revising.
5. **Given** any of the above states, **When** the same information is requested non-visually (e.g., by a screen reader), **Then** which stage is current and which path was actually taken so far is discoverable without relying on the diagram's visual appearance.

---

### User Story 2 - Get the same live progress information without seeing the diagram (Priority: P2)

Someone using a screen reader gets the same "where is this run right now, and how did it get here" understanding that a sighted user gets from looking at the diagram — matching (not regressing from) the plain numbered list this feature replaces, which already announced the active stage to assistive technology.

**Why this priority**: Builds on Story 1's correctness with the specific non-visual delivery mechanism; called out on its own because the component being replaced already met this bar, and a shape-accurate diagram that regresses on accessibility would be a net loss for a real subset of users, not an acceptable trade-off.

**Independent Test**: Using only a screen reader (no visual reference), determine which stage a given run is currently paused at and whether it took a side path or a revision loop, for the same set of runs used in Story 1's test.

**Acceptance Scenarios**:

1. **Given** the diagram is showing any run's state, **When** a screen reader user reaches it, **Then** they can determine which single stage is current, equivalently to how the replaced component's `aria-current="step"` worked.
2. **Given** a run took the ingredient-error path or a revision loop, **When** a screen reader user reaches the diagram, **Then** that specific path is discoverable non-visually, not just "some stage is current" — the same distinction a sighted user sees.
3. **Given** the diagram is scanned by an automated accessibility checker, **When** the scan runs, **Then** it reports zero critical or serious violations.

---

### User Story 3 - The diagram fits naturally into the running-session view (Priority: P3)

The diagram reads clearly at the modest size appropriate for a small status element inline in the running-session view — not shrunk into illegibility, and not so large that it dominates the page the way a standalone architecture diagram would.

**Why this priority**: Correctness (Story 1) and accessibility (Story 2) are the substance; this story is about the diagram holding together visually once it's actually sitting in its real spot on the page, and can only really be judged once those exist.

**Independent Test**: View the running-session page at a range of window widths, including a small phone width, and confirm the diagram stays legible, doesn't force the page to scroll sideways, and matches the app's current visual theme (light and dark).

**Acceptance Scenarios**:

1. **Given** the running-session view is open at any supported window width, **When** the diagram renders, **Then** every node, connector, and label stays legible and the surrounding page never scrolls sideways because of it.
2. **Given** the visitor's system is set to light or dark mode, **When** the diagram renders, **Then** it matches the app's current theme the same way every other element on the page does.

---

### Edge Cases

- **A stage that failed and is awaiting retry**: the failed stage is not yet complete (the run hasn't advanced past it) — it must be shown as the current stage, not as taken, and not as never-reached.
- **Viewing an earlier point in the run's history** (not the latest step): the diagram reflects the path up to whichever point is currently being viewed, consistent with how the rest of the running-session view already re-renders for a historical view.
- **A run that has just finished** (successfully or via the ingredient-error path): every stage on the actual path taken is marked as taken, with nothing marked as current.
- **The other side of a decision point the run has already passed**: once a run has gone one way at a branch point (e.g., taken the main path instead of the ingredient-error path, or gone straight to finishing instead of revising), the untaken side must read as clearly not-taken — not ambiguous, and not confusable with "not yet reached."

## Requirements *(mandatory)*

### Functional Requirements

**Graph topology**

- **FR-001**: The diagram MUST include every stage in the agent's graph, including the ingredient-error stage that the replaced component omitted entirely.
- **FR-002**: The diagram MUST show both of the graph's decision points (whether an ingredient was usable; whether a revision is needed) as visually distinct from the plain stages, using the same visual distinction (a different shape) already established for this in the app's existing architecture diagram.
- **FR-003**: The diagram MUST show the connection that allows a run to revise its draft and be re-reviewed more than once before finishing.

**Reflecting one specific run's real state**

- **FR-004**: For the run currently being viewed, the diagram MUST visually distinguish at least three states for every stage and connection: part of the path actually taken so far, the current/paused-at stage, and not (yet) part of the path taken — see FR-007 for a required fourth state at decision points specifically.
- **FR-005**: When a run took the ingredient-error path, the diagram MUST show that path as taken and MUST NOT show any of the seven main-path stages as taken.
- **FR-006**: When a run has revised its draft one or more times, the diagram MUST show the revision loop as taken (the same binary taken/not-taken treatment as any other edge, per Clarifications — no cycle count against the revision budget is required); when it has not, the loop MUST show as not taken.
- **FR-007**: At each decision point the run has already passed, the side not taken MUST be visually distinguishable from both the side taken and from a stage that simply hasn't been reached yet.
- **FR-008**: At most one stage MUST be marked as the current stage at any time; a finished run (successfully or via the ingredient-error path) MUST show no current stage.

**Visual design**

- **FR-009**: The diagram MUST be built as a single self-contained scalable image (every shape, connector, and label together, no separately positioned overlay pieces) — the same technique already used for this app's existing agent-graph diagram.
- **FR-010**: The diagram MUST use only the app's existing shared design tokens for every visual value, and MUST render correctly in both light and dark mode, matching every other element in the running-session view.
- **FR-011**: The diagram MUST be sized to sit naturally inline within the running-session view, at whatever size is legible there — not presented as a large standalone page section.

**Accessibility**

- **FR-012**: The diagram MUST convey, to assistive technology, which single stage is current — at least as clearly as the semantic list and `aria-current="step"` behavior it replaces.
- **FR-013**: The diagram MUST convey, to assistive technology, which path the run has actually taken so far — not only which stage is current — since the shape it now takes (a branching graph, not a straight line) makes this a separate fact from "how many stages forward."
- **FR-014**: The diagram MUST meet the same automated accessibility standard already enforced elsewhere in the app (zero critical/serious violations).

### Key Entities

- **Graph Topology**: The agent's fixed set of stages and connections — including both decision points and the revision loop — the same shape documented elsewhere in the app (the About page's own architecture diagram). Fixed; does not vary per run.
- **Run Path State**: For one specific run being viewed at one specific point in its history — which stages/connections are taken, which single stage (if any) is current, and which are not yet reached. Derived from that run's own history; recalculated for whichever point in that history is currently being viewed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A run that took the ingredient-error path shows exactly that path as taken, and zero of the seven main-path stages as taken — 100% of the time.
- **SC-002**: A run that has revised its draft at least once shows the revision loop as taken, distinguishable from a run that never revised, 100% of the time.
- **SC-003**: A person using only a screen reader can correctly identify the current stage and whether the run took the ingredient-error path or a revision loop, without any visual reference.
- **SC-004**: An automated accessibility scan of the running-session view reports zero critical or serious violations.
- **SC-005**: The diagram renders legibly with no sideways page scrolling at window widths from a small phone through a standard desktop display.
- **SC-006**: The diagram matches the app's light/dark theme with no unstyled or hard-coded-looking element.

## Assumptions

- The diagram is scoped to one run's progression through the agent's fixed graph topology (stages and their connections). It is a different concept from, and does not replace or change, the separate session/branch history tree already shown elsewhere in the running-session view (the collapsible "History" section) — that continues to represent forks and edits across an entire session, not a single run's stage-by-stage progress.
- Whether the data already available to today's component (`next`, `outcome`) is sufficient to determine the exact path taken (including the ingredient-error branch and how many revision cycles occurred), or whether it needs access to more of the run's own recorded history, is a planning-time question, not a product-scope one — the running-session view already fetches per-run history data elsewhere on the same page (for the existing History section), which may already carry what's needed. Either way, the requirement is the same: the diagram must show the real path taken.
- The diagram remains a read-only reflection of state — it does not add a new way to interact with or jump to a specific point in the run (that already exists elsewhere in the running-session view); matching how the component it replaces was also non-interactive.
- A failed stage awaiting retry is treated as the current stage (the run hasn't advanced past it), the same way the rest of the running-session view already treats a stage failure as "not yet complete" rather than an error state requiring separate diagram handling.
- The app's configured limit on how many times a run may revise its draft is not itself displayed by the diagram (per Clarifications, the loop is a simple taken/not-taken indicator); this feature does not change that limit.

## Dependencies

- The agent's existing graph topology and its two conditional decision points — the same shape already documented in the app's own About page architecture diagram.
- The app's existing shared design tokens and the accessibility/responsiveness conventions already enforced elsewhere in the app.
- Whichever source of per-run history data ends up supplying the "path taken so far" detail (resolved during planning).

## Out of Scope

- Any change to the agent's actual graph, its stages, its connections, or its revision-cycle limit — this feature only changes how a run's progress through that existing graph is *displayed*.
- Any change to the separate session/branch history tree shown elsewhere in the running-session view.
- Making the diagram interactive (e.g., clicking a stage to jump to that point in the run) — it remains a read-only status display, as the component it replaces was.
- Any change to the About page's own architecture diagram (spec 004), which stays illustrative and does not reflect any specific run.
