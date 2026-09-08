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

## Clarifications

### Session 2026-09-02

- Q: When a workflow stage fails to complete (model error, timeout, or output
  that does not match the expected structure), how does the system behave? → A:
  The failure is recorded as a distinct, non-terminal "stage-failure" saved
  state; the user can retry the stage from it, or edit and fork from it. It is
  visually distinct from both a normal end and the ingredient error outcome.
- Q: Can users delete their data, and is there a maximum retention period? → A:
  A user can delete an entire session (all branches and history); no per-branch
  or per-state deletion in this version. The operator may purge sessions that
  have been inactive for a configured period (default ~90 days), with the same
  effect as a user deletion.
- Q: When two actions target the same branch tip at once, what happens? → A:
  With the device-private model (see below) a session is reachable from only one
  browser, so the only remaining case is two tabs of that browser. The app holds
  an in-flight lock shared across tabs and disables the advance controls while a
  stage runs, so the user cannot trigger a concurrent advance. No server-side
  optimistic-concurrency layer or database uniqueness constraint is required; a
  rare race that still produced an extra branch would be harmless and deletable.
- Q: How strong must the access credential be? → A: The browser-held client
  identifier (the credential in the device-private model) MUST be an unguessable
  high-entropy value (at least ~128 bits), generated once per browser. The
  per-session identifier is not security-critical — it is random only to avoid
  collisions and log reuse. No enumeration endpoint exists.
- Q: What abuse protection should v1 have for the unauthenticated,
  model-backed endpoint? → A: A per-client rate limit (short-window request rate
  plus a rolling daily ceiling on stage executions) and a global daily cap on
  stage executions, all operator-configured. Over-limit actions are refused with
  a "try again later" message; no saved state is lost or created.
- Q: How should the system behave when the model provider's own spend cap on the
  project account/key is reached? → A: Handle it exactly like the internal global
  cap — a specific "service temporarily unavailable due to a usage limit"
  message, nothing lost or created, no stage-failure entry, Auto-run stops, and
  the user can resume once the cap is raised or resets. (Volunteered by the
  product owner during this session.)
- Q: Is a session a shareable capability link, or private to the browser that
  created it? → A: **Device-private.** A session is owned by the browser-held
  client identifier that created it and is reachable only from that browser.
  There is no link sharing and no cross-device access. The session identifier
  never appears in the URL — navigation between the session list and a session is
  client-side only — so there is nothing to copy or share. (This reverses an
  earlier lean toward a shareable capability link; chosen to remove the
  cross-device concurrency problem and its server-side machinery.)
- Q: What happens if the browser loses its stored data? → A: Clearing the
  session list alone is recoverable — the app can re-list the sessions owned by
  the surviving client identifier. Losing the client identifier itself (cleared
  site data, a different browser) makes those sessions unreachable; they stay in
  the datastore until the operator's inactivity purge (FR-057).
- Q: Can the user cancel a stage that is running, and what happens to it? → A:
  Yes — a Cancel control is available while a stage runs. Cancelling stops
  waiting on the model, discards any in-flight result, writes no saved state, and
  leaves the branch at the pre-stage tip. The upstream model request is aborted
  where the provider supports it, to limit spend. In Auto-run, cancelling also
  stops auto-advancing.
- Q: What does the system show while a stage is running? → A: An indeterminate
  progress indicator, an elapsed-time counter, the name of the stage in progress,
  and the Cancel control. The model's partial output is not streamed.
- Q: Is there a per-session cap, and on what? → A: An operator-configured maximum
  number of stage executions per session. At the cap the session becomes
  read-only — the user can still inspect any saved state, delete the session, or
  start a new one, but cannot run further stages or fork. Auto-run stops at the
  cap.
- Q: What happens when a stage's result is produced but persisting it fails? →
  A: Auto-retry the save a few times; on continued failure, keep the result in
  memory and offer a "retry save" action with an "unsaved" indicator. The stage
  is not re-run and the user is not re-billed. Leaving before the save succeeds
  loses the result and the branch stays at the pre-stage tip. Auto-run stops
  until the result is saved.
- Q: What accessibility standard should v1 meet? → A: WCAG 2.2 Level AA —
  keyboard-operable throughout with visible focus, programmatically labelled
  controls, status and error changes announced to assistive technology, and AA
  contrast. The timeline must convey each entry's kind by text/ARIA, not by
  color or shape alone.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a recipe from ingredients, stage by stage (Priority: P1)

