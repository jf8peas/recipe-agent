# Feature Specification: Recipe Agent

**Feature Directory**: `specs/001-recipe-agent`
**Created**: 2026-09-02
**Status**: Draft
**Input**: User description: "Generate the functional specification for the Recipe Agent application: a web app that turns a list of ingredients into a complete recipe through a multi-stage automated assistant, with full time-travel over the assistant's state history (inspect, branch, edit via forms, replay from any point)."

## Overview

Recipe Agent helps a home cook turn "here is what I have" into a finished,
usable recipe. Instead of producing one opaque answer, the assistant works in
visible stages. After every stage it pauses so the user can read the result,
and it keeps every intermediate result as a saved state. The user can return to
any saved state, change what the assistant decided, and have it continue from
that changed point on a new branch — leaving the original path intact for
comparison or reuse.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a recipe from ingredients, stage by stage (Priority: P1)

A home cook enters the ingredients they have on hand plus any constraints
(cuisine, time limit, servings, diet). The assistant runs its first stage
automatically, then the cook advances it one stage at a time — normalizing
ingredients, proposing dish directions, drafting the recipe, critiquing it,
refining it, and finalizing it — reviewing each result before continuing.

**Why this priority**: This is the core value of the product. Every other story
operates on the saved states this flow produces; if this does not work, nothing
else matters.

**Independent Test**: Enter a valid ingredient list, advance through all stages,
and confirm a finalized recipe — scaled to the requested servings, formatted for
reading, with rough nutrition estimates — is produced and saved.

**Acceptance Scenarios**:

1. **Given** no active session, **When** the user enters ingredients and starts,
   **Then** a session is created, its identifier appears in the page URL, and the
   first stage's output (normalized ingredients with pantry staples flagged) is
   shown.
2. **Given** a session paused after a stage, **When** the user triggers
   "Step/Play", **Then** exactly one further stage runs and its output is shown
   and saved.
3. **Given** a drafted recipe has been critiqued, **When** the user advances,
   **Then** a refined draft is produced and the critique runs again, repeating up
   to the maximum number of refine cycles.
4. **Given** the refine cycles are exhausted or the critique raises no blocking
   issues, **When** the user advances, **Then** a finalized recipe scaled to the
   requested servings, formatted, and annotated with rough nutrition estimates is
   produced.
5. **Given** the finalize stage has completed for the current branch, **When**
   the user looks for "Step/Play", **Then** it is no longer offered for that
   branch.
6. **Given** the user supplied constraints (for example a 30-minute limit and
   "vegetarian"), **When** directions and the draft are produced, **Then** they
   respect those constraints or explicitly flag that a constraint cannot be met.

---

### User Story 2 - Inspect the history of a session (Priority: P2)

The user reviews how the recipe evolved by browsing a timeline of every saved
state on the left of the screen and opening any of them in the center panel.

**Why this priority**: Visibility into the assistant's history is the
precondition for time-travel, and it delivers value on its own — the user can
understand why the assistant made each choice — even before any editing.

**Independent Test**: After a run, open the timeline, confirm every stage is
listed with its name and time, select an earlier entry, and confirm its full
state loads unchanged.

**Acceptance Scenarios**:

1. **Given** a session with several completed stages, **When** the user views the
   timeline, **Then** every saved state is listed in order with the stage that
   produced it and its creation time.
2. **Given** the timeline is shown, **When** the user selects an earlier saved
   state, **Then** the center panel loads that state's contents exactly as they
   were when created.
3. **Given** a saved state that has two or more children, **When** the user views
   the timeline, **Then** the fork is drawn as diverging branches.
4. **Given** a saved state that is unknown or no longer exists, **When** the user
   tries to open it, **Then** a clear message is shown rather than a silent
   failure.

---

### User Story 3 - Edit a past state and replay from it (Priority: P3)

The user changes a decision the assistant made — swaps an ingredient, tightens a
constraint, rewrites a step — then has the assistant continue from that changed
point on a new branch, leaving the original branch untouched.

**Why this priority**: This is the product's differentiating capability. It
depends on Stories 1 and 2 already being in place.

**Independent Test**: Select a mid-run saved state, edit a field through its
form, fork, replay one stage, and confirm the new stage's output reflects the
edit while the original branch is unchanged.

**Acceptance Scenarios**:

1. **Given** a selected saved state, **When** the user edits a field and chooses
   "Edit & Fork", **Then** a new child saved state containing the edit is created
   and selected, and the original saved state and its branch are unchanged.
2. **Given** a freshly forked saved state, **When** the user chooses "Play from
   here", **Then** the next stage runs using the forked state as its input and
   its output reflects the edit.
3. **Given** edits that do not match the expected structure of a field, **When**
   the user chooses "Edit & Fork", **Then** the fork is blocked and the offending
   field is named.
4. **Given** more than one branch exists, **When** the user switches between
   them, **Then** each branch can be stepped forward independently without
   affecting the others.
