# Feature Specification: Direction Selection Stage

**Feature Directory**: `specs/003-direction-selection`
**Created**: 2026-09-17
**Status**: Draft
**Input**: User description: "Add an explicit direction-selection stage to the Recipe Agent graph, closing a gap where proposeDirections computes 2-3 distinct dish directions but they are never actually chosen between — draftRecipe currently always drafts from the first one, discarding the rest. Add a judging step, mirroring the existing critique/routeAfterCritique pattern, that evaluates the candidates against the parsed ingredients and constraints and records which one was selected (schema-validated, inspectable in history, editable via the existing fork mechanism, like every other stage output). Fall back to a deterministic default (the first-listed candidate) when no direction is clearly better. Selection is fully automatic — no UI for a person to pick directly — and proposeDirections still proposes the same 2-3 candidates as today."

## Clarifications

### Session 2026-09-17

- Q: Is the "no clear winner" fallback (FR-004) a normal, successful judging outcome the model can honestly report, or purely a defensive fallback used only when the judgment step technically fails? → A: A normal, successful outcome — the judgment step always succeeds and always returns a verdict, which includes an honest "no clear favorite" signal alongside its reasoning (mirroring critique's own `blocking` field). A technical failure (bad output, model error) is a separate, unrelated case that goes through the existing stage-failure/retry path instead.
- Q: If an edit leaves fewer than 2 or more than 3 candidate directions before selection (re-)runs, what should happen? → A: Handle it gracefully with no new rule — exactly 1 candidate is auto-selected (with an explanation saying so); 0 candidates is rejected as an invalid edit, the same as any edit that would leave a run unable to proceed. No new count-based validation is added.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The finished recipe reflects a deliberately chosen direction (Priority: P1)

Today, when the assistant proposes 2-3 different directions for a dish, the recipe that actually gets drafted is always built from whichever direction happened to be listed first — the others are generated and then silently thrown away, regardless of whether one of them was actually a better fit for the ingredients and constraints. A user finishing a run should get a recipe built from the direction that best fits what they typed, not an arbitrary first pick.

**Why this priority**: This is the actual defect being fixed. Everything else in this feature (inspectability, editability) only matters once a real choice is being made in the first place.

**Independent Test**: Run the assistant through to a finished recipe with ingredients/constraints that make one proposed direction a clearly better fit than the others (e.g. a direction that doesn't fit a stated dietary constraint at all), and confirm the finished recipe was drafted from the better-fitting direction, not simply the first one listed.

**Acceptance Scenarios**:

1. **Given** proposing directions has just produced 2 or 3 candidate directions, **When** the run continues, **Then** exactly one of those directions is selected before drafting begins, and that selection — not automatically the first candidate — is what the recipe gets drafted from.
2. **Given** the candidates are genuinely equivalent (no clearly better fit among them), **When** selection runs, **Then** the run still proceeds — it selects the first-listed candidate as a deterministic default rather than failing or stalling.
3. **Given** only the minimum of 2 candidate directions were proposed, **When** selection runs, **Then** it still selects between exactly those 2 — the feature does not change how many directions get proposed.

---

### User Story 2 - A user can see which direction was picked, and why (Priority: P2)

Because this app's whole premise is being able to inspect and step through everything the assistant decided, a user reviewing a run's history should be able to see, as its own step, which direction was chosen and a brief reason why — not have to infer it by comparing the final recipe back against the original candidates by hand.

**Why this priority**: Builds directly on Story 1 — once a real choice exists, it needs to be visible the same way every other stage's decision already is (matching how a critique's verdict is visible, not just its downstream effect on the recipe).

**Independent Test**: After a run has selected a direction, open that run's history/timeline and confirm the selection step appears in its correct position (after proposing directions, before drafting), showing which candidate was chosen and a short explanation.

**Acceptance Scenarios**:

1. **Given** a run has passed the selection step, **When** a user inspects that step in the run's history, **Then** they can see which direction was chosen and a brief, honest explanation of why (including, when it applies, an explanation that says plainly the candidates were a close call and the first-listed one was used by default — never a fabricated-sounding rationale for a default pick).
2. **Given** a user is stepping through a run one stage at a time, **When** they reach the point right after directions were proposed, **Then** selecting a direction is its own single step — advancing one step at a time still advances exactly one stage's worth of work, same as every other stage today.
3. **Given** a user lets the run advance automatically end to end, **When** it finishes, **Then** the number of steps recorded is exactly one more than it would have been without this feature, and matches what manual step-by-step advancing through the same run produces.

---

### User Story 3 - A user can correct the selection and continue from it (Priority: P3)

A user who disagrees with which direction was picked — or who edited the candidate directions themselves — can correct the recorded selection (or the directions it was based on) and continue the run from that point, the same way they can already edit and continue from any other stage's output.

**Why this priority**: Extends the existing edit-and-continue capability to the new step; valuable, but the feature delivers its core value (Stories 1-2) without it.

**Independent Test**: After a run has selected a direction, edit the recorded selection to point at a different one of the original candidates and continue the run — confirm the recipe that gets drafted matches the edited selection, not the originally-picked one.

**Acceptance Scenarios**:

1. **Given** a completed selection step, **When** a user edits the recorded selection to a different candidate and continues the run, **Then** the recipe is drafted from the edited selection, and the automatic judgment is not re-run.
2. **Given** a user instead edits the original candidate directions themselves, **When** they continue the run from that edit, **Then** selection runs again and judges the edited set of candidates.

---

### Edge Cases

- **Exactly 2 candidates** (the minimum ever proposed): selection still applies cleanly between just two options.
- **No candidate is clearly better than the others**: a normal, successful judging outcome (FR-004) — selection falls back to the first-listed candidate, and says so plainly rather than inventing a confident-sounding reason (Story 2, Acceptance Scenario 1).
- **The selection step technically fails** (e.g. a transient model/generation error — not the same as the model honestly reporting no clear favorite): the run enters the same failure/retry state every other stage already uses — not a special case (FR-011).
- **An edit leaves exactly 1 candidate direction**: selection trivially selects it, with an explanation that says only one was available (FR-015).
- **An edit would leave 0 candidate directions**: rejected as an invalid edit, same as any edit that would leave the run unable to proceed (FR-015).
- **A run that reached the drafting stage before this feature existed**: treated the same as "no candidate was clearly better" — falls back to the first-listed candidate rather than being unable to continue.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After candidate directions are proposed, the system MUST evaluate them against the parsed ingredients and constraints and select exactly one before a recipe is drafted.
- **FR-002**: The system MUST draft the recipe from the selected direction — never automatically the first-listed candidate, except as the deterministic fallback in FR-004.
- **FR-003**: The selection MUST be recorded as its own inspectable output — which direction was chosen, a brief explanation of why, and an honest signal for whether a candidate was clearly favored or the pick was a default among equivalent options — the same way every other stage's decision is recorded (mirroring how a critique's verdict, including its own `blocking` signal, is recorded).
- **FR-004**: When no candidate is judged clearly better than the others, the system MUST deterministically select the first-listed candidate rather than failing or leaving the run without a selection. This is a normal, successful judging outcome, not an error — the judging step always completes and always records a verdict; it is not conflated with the failure case in FR-011.
- **FR-005**: The recorded explanation for a fallback selection (FR-004) MUST plainly say the pick was a default among equivalent options — it MUST NOT present a fallback pick with the same confident phrasing as a clearly-reasoned choice.
- **FR-006**: Selecting a direction MUST occur as its own single step within the app's existing one-stage-per-step execution model — a user stepping through a run one stage at a time advances through selection as its own step, and letting a run advance automatically still advances exactly one stage's worth of work per underlying step.
- **FR-007**: The selection MUST appear in a run's inspectable history in its correct position — after the directions it judged, before the recipe drafted from it.
- **FR-008**: A user MUST be able to view a completed selection (chosen direction + explanation) the same way they can view any other stage's recorded output.
- **FR-009**: A user MUST be able to edit a recorded selection and continue the run from that edit; the recipe is then drafted from the edited selection without the automatic judgment being re-run.
- **FR-010**: A user MUST be able to edit the candidate directions themselves and continue the run from that edit; selection then runs again against the edited candidates.
- **FR-011**: If the selection step technically fails to produce any result at all (e.g. a transient model or generation error — distinct from the model honestly reporting no clear favorite, FR-004), the run MUST enter the same failure/retry state already used for every other stage — no bespoke failure handling for this step.
- **FR-012**: The system MUST NOT change how many candidate directions are proposed (2-3, unchanged).
- **FR-013**: The system MUST NOT provide any control for a person to directly pick a direction — selection is fully automatic, matching how critique's blocking/feasibility judgment is already fully automatic.
- **FR-014**: A run whose directions were proposed before this feature existed (no recorded selection yet) MUST be treated the same as the no-clear-winner case (FR-004) — it MUST NOT be unable to continue.
- **FR-015**: If an edit leaves exactly 1 candidate direction, selection MUST trivially select it (with an explanation that says only one candidate was available) rather than requiring a judgment among options. If an edit would leave 0 candidate directions, that edit MUST be rejected the same way any edit that would leave a run unable to proceed already is — no new count-based validation rule is introduced beyond that.