A home cook enters the ingredients they have on hand plus any constraints
(cuisine, time limit, servings, diet). The assistant runs its first stage
automatically, then the cook advances it — normalizing ingredients, proposing
dish directions, drafting the recipe, critiquing it, refining it, and finalizing
it. By default the workflow pauses after each stage so the cook can review it
("Step" mode); the cook can instead turn that pause off and let the stages run
through automatically ("Auto-run" mode), stopping when the recipe is finalized or
when they hit Pause.

**Why this priority**: This is the core value of the product. Every other story
operates on the saved states this flow produces; if this does not work, nothing
else matters.

**Independent Test**: Enter a valid ingredient list, advance through all stages,
and confirm a finalized recipe — scaled to the requested servings, formatted for
reading, with rough nutrition estimates — is produced and saved.

**Acceptance Scenarios**:

1. **Given** no active session, **When** the user enters a valid ingredient list
   and starts, **Then** a session is created and becomes the active session (with
   no session identifier placed in the URL), and the first stage's output
   (normalized ingredients with pantry staples flagged, each ingredient marked
   usable) is shown.
1a. **Given** the ingredient box is empty or holds more than the configured
   maximum number of ingredients, **When** the user tries to start, **Then** no
   session is created and the user is prompted to enter at least one ingredient
   or to reduce the count.
1b. **Given** a started session whose first stage finds one or more entries that
   are not usable ingredients, **When** that stage completes, **Then** the
   workflow ends in an error outcome, no dish directions or recipe are produced,
   and the rejected entries are named in the saved state.
1c. **Given** a session that ended in the ingredient error outcome, **When** the
   user edits the ingredients on that saved state and forks and replays, **Then**
   the first stage runs again and, if every ingredient is now usable, the
   workflow continues to the next stage.
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
7. **Given** "pause between stages" is switched off, **When** the user starts a
   session or chooses "Play from here", **Then** the workflow advances through
   consecutive stages on its own, saving a result after each, and stops on its
   own when the branch reaches finalize, a stage fails, or the user activates
   "Pause".
8. **Given** the workflow is advancing automatically, **When** the user activates
   "Pause", **Then** it stops after the stage currently running and returns
   control to the user.

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

### User Story 4 - Resume a session later, same browser (Priority: P4)

The user closes the browser mid-recipe (to shop or prep) and comes back hours or
days later **on the same browser** to find their sessions exactly as they left
them, listed and ready to reopen.

**Why this priority**: Real recipe building spans interruptions. Persistence
makes the tool usable in practice, but Stories 1–3 can be demonstrated without
it.

**Independent Test**: Start and step a session, fully close the browser, reopen
the app in the same browser, and confirm the session is listed and reopens to its
full timeline and last-selected state.

**Acceptance Scenarios**:

1. **Given** the user returns to the browser where they previously started
   sessions, **When** they open the app, **Then** their prior sessions are listed
   and each reopens to its saved timeline and last-selected state.
2. **Given** a session started and stepped earlier, **When** the user reopens it
   from the list, **Then** the full timeline and the previously selected saved
   state load.
3. **Given** only the on-device session list was cleared (the client identifier
   survives), **When** the user opens the app, **Then** the list is rebuilt from
   the sessions owned by that client identifier.
4. **Given** the browser's client identifier is gone (site data cleared, or a
   different browser or device), **When** the user opens the app, **Then** the
   prior sessions are not accessible and the user is told so (they are not lost
   from the datastore until the inactivity purge).

---

### Edge Cases

- **Empty ingredient list**: starting is blocked before a session is created,
  with a prompt to enter at least one ingredient (FR-039).
- **Ingredient count over the configured maximum**: starting is blocked before a
  session is created, with a prompt to reduce the count that states the maximum
  (FR-040).
- **Unrecognizable or non-food entries**: the first stage marks them not usable
  and the workflow ends in the error outcome, naming each rejected entry
  (FR-042, FR-043). The user recovers by editing the ingredients on that saved
  state, forking, and replaying; replay re-enters at the parse-and-validate stage
  and re-checks the corrected list (FR-044).
- **Some ingredients usable, some not**: still an error outcome — the presence of
  any not-usable entry stops the workflow before any later stage; usable entries
  are not carried into a partial run.
- **Very sparse input (one usable ingredient)**: one usable ingredient is the
  minimum and the workflow runs; directions state that the input is insufficient
  for a full dish and suggest what to add rather than inventing ingredients. Zero
  usable ingredients cannot occur here — an empty list is blocked pre-flight
  (FR-039) and a list of only not-usable entries ends in the error outcome
  (FR-042).