5. **Given** the user forks without changing any field, **When** they confirm,
   **Then** a new branch is created with content identical to its parent.

---

### User Story 4 - Resume a session later (Priority: P4)

The user closes the browser mid-recipe (to shop or prep) and comes back hours or
days later — through the session URL or a list of sessions remembered on their
device — to find the session exactly as they left it.

**Why this priority**: Real recipe building spans interruptions. Persistence
makes the tool usable in practice, but Stories 1–3 can be demonstrated without
it.

**Independent Test**: Start and step a session on one device, open its URL on a
second device, and confirm the full timeline and last-selected state load.

**Acceptance Scenarios**:

1. **Given** a session started and stepped earlier, **When** the user opens its
   URL again, **Then** the full timeline and the previously selected saved state
   load.
2. **Given** the user returns to a device where they previously started sessions,
   **When** they open the app, **Then** their prior sessions are listed and each
   opens to its saved timeline.
3. **Given** the on-device session list has been cleared, **When** the user opens
   a known session URL, **Then** the session still loads with its full history.

---

### Edge Cases

- **Empty ingredient list**: starting is blocked with a prompt to enter at least
  one ingredient.
- **Very sparse input (one or two ingredients)**: the workflow still runs;
  directions may note that the ingredients are insufficient for a full dish and
  suggest additions.
- **Unrecognizable or non-food entries**: flagged during the parse stage and
  surfaced to the user rather than silently used.
- **Very large ingredient list**: accepted up to a reasonable cap; beyond the cap
  the user is asked to trim the list.
- **Constraints that cannot be satisfied** (for example "vegan" with only animal
  products): the directions and critique stages surface the conflict instead of
  inventing ingredients.
- **Deeply nested branches** (a fork of a fork of a fork): the timeline stays
  readable and scrollable.
- **Two browser tabs stepping the same branch at once**: the second action is
  either serialized or rejected with a "state has moved on" message; no
  conflicting saved state is created.
- **Refine cycles exhausted while the critique still objects**: the workflow
  proceeds to finalize, carrying the unresolved critique notes forward.
- **Interruption during a stage**: the stage either completes and is saved or is
  not saved at all; no partial saved state is left behind.
- **Editing a field to an empty or nonsensical value**: rejected at fork time
  with the field named.

## Requirements *(mandatory)*

### Functional Requirements

#### Session lifecycle

- **FR-001**: The system MUST let a user start a session by entering a list of
  ingredients.
- **FR-002**: The system MUST let a user optionally provide constraints: cuisine,
  maximum preparation time, number of servings, and dietary restrictions.
- **FR-003**: On starting a session, the system MUST create a unique session
  identifier, place it in the page URL, and record it in the browser's on-device
  session list.
- **FR-004**: The system MUST let a user return to a session by opening its URL
  or by selecting it from the on-device session list.
- **FR-005**: The system MUST run the first workflow stage automatically when a
  session starts.

#### Stage-by-stage execution

- **FR-006**: The system MUST advance the workflow by exactly one stage each time
  the user triggers "Step/Play".
- **FR-007**: The system MUST pause after every stage and wait for a user action
  before continuing.
- **FR-008**: After each stage, the system MUST persist the resulting state as a
  new, immutable saved state associated with the session.
- **FR-009**: The system MUST show which stages have completed and which stage
  will run next.
- **FR-010**: The system MUST stop offering "Step/Play" for a branch once its
  finalize stage has completed.

#### Workflow stages and their outputs

- **FR-011**: The **parse ingredients** stage MUST produce normalized ingredient
  names and quantities, with common pantry staples flagged.
- **FR-012**: The **propose directions** stage MUST produce 2–3 candidate dish
  directions consistent with the ingredients and constraints.
- **FR-013**: The **draft recipe** stage MUST produce a full recipe: ordered
  steps, timings, techniques, and a list of items the user still needs to buy.
- **FR-014**: The **critique** stage MUST produce an assessment covering
  feasibility, flavor balance, and missing or unclear steps.
- **FR-015**: The **refine** stage MUST produce a revised recipe draft addressing
  the critique, after which the critique stage MUST run again; this refine →
  critique loop MUST repeat no more than a configured maximum number of cycles.
- **FR-016**: The **finalize** stage MUST produce the recipe scaled to the
  requested servings, formatted for reading, with rough nutrition estimates that
  are labeled as approximate.

#### History and tree view

- **FR-017**: The system MUST display, on the left of the screen, a vertical
  timeline of all saved states for the current session.
- **FR-018**: Each timeline entry MUST show the stage (or "user edit") that
  produced it and the time it was created.
- **FR-019**: The timeline MUST represent branches visually: where a saved state
  has more than one child, the divergence MUST be shown as separate branch lines.
- **FR-020**: The system MUST let the user select any saved state in the
  timeline.

#### Inspect and edit

- **FR-021**: Selecting a saved state MUST load its full contents into the center
  panel.