### Key Entities

- **Direction Selection**: The outcome of judging the proposed candidate directions for one run — which candidate was chosen, why, and whether that choice was a clear favorite or a default among equivalent options (FR-003). Always produced (judging is a normal step that always completes and always records a verdict, distinct from a technical failure, FR-004/FR-011). Produced once selection runs, and again whenever the run is continued from an edit to either the candidates or the selection itself. Sits between the proposed directions and the drafted recipe in a run's history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of completed runs have a finished recipe that corresponds to exactly one of that run's proposed directions, with that direction and the reason it was used visible to anyone inspecting the run.
- **SC-002**: When no direction is a clear standout, the run still completes end to end (0% failure/stall rate attributable to selection), consistently picking the same first-listed candidate for the same inputs.
- **SC-003**: A user reviewing a run's history can correctly identify which of the 2-3 proposed directions was actually used, and get a plain-language reason why, without reading the finished recipe itself.
- **SC-004**: Editing a recorded selection and continuing the run changes the finished recipe to match the edited direction 100% of the time — the same reliability as editing any other stage's output today.
- **SC-005**: A full run now takes exactly one more inspectable step than before this feature, and that count is identical whether the user advances one stage at a time or lets the run advance automatically.

## Assumptions

- Selection is inserted between the existing "propose directions" and "draft recipe" stages, immediately after candidates are produced and before drafting begins — as described in the request; not an open design question.
- The explanation recorded for a selection is a short, plain-language note (comparable in scope to the "why it fits" note already recorded for each candidate direction) — not a multi-part structured breakdown.
- The automatic judgment reuses the same general-purpose judgment capability already used for the "propose directions" step, rather than the stronger capability reserved for the later, deeper critique of a finished draft — selection is judging which idea to pursue, not critiquing a finished piece of work.
- No migration step is needed for runs already in progress when this feature ships: FR-014's fallback rule (treat "no selection recorded yet" the same as "no clear winner") covers that case without any separate handling.
- The existing rule that editing one stage's output re-enters the run at whichever stage actually consumes that field (already true for every other editable field today) extends naturally to the two fields this feature adds: editing the candidate directions re-enters at selection (since selection is now what consumes them), and editing the selection re-enters at drafting.

## Dependencies

- The existing "propose directions" and "draft recipe" stages, and the existing critique/verdict mechanism this feature's shape mirrors.
- The existing run-history/timeline, edit-and-continue ("fork"), and step-by-step/auto-run mechanisms — this feature adds one more stage to each, it doesn't change how any of them work.

## Out of Scope

- Any UI letting a person directly choose between the proposed directions — selection stays fully automatic (FR-013).
- Changing how many candidate directions are proposed.
- A migration or backfill process for runs created before this feature ships (see Assumptions).