- **Constraints that cannot be satisfied** (for example "vegan" with only animal
  products): the directions and critique stages surface the conflict instead of
  inventing ingredients.
- **Deeply nested branches** (a fork of a fork of a fork): the timeline stays
  readable and scrollable.
- **Two browser tabs of the owning browser open on the same session**: while a
  stage advance is in flight, the advance controls are disabled in every tab
  (shared in-flight lock), so the user cannot start a concurrent advance
  (FR-059). This is the only concurrency case, since no other browser can reach
  the session.
- **Trying to reach a session from another browser or device**: not possible —
  there is no session URL or shareable link, and without the owner client
  identifier (held only in the originating browser) the API returns "not
  available" (FR-033, FR-071).
- **Refine cycles exhausted while the critique still objects**: the workflow
  proceeds to finalize, carrying the unresolved critique notes forward.
- **Interruption during a stage** (browser or network drop): the stage either
  completes and is saved or is not saved at all; no partial saved state is left
  behind.
- **User cancels a running stage**: the model request is aborted (and propagated
  upstream where supported); no saved state is written; the branch stays at the
  pre-stage tip; the user can retry or do something else. In Auto-run, advancing
  also stops (FR-072–FR-075).
- **Stage result produced but the save fails**: the system auto-retries the save,
  then holds the result in memory with a "retry save" action and an "unsaved"
  indicator; the stage is not re-run or re-billed; leaving before it saves loses
  the result. Auto-run stops until it is saved (FR-080–FR-083).
- **Stage fails (model error, timeout, malformed output)**: a non-terminal
  "stage-failure" saved state is recorded; the user retries the stage or edits
  and forks from it (FR-050–FR-054). A successful retry adds a sibling saved
  state and the workflow continues.
- **Editing a field to an empty or nonsensical value**: rejected at fork time
  with the field named.
- **Closing the browser during Auto-run**: advancing stops; every stage that
  finished before the browser closed is already saved, and the session resumes
  from the last saved state (in Step mode) when reopened.
- **Switching to Auto-run on an already-finalized branch**: nothing runs; the
  setting simply applies to any future stepping on other branches.
- **Session deleted while open in another tab**: subsequent actions in that tab
  get the "no longer exists" message (FR-033); no error beyond that.
- **Rate limit or global cap reached mid-session**: the current action is refused
  with a "try again later" message; existing saved states are untouched; the user
  continues when the window resets (FR-061–FR-065). In Auto-run, advancing stops.
- **Model provider spend cap reached**: same graceful handling as the global cap
  — a specific "temporarily unavailable, a usage limit was reached" message,
  nothing lost or written, Auto-run stops, resume once the cap is lifted or
  resets (FR-066).
- **Session reaches its stage-execution cap**: the session becomes read-only
  (inspect and delete only); further stages and forks are refused with a "session
  limit reached — start a new session" message; Auto-run stops (FR-077, FR-078).

## Requirements *(mandatory)*

### Functional Requirements

#### Session lifecycle

- **FR-001**: The system MUST let a user start a session by entering a list of
  ingredients, subject to the pre-start checks in FR-039 and FR-040.
- **FR-002**: The system MUST let a user optionally provide constraints: cuisine,
  maximum preparation time, number of servings, and dietary restrictions.
- **FR-003**: On first use, the browser MUST obtain a **client identifier** — an
  unguessable high-entropy value (at least ~128 bits), generated once and
  persisted in browser storage. It identifies the owner of every session created
  in that browser and MUST accompany every request that reads or modifies a
  session. It is not tied to a person or account.
- **FR-003a**: On starting a session, the system MUST create a unique session
  identifier, associate it with the current client identifier as its owner, and
  record it in the browser's on-device session list. The session identifier MUST
  NOT appear in the URL or in any link; it is held only in browser storage.
- **FR-003b**: Navigation between the session list and an open session MUST be
  client-side only (no per-session route or URL). The active session identifier
  is held in browser storage so the same session is restored on reload.
- **FR-004**: The system MUST let a user return to a session by selecting it from
  the on-device session list. There are no session URLs to open.
- **FR-005**: The system MUST run the first workflow stage (parse and validate
  ingredients) automatically when a session starts.
- **FR-060**: The system MUST NOT provide any way to enumerate sessions. The only
  listing available is "sessions owned by the requesting client identifier",
  scoped to the caller; there is no cross-owner or global session view or search.