- **FR-022**: The center panel MUST present each state field (ingredients,
  constraints, directions, recipe draft, critiques, final recipe) as structured
  form controls suited to that field, not as raw text or markup.
- **FR-023**: The system MUST let the user modify any editable field.
- **FR-024**: The system MUST validate edited values against the expected
  structure for their field and MUST block a fork when edits are invalid,
  explaining what is wrong.
- **FR-025**: Editing a field MUST replace that field's value; the system MUST
  NOT append to or merge with the previous value.

#### Fork and replay

- **FR-026**: "Edit & Fork" MUST create a new saved state that is a child of the
  selected state and contains the user's edits, without altering the selected
  state or any existing branch.
- **FR-027**: After a fork, the timeline MUST show the new branch and select it.
- **FR-028**: "Play from here" MUST resume the workflow from the selected saved
  state, running the next stage along that branch and producing a new saved
  state.
- **FR-029**: Stages that run after a fork MUST take the forked state as input,
  so their outputs reflect the user's edits.
- **FR-030**: The user MUST be able to switch between branches and continue
  stepping each one independently.

#### Persistence and recovery

- **FR-031**: All saved states and their parent–child relationships MUST persist
  across browser restarts and remain retrievable at least 30 days after last use.
- **FR-032**: If the on-device session list is cleared, sessions MUST still be
  reachable by their URL.
- **FR-033**: If a user references a saved state that no longer exists, the
  system MUST show a clear message rather than failing silently.

### Key Entities

- **Session**: one recipe-building attempt. Attributes: identifier, creation
  time, the ingredients and constraints it was started with. Has many saved
  states.
- **Saved State**: an immutable snapshot of the workflow state, created either by
  a completed stage or by a user edit. Attributes: identifier, parent identifier
  (absent for the root), origin (which stage, or "user edit"), creation time, and
  the six content fields below. Belongs to one session.
- **Branch**: a path of saved states from the root; a new branch begins whenever
  a saved state gains a second child.
- **Workflow Stage**: one of parse ingredients, propose directions, draft recipe,
  critique, refine, finalize.
- **Constraints**: cuisine, maximum preparation time, servings, dietary
  restrictions.
- **Recipe State fields**: `ingredients`, `constraints`, `directions`,
  `recipeDraft`, `critiques`, `finalRecipe`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user starting from a valid ingredient list can reach a finalized
  recipe in no more than 6 stage advances on the default (no-fork) path.
- **SC-002**: The output of the first stage appears within 30 seconds of starting
  a session.
- **SC-003**: At least 90% of first-time users produce a finalized recipe without
  external help.
- **SC-004**: Any completed stage's output can be re-opened later and is
  identical to when it was created.
- **SC-005**: After a user edits a field and replays, 100% of downstream stage
  outputs reflect the edited value, with no carry-over of the old value.
- **SC-006**: For any session, the number of end-of-branch entries shown in the
  timeline equals the number of distinct branches the user created.
- **SC-007**: Sessions and their full history remain retrievable at least 30 days
  after last use.
- **SC-008**: A user can locate and switch to any prior saved state in under 10
  seconds using the timeline.
- **SC-009**: Invalid edits are rejected before a fork is created in 100% of
  cases, with a message that names the offending field.
- **SC-010**: Opening a session by URL on a different device restores the exact
  timeline and the previously selected saved state.

## Assumptions

- Ingredients are entered as free text, one per line or comma-separated;
  quantities are optional.
- The maximum number of refine → critique cycles defaults to 2.
- "Play from here" advances exactly one stage per activation; this version has no
  run-to-completion control.
- Every edit produces a fork; saved states are never changed in place, and there
  is no in-place edit of the latest state.
- Sessions are unlisted but accessible to anyone holding the URL. This version
  has no accounts, ownership, or access control.
- The on-device session list holds only identifiers and labels for sessions
  started on that device, not the saved-state data itself.
- Nutrition figures are approximate estimates, clearly labeled as such, not
  certified values.
- Constraint inputs: cuisine (free text or pick list), maximum preparation time
  (minutes), servings (positive integer), dietary restrictions (multi-select of
  common diets plus free text).
- A session accepts up to 50 ingredients; beyond that the user is asked to trim.
- The interface language is English for this version.

## Dependencies

- An external language-model service capable of performing each stage's
  reasoning.
- A persistent datastore for saved states and their parent–child relationships.
- The browser's on-device storage for the per-device session list.

## Out of Scope

- User accounts, sign-in, and per-user recipe libraries.
- Side-by-side comparison of two branches.
- Exporting or sharing recipes in external formats (PDF, print, email).
- Editing the workflow itself (adding, removing, or reordering stages) from the
  interface.
- Real-time collaborative editing of a session by multiple users.
- Image input or photo recognition of ingredients.
- Grocery ordering, inventory tracking, or price lookups.
- Native mobile applications.