- **FR-067**: The server MUST scope every read and write to a single session
  identified in the request, MUST verify that the requesting client identifier
  owns that session, and MUST NOT return or modify any state belonging to another
  session or owner. All persisted data is partitioned by session identifier and
  owner.
- **FR-068**: Access to a session MUST require the owner client identifier from
  the requesting browser's storage. Presenting only the session identifier (which
  is never exposed in a URL anyway) MUST NOT grant any access.

#### Ingredient validation and error outcomes

- **FR-039**: Before creating a session, the system MUST reject a start request
  that has zero ingredients, and MUST prompt the user to enter at least one.
- **FR-040**: Before creating a session, the system MUST reject a start request
  whose ingredient count exceeds a maximum set by the operator (not hard-coded),
  and MUST prompt the user to reduce the count. The message MUST state the
  maximum.
- **FR-041**: The first workflow stage MUST classify each supplied ingredient as
  usable or not usable (e.g. not a food item, unintelligible, or a duplicate that
  cannot be resolved), and MUST record that classification in the saved state.
- **FR-042**: If the first stage finds one or more not-usable ingredients, the
  workflow MUST end in an error outcome for that branch: no later stage runs, and
  no dish directions, recipe draft, critique, or final recipe are produced.
- **FR-043**: An error outcome MUST be recorded as a saved state, distinguishable
  in the timeline from a normal end, and MUST name every rejected ingredient and
  the reason it was rejected.
- **FR-044**: From an error-outcome saved state, the user MUST be able to edit the
  ingredients, fork, and replay. Replay MUST resume at the parse-and-validate
  stage (the error outcome has no later state to resume from), re-running the
  classification on the corrected list; if every ingredient is now usable, the
  workflow MUST continue normally along the new branch.
- **FR-044a**: The configured-maximum check (FR-040) MUST also apply when a user
  edits the ingredient list and forks; a fork that would exceed the maximum MUST
  be blocked with the same prompt.
- **FR-045**: The system MUST stop advancing a branch once it has reached the
  ingredient error outcome, in either mode (mirrors FR-010 for the finalize end).

#### Stage-failure handling

A **stage-failure** saved state is reserved for a stage that actually ran and
could not produce a valid result — a model/service error, a timeout, or output
that fails structural validation. It is NEVER written for a user cancel (FR-074),
a rate/spend/session limit (FR-064), or a save failure after a valid result
(FR-082); those are handled without any saved state.

- **FR-050**: If a workflow stage fails to complete — for example the language
  model errors or times out, or returns output that does not match the expected
  structure — the system MUST record a distinct "stage-failure" saved state as a
  child of the saved state the stage ran from, capturing the failure reason. No
  partial recipe content is written.
- **FR-051**: A stage-failure saved state is non-terminal. From it, the user MUST
  be able to: retry (re-run the same stage from the parent saved state), or edit
  fields and fork, or navigate to other branches.
- **FR-052**: A successful retry from a stage-failure saved state MUST produce a
  new saved state that is a sibling of the failure (a child of the same parent)
  and MUST let the workflow continue normally from there. The stage-failure saved
  state remains in history as a dead-end entry.
- **FR-053**: The three end-of-line entry kinds — a successful finalize end, the
  ingredient error outcome, and a stage-failure — MUST be mutually
  distinguishable at a glance in the timeline (over and above merely being
  labelled per FR-018), so a user scanning history can tell a recoverable failure
  from a finished recipe without opening the entry.
- **FR-054**: In Auto-run mode, a stage failure MUST stop advancing at the
  stage-failure saved state and return control to the user (this is the "a stage
  fails" condition in FR-035).

#### Stage-by-stage execution

- **FR-006**: In Step mode, the system MUST advance the workflow by exactly one
  stage each time the user triggers "Step/Play".
- **FR-007**: In Step mode, the system MUST pause after every stage — after the
  stage's state is saved and the next stage has been determined, before that next
  stage runs — and wait for a user action before continuing.
- **FR-008**: After each stage, in either mode, the system MUST persist the
  resulting state as a new, immutable saved state associated with the session
  (save-failure handling: FR-080–FR-083).
- **FR-009**: The system MUST show which stages have completed and which stage
  will run next.
- **FR-009a**: While a stage is running, the system MUST display an indeterminate
  progress indicator, an elapsed-time counter, the name of the stage in progress,
  and the Cancel control (FR-072). The system MUST NOT stream the model's partial
  output.
- **FR-010**: The system MUST stop advancing a branch once its finalize stage has
  completed, in either mode.
- **FR-072**: While a stage is running, the system MUST offer a Cancel control.
  Cancelling MUST stop waiting on the model, discard any in-flight result, write
  no saved state, and leave the branch at the pre-stage tip.
- **FR-073**: On cancel, the system MUST abort the upstream model request where
  the model provider supports request cancellation, to limit spend; where it does
  not, the pending request is abandoned locally.
- **FR-074**: A cancelled stage MUST NOT be recorded as a stage-failure saved
  state (FR-050) — nothing is written — and the user MAY immediately retry the
  stage or take another action.
- **FR-075**: In Auto-run mode, cancelling the running stage MUST also stop
  auto-advancing and return control to the user, the same as Pause.
- **FR-080**: If a stage's result is produced but persisting the resulting saved
  state fails, the system MUST automatically retry the save a small number of
  times. If it still fails, the system MUST keep the result in memory and offer a
  "retry save" action. The stage MUST NOT be re-run and the user MUST NOT be
  re-billed to recover from a save failure.
- **FR-081**: While a stage result is held unsaved, the system MUST clearly
  indicate it is not yet saved. If the user navigates away or closes the browser
  before the save succeeds, the result is lost and the branch remains at the
  pre-stage tip.
- **FR-082**: A save failure MUST NOT be recorded as a stage-failure saved state,
  and the underlying stage execution counts once (toward the per-session and
  per-client limits); save retries do not add to that count.
- **FR-083**: In Auto-run mode, a save failure MUST stop auto-advancing;
  advancing MAY resume only after the pending result is saved.

#### Execution mode (Step vs Auto-run)

- **FR-034**: The system MUST provide a "pause between stages" setting (Step
  mode), on by default. When on, the workflow stops after every stage for review
  (FR-007). When off (Auto-run mode), the system advances from one stage to the
  next without waiting for a user action.
- **FR-035**: In Auto-run mode, the system MUST stop advancing and return control
  to the user when any of these occurs: the branch reaches the end of its
  finalize stage; the branch reaches the ingredient error outcome; a stage fails
  (FR-054); the user cancels the running stage (FR-075); a stage result cannot be
  saved (FR-083); a per-client, global, provider, or per-session limit is reached
  (FR-065); or the user activates "Pause".
- **FR-036**: The system MUST let the user change the "pause between stages"
  setting at any time, including while the workflow is advancing. A change takes
  effect after the stage currently running completes.
- **FR-037**: In Auto-run mode, the system MUST persist a saved state after every
  stage, exactly as in Step mode (auto-advancing MUST NOT skip or batch saved
  states).
- **FR-038**: Auto-run MUST advance one stage at a time from the client's
  perspective; the system MUST NOT run an uninterrupted multi-stage sequence as a
  single unit of work.

#### Workflow stages and their outputs

- **FR-011**: The **parse and validate ingredients** stage MUST produce
  normalized ingredient names and quantities, with common pantry staples flagged
  and each ingredient classified as usable or not usable (FR-041). After this
  stage the workflow either continues to propose directions (all usable) or ends
  in the error outcome (any not usable, FR-042).
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

#### Abuse protection and spend limits

- **FR-061**: The system MUST apply a per-client rate limit to session creation
  and to stage-advance actions: a short-window request rate and a rolling
  24-hour ceiling on stage executions. The thresholds are operator-configured.
- **FR-062**: The system MUST enforce a global (all-clients) 24-hour cap on total
  stage executions, operator-configured, as a budget backstop.
- **FR-063**: When a per-client limit or the global cap is reached, the system
  MUST refuse the action with a clear "try again later" message, MUST NOT lose or
  alter any existing saved state, and MUST allow the user to resume once the
  relevant window resets.
- **FR-064**: A refusal due to a rate limit, the global cap, or a provider spend
  cap (FR-066) MUST NOT be recorded as a stage-failure saved state (FR-050) —
  nothing is written.
- **FR-065**: In Auto-run mode, hitting a per-client limit, the global cap, a
  provider spend cap, or the per-session cap (FR-077) MUST stop advancing and
  return control to the user, the same as a Pause.
- **FR-077**: The system MUST enforce an operator-configured maximum number of
  stage executions per session. When a session reaches that cap it becomes
  read-only: the user MAY inspect any saved state, delete the session, or start a
  new session, but MUST NOT run further stages (Step/Play, Play from here, retry)
  or fork.
- **FR-078**: When a stage-advance or fork action is refused because the session
  cap is reached, the message MUST state that the session has reached its limit
  and suggest starting a new session. No saved state is created.
- **FR-066**: When the model provider rejects requests because a spending or
  quota cap on the project's account or key has been reached, the system MUST
  treat it the same as the global cap (FR-063–FR-065): a clear message stating
  the service is temporarily unavailable because a usage limit was reached, every
  existing saved state preserved, no new saved state written, and resumption
  allowed once the cap is raised or its billing window resets. The message MUST
  distinguish this "usage limit" condition from a stage failure.

#### Page header

- **FR-046**: The system MUST display a persistent header at the top of every
  screen containing two links: an **author** link to the author's professional
  profile page, and a **feedback** link to the project's public issue tracker.
- **FR-047**: Both header links MUST open in a new browser tab or window and MUST
  NOT interrupt or discard an in-progress session.
- **FR-048**: The feedback link MUST point to the issue log for this project's
  source repository: `https://github.com/jf8peas/recipe-agent/issues`.
- **FR-049**: The author link MUST point to the author's LinkedIn profile:
  `https://www.linkedin.com/in/john-fong-04b7a120/`.

#### Accessibility

- **FR-084**: The interface MUST target WCAG 2.2 Level AA. In particular: all
  functionality is keyboard-operable with a visible focus indicator; every form
  control has a programmatic label; status changes (stage running, stage
  complete, errors, limit reached, unsaved result) are announced to assistive
  technology; and text and UI contrast meet AA thresholds.
- **FR-085**: The branch timeline MUST be keyboard-navigable and MUST expose each
  entry's stage, time, and kind (in-progress, normal end, ingredient error
  outcome, stage-failure) to assistive technology as text — not by color or shape
  alone.

#### History and tree view

- **FR-017**: The system MUST display, on the left of the screen, a vertical
  timeline of all saved states for the current session.
- **FR-018**: Each timeline entry MUST show the stage (or "user edit") that
  produced it and the time it was created, and MUST mark its kind: in-progress
  point, normal end (finalize), ingredient error outcome, or stage-failure.
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
- **FR-025a**: A fork whose patch targets a channel that is not user-editable —
  internal loop/outcome state such as the refine counter, the outcome marker, or
  the failure reason — MUST be rejected the same way as a structurally invalid
  edit (FR-024), naming the offending field. Only the six Recipe State fields are
  editable.

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
- **FR-059**: While a stage advance ("Step/Play", "Play from here", or retry) is
  in flight for a session, the system MUST prevent the user from starting another
  advance on that session from any tab of the same browser — for example by
  disabling the advance controls across tabs via a shared in-flight lock. The
  system is NOT required to provide server-side protection against concurrent
  advances, because a session is reachable from only one browser (FR-071). A rare
  race that still produces an extra branch is acceptable and the user can delete
  it. "Edit & Fork" (FR-026) is exempt.

#### Persistence and recovery

- **FR-031**: All saved states and their parent–child relationships MUST persist
  across browser restarts and remain retrievable for at least 30 days after last
  use, subject to user deletion (FR-055), operator purge (FR-057), or loss of the
  owning browser's client identifier (which makes them unreachable but not
  immediately deleted).
- **FR-032**: If only the on-device session list is cleared but the client
  identifier survives, the system MUST be able to rebuild the list from the
  sessions owned by that client identifier. If the client identifier itself is
  lost, the affected sessions become unreachable and are removed by the
  inactivity purge (FR-057).
- **FR-033**: If a user references a session or saved state that is not available
  to them (never created, deleted, purged, or owned by a different client
  identifier), the system MUST show a clear message rather than failing silently.
- **FR-055**: The system MUST let a user delete an entire session from the owning
  browser, permanently removing it and all of its saved states and branches, and
  removing it from the on-device session list. After deletion the session MUST
  NOT be retrievable.
- **FR-056**: The system MUST NOT offer deletion of individual branches or
  individual saved states in this version.
- **FR-057**: The operator MAY purge sessions not opened or modified within a
  configured inactivity period (default about 90 days); a purge removes the
  session exactly as a user deletion does. This also reclaims sessions orphaned
  by a lost client identifier.
- **FR-058**: The delete action is available only from the owning browser, the
  same as the edit, fork, and advance actions.
- **FR-071**: A session MUST be reachable only from the browser holding its owner
  client identifier. There is no cross-browser or cross-device access and no link
  sharing in this version.

### Key Entities

- **Client Identifier**: a high-entropy unguessable value generated once per
  browser and held in that browser's storage. It names the owner of every session
  created in that browser and is required on every request. It is anonymous — not
  linked to a person, email, or account — and not portable between browsers in
  this version.
- **Session**: one recipe-building attempt. Attributes: identifier, owner (a
  client identifier), creation time, last-activity time, running count of stage
  executions, the ingredients and constraints it was started with. Has many saved
  states. Lifecycle: active → capped (read-only, once the stage-execution cap is
  reached) → deleted (by the owner) or purged (by the operator after an
  inactivity period, which also covers sessions orphaned by a lost client
  identifier); deletion and purge are permanent and identical in effect.
- **Saved State**: an immutable snapshot of the workflow state, created by a
  completed stage, a failed stage, or a user edit. Attributes: identifier, parent
  identifier (absent for the root), origin (which stage, or "user edit"), outcome
  status (in-progress, normal end, ingredient error outcome, or stage-failure),
  creation time, and the content fields below. Belongs to one session.
- **Branch**: a path of saved states from the root; a new branch begins whenever
  a saved state gains a second child. A branch terminates at a normal end
  (finalize) or the ingredient error outcome; a stage-failure entry is a dead-end
  that does not terminate the branch (a retry continues it from the parent).
- **Workflow Stage**: one of parse-and-validate ingredients, propose directions,
  draft recipe, critique, refine, finalize.
- **Ingredient Classification**: per supplied ingredient, whether it is usable,
  and if not, the reason (not a food item, unintelligible, unresolvable
  duplicate, other). Produced by the first stage and stored with `ingredients`.
- **Error Outcome**: a terminal state reached when the first stage rejects one or
  more ingredients. Carries the list of rejected ingredients and reasons; no
  recipe content is produced.
- **Constraints**: cuisine, maximum preparation time, servings, dietary
  restrictions.
- **Recipe State fields**: `ingredients` (including per-ingredient
  classification), `constraints`, `directions`, `recipeDraft`, `critiques`,
  `finalRecipe`.

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
- **SC-010**: After closing and reopening the app in the same browser, every
  previously created session is listed and each reopens to its exact saved
  timeline and last-selected state.
- **SC-011**: An Auto-run from start to finalize produces the same number of
  saved states as the same path stepped manually in Step mode.
- **SC-012**: When the user activates "Pause" during Auto-run, advancing halts
  within one stage and control returns to the user.
- **SC-013**: 100% of start attempts with zero ingredients, or with more than the
  configured maximum, are blocked before a session is created.
- **SC-014**: When any supplied ingredient is not usable, the workflow produces
  no dish directions or recipe content in 100% of cases and names every rejected
  ingredient.
- **SC-015**: After a user corrects the ingredients on an error-outcome saved
  state and replays, the workflow proceeds past the first stage whenever all
  corrected ingredients are usable.
- **SC-016**: The author link and the feedback link are present on every screen
  and each opens its intended destination (the author's profile; the project
  issue log) in a new tab without affecting the current session.
- **SC-017**: Every stage failure produces a retryable stage-failure saved state
  — no silent failure and no partial recipe content — in 100% of cases, and a
  successful retry resumes the workflow without requiring the user to re-enter
  any data.
- **SC-018**: After a user deletes a session, it and all of its branches are
  irretrievable — gone from the session list and from the `/mine` result — in
  100% of cases.
- **SC-019**: While a stage advance is in flight, the advance controls are
  disabled in every tab of the owning browser, so a user cannot trigger a
  concurrent advance on the same session.
- **SC-020**: A session created in one browser is not accessible from any other
  browser or device: there is no session URL or shareable link at all, and no
  enumeration endpoint.
- **SC-021**: Under a burst of automated requests from one client, stage
  executions for that client are capped at the configured per-client ceiling, and
  total stage executions never exceed the global daily cap.
- **SC-022**: When the model provider returns a spend- or quota-cap error, the
  user sees a specific "usage limit reached — try again later" message (not a
  generic failure), and no saved state is created or lost, in 100% of cases.
- **SC-023**: When the user cancels a running stage, no saved state is created
  for it and the branch tip is unchanged in 100% of cases; the upstream request
  is aborted whenever the provider supports cancellation.
- **SC-024**: While any stage runs, the user can see that it is working, how long
  it has been running, which stage it is, and can cancel it.
- **SC-025**: A session never runs more than the configured maximum number of
  stage executions; at the cap it is read-only and the user is told why.
- **SC-026**: A transient failure to persist a stage result never causes the
  stage to be re-run or the user to be re-billed; the result is retried and, once
  saved, the workflow continues normally.
- **SC-027**: The application passes automated WCAG 2.2 AA checks with no
  violations, and every primary flow (start, step, inspect, edit & fork, delete)
  is completable using only the keyboard with a screen reader.

## Assumptions

- Ingredients are entered as free text, one per line or comma-separated;
  quantities are optional.
- The maximum number of refine → critique cycles defaults to 2.
- The workflow runs in one of two modes, chosen by the "pause between stages"
  setting: **Step** (default) advances one stage per user action; **Auto-run**
  advances stages automatically until finalize, a failure, or "Pause". There is
  no separate run-to-completion action beyond turning Step mode off.
- "Play from here" respects the current mode: in Step mode it runs the next stage
  only; in Auto-run mode it continues automatically along that branch.
- Every edit produces a fork; saved states are never changed in place, and there
  is no in-place edit of the latest state.
- Sessions are **device-private**: a session is owned by the browser-held client
  identifier that created it and is reachable only from that browser (FR-071).
  There are no accounts; the client identifier is the sole credential and is a
  high-entropy unguessable value (FR-003). There is no link sharing and no
  cross-device access. The session identifier never appears in the URL —
  navigation between the session list and a session is client-side only (FR-003b)
  — so there is nothing to copy or share.
- The on-device session list holds identifiers and labels for the browser's own
  sessions, not the saved-state data itself. If it is cleared but the client
  identifier survives, it can be rebuilt server-side from that owner's sessions
  (FR-032). Deleting a session removes its entry.
- All database rows (sessions, saved states, branch links) are tagged with their
  session identifier and owner client identifier and are only ever queried by
  them; sessions share no data (FR-067).
- Session deletion is available only from the owning browser. The operator's
  inactivity-purge window is a configuration value, default about 90 days, and
  also reclaims sessions orphaned by a lost client identifier.
- Abuse protection thresholds — per-client request rate, per-client daily
  stage-execution ceiling, the global daily stage-execution cap, and the
  per-session stage-execution cap (default around 60) — are all operator
  configuration values. "Client" is keyed on the client identifier, with network
  address as a secondary signal to limit identifier churn.
- Nutrition figures are approximate estimates, clearly labeled as such, not
  certified values.
- Constraint inputs: cuisine (free text or pick list), maximum preparation time
  (minutes), servings (positive integer), dietary restrictions (multi-select of
  common diets plus free text).
- The maximum ingredient count is set by the operator (an environment
  configuration value), not fixed in the product; a sensible default is around
  50. Exceeding it blocks the start (FR-040).
- "Usable" ingredient means an entry the assistant can treat as a real,
  identifiable food or drink component. Not-usable covers non-food text,
  unintelligible entries, and duplicates that cannot be merged.
- The first stage is the only validation gate; later stages assume every
  ingredient reaching them is usable.
- The interface language is English for this version.
- The interface targets WCAG 2.2 Level AA (FR-084, FR-085); conformance is
  checked with automated tooling plus manual keyboard/screen-reader passes on the
  primary flows.
- The header author link points to the author's LinkedIn profile:
  `https://www.linkedin.com/in/john-fong-04b7a120/`.
- The header feedback link points to
  `https://github.com/jf8peas/recipe-agent/issues` (the repository's issue log).
  It assumes the repository's issues are publicly visible and open for new
  submissions.

## Dependencies

- An external language-model service capable of performing each stage's
  reasoning. Its availability includes its billing/quota state: a reached spend
  cap on the project's account or key surfaces to users as a usage-limit
  condition (FR-066), not an outage.
- A persistent datastore for saved states and their parent–child relationships.
- The browser's on-device storage for the client identifier and the session
  list.

## Out of Scope

- User accounts, sign-in, and per-user recipe libraries.
- Accessing a session from a second browser or device: no cross-device sync, no
  shareable links, no session identifiers in URLs, no way to move the client
  identifier between browsers.
- Side-by-side comparison of two branches.
- Exporting or sharing recipes in external formats (PDF, print, email).
- Editing the workflow itself (adding, removing, or reordering stages) from the
  interface.
- Real-time collaborative editing of a session by multiple users.
- Image input or photo recognition of ingredients.
- Grocery ordering, inventory tracking, or price lookups.
- Native mobile applications.
