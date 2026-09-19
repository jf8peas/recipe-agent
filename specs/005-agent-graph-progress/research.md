# Phase 0 Research: Agent Graph Progress Diagram

Resolves the technical unknowns for [plan.md](plan.md), grounded in direct
reading of `hooks/useSession.ts`, `lib/history.ts`, `lib/fork-replay.ts`,
`lib/tree.ts`, `components/StageProgress.tsx`, `components/BranchTimeline.tsx`,
`components/RunningStage.tsx`, `components/StageFailureBanner.tsx`,
`app/page.tsx`, `lib/agent/edges.ts`, and
`tests/unit/history.test.ts` (whose own assertions settled R1 below) — plus
the existing `AgentGraphDiagram` component already built in
`components/about/diagrams.tsx` (spec 004). Format: **Decision**,
**Rationale**, **Alternatives considered**.

---

## R1 — Where "path taken" comes from: `history.timeline`, filtered and reinterpreted — `next`/`outcome` alone are not enough, confirming the plan request's premise

**Decision**: The diagram is passed `branchId` (`(viewed ?? snapshot).branchId`)
and the full `timeline: TimelineEntry[]` already returned by `useSession()`'s
`history` (and by `viewed`'s own state, for `next`/`outcome`). A pure function,
`deriveRunPath(timeline, branchId, next, outcome, uptoStep?)`, computes:

1. **Filter** `timeline` to entries with `threadId === branchId`.
2. **Drop every entry with `isBranchRoot: true`.** This is the load-bearing
   finding: `lib/history.ts`'s `readBranchTimeline` labels a thread's own
   seed checkpoint (parent = LangGraph's filtered-out `"input"` scaffolding)
   as `stage: "user-edit"`. For a **fresh, unforked session**, confirmed via
   `tests/unit/history.test.ts` ("oldest step0 entry labeled user-edit,
   later ones by stage"), this seed entry is a **separate, earlier
   checkpoint from `parseIngredients`'s own output**, not a mislabeling of
   it — `/start`'s single `graph.invoke()` call produces both automatically
   (LangGraph's own pre-run `__start__` checkpoint, then `parseIngredients`'s
   real one), and `oldestFirst[1]!.stage` is correctly `"parseIngredients"`.
   **For a forked thread, this is different**: re-reading `lib/fork-replay.ts`
   directly (not just the unit test, which only checks the fork-root entry's
   own label) shows its very first `updateState(newConfig, history[0].values,
   START)` call — the one replaying `parseIngredients`'s own recorded
   output — is itself attributed to `START`, not `"parseIngredients"`. Since
   it's the new thread's own first checkpoint (parent = the filtered `input`
   scaffolding again), it gets the exact same generic `isBranchRoot: true,
   stage: "user-edit"` label — there is **no** separately-labeled
   `"parseIngredients"` checkpoint on a forked thread at all. (Every
   subsequent replayed stage *does* get correctly labeled, since
   `stageName = history[i-1].next[0]` correctly names it — this generic
   labeling only ever affects a thread's own very first checkpoint.)
3. **Sort the remainder by `step`.** This is the ordered sequence of every
   real node that has actually produced a checkpoint on this thread — for a
   fresh session, `parseIngredients` is directly present in this sequence
   (correctly labeled, per point 2); for a forked thread, it's absent from
   the sequence entirely (swallowed into the dropped root entry) even
   though it structurally did complete.
4. **Exclude any entry with `kind: "stage-failure"`.** A stage-failure
   checkpoint is an *attempted* stage, not a completed one (spec Edge
   Cases) — `tests/unit/history.test.ts`'s failure/retry test confirms a
   failed attempt and its retry are siblings sharing the same parent, both
   labeled with the attempted stage's name; only the successful sibling
   belongs in "taken".
5. **`parseIngredients` is prepended to the taken list only when it isn't
   already the first entry in it** — i.e., when the sequence from point 3
   is non-empty and doesn't already start with `"parseIngredients"` itself.
   This single rule handles both shapes from point 2 correctly without
   double-counting: a fresh session's sequence already starts with
   `"parseIngredients"` (nothing prepended); a fork's sequence starts with
   whatever was replayed next (e.g. `"proposeDirections"`), so it's
   prepended. An empty sequence (a fork at the very genesis checkpoint,
   before any node ran) correctly stays empty — the "run just started" case.
6. **Current node**:
   - `outcome === "finalized"` or `"ingredient-error"` → no current node
     (terminal; spec FR-008).
   - `outcome === "stage-failure"` → current node = the `.stage` of the
     timeline entry matching the checkpoint currently being displayed
     (`checkpointId` — R2), when that entry's own `kind` is
     `"stage-failure"` — **not** `next[0]`, which isn't a reliable source
     here (confirmed: the app's own `StageFailureBanner` never reads a
     stage name off `next` either, only off `failureReason`), and **not**
     "the branch's leaf stage-failure entry" (a branch can accumulate more
     than one dead-end failure across retries — each stays `isLeaf: true`
     forever even after a later retry succeeds, since a retry creates a
     sibling, not a child — so only the specific checkpoint being displayed
     unambiguously identifies the current one). This is the one case where
     `next`/`outcome` alone genuinely fall short, exactly as the planning
     request anticipated.
   - otherwise (`in-progress`) → current node = `next[0]`.

**Rationale**: This directly answers the planning request's open question:
`next`/`outcome` alone are sufficient for the *current* node in the common
case, but not for (a) the full path taken so far, or (b) the current node
during a stage-failure. `history.timeline`, already fetched for
`BranchTimeline` on the same page, supplies both — no new API route, no new
data source, no `buildTree()` (that solves the cross-branch fork tree, a
different problem — this only ever needs one thread's own linear sequence,
matching the "one thread per branch" invariant the request cited).

**Alternatives considered**: Extending `/step`'s response to carry an
explicit "stages completed" list computed server-side — rejected, the data
already exists client-side via `history.timeline` with no extra request.
Using `buildTree()` and reading one node's ancestor chain — rejected as
solving a strictly harder problem (cross-branch reconstruction) than this
diagram needs (one branch's own straight sequence), and it discards exactly
the `isBranchRoot`/`kind` fields this derivation depends on.

---

## R2 — Viewing an earlier point in history: one `checkpointId` parameter, not a separate "viewing" flag

**Decision**: `deriveRunPath` takes a single, always-required `checkpointId` —
`(viewed ?? snapshot).checkpointId` — rather than an optional
`uptoCheckpointId`/`uptoStep` that's only set for a historical view. It's
resolved to its own timeline entry once, and used for two things: (a) the
taken-stages list (R1 step 3) is filtered to `entry.step <= that entry's own
step`, and (b) it's also exactly what identifies the current stage-failure
entry precisely (R1 step 6). For the live tip, `checkpointId` is the tip's
own id, so the truncation is a no-op (nothing is ahead of it); for a
historical view, it's `viewed.checkpointId`, truncating correctly. One
mechanism handles both cases, rather than two parameters that would need to
independently agree.

**Rationale**: Matches the existing pattern the rest of the running-session
view already uses — `displayedNext`/`displayedState` in `app/page.tsx`
already re-render for whichever checkpoint is being viewed, tip or
historical (spec Edge Cases: "reflects the path up to whichever point is
currently being viewed"). The diagram must not "leak" the live tip's later
progress into a historical view.

**Alternatives considered**: Always showing the live tip's full path
regardless of what's being viewed — rejected, contradicts the spec's own
edge case and the established `displayedNext`/`displayedState` precedent.

---

## R3 — Visual vocabulary: adapt the existing `AgentGraphDiagram` (spec 004), not the raw HTML mockup

**Decision**: Start from `components/about/diagrams.tsx`'s `AgentGraphDiagram`
(already a React/SVG port of `design/v002/about.html`'s agent-graph diagram,
built in feature 004) rather than re-deriving from the HTML mockup again.
Reuse: the same node/diamond shapes (circles for plain nodes, a rotated
square for each decision point), the same overall left-to-right layout order
(`parseIngredients` → `proposeDirections` → `selectDirection` →
`draftRecipe` → `critique` → `finalize`, with `ingredientError` below
`parseIngredients`'s diamond and `refine` below `critique`'s), and
`var(--color-*)` tokens used directly as SVG `fill`/`stroke` (FR-010).

**Resized for FR-011's inline, modest-size constraint**: the existing
`AgentGraphDiagram` has a `950×230` viewBox with a `700px` minimum rendered
width (built for a full-width reference page, wrapped in a bounded-scroll
container at narrow viewports — spec 004 FR-021a). This component instead
targets a **compact `560×190` viewBox** with smaller node radii (`20px`
circles vs. the original's `34px`) and tighter horizontal spacing, sized to
fit the app's own `720px` content column (`app/page.tsx:201`) without a
horizontal scroll container in the common case. As a defensive fallback at
the very narrowest supported width (320px), it's still wrapped in the same
bounded-horizontal-scroll-container pattern already established three times
in this codebase (`AboutSlideshow.tsx`'s directory-tree/execution-flow,
`about/sections.tsx`'s `AgentGraphSection`) — cheap to include, and removes
any risk of the page itself scrolling sideways (SC-005) regardless of how
tight the fit gets.

**Rationale**: Reusing an already-built, already-accessibility-reviewed
component (not just a visual reference) is lower-risk than a fresh diagram,
and keeps every "how do we draw the agent graph" decision in one consistent
place. A fixed, materially smaller viewBox — rather than a `min-width`
override — was chosen because this diagram never needs to show more
content than the fixed 8-node topology (unlike the About page's version,
which shares a wide viewBox with dense per-node labels), so a genuinely
smaller drawing is possible rather than just a smaller *rendering* of the
same-sized content.

**Alternatives considered**: Reusing the `950×230` component verbatim,
scaled down via CSS alone — rejected, its 11px node labels would fall below
a comfortably legible size at a 720px-wide (or narrower) container long
before they would in a 920px-wide reference page. Designing an entirely new
layout/shape vocabulary — rejected, contradicts the request's explicit
instruction to reuse the established vocabulary, and duplicates
already-solved design/accessibility work for no benefit.

---

## R4 — Four visual states, not three: taken / current / not-yet-reached / untaken-branch-side

**Decision**: Every node, diamond, and edge gets one of four treatments,
distinguished by more than color alone (constitution/tokens.css's own
"text/icon carries meaning too, never color alone" convention):

| State | Node/diamond fill | Stroke | Label | Applies when |
|---|---|---|---|---|
| **Taken** | `color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))` (matches the About page's own "normal" node fill) | `var(--color-accent)`, 2px | Plain name, prefixed `"✓ "` | In R1's taken-stages list |
| **Current** | `var(--color-accent)` (solid) | `var(--color-accent)`, 3px | `var(--color-accent-contrast)` text, prefixed `"▶ "` | The one current node (R1 step 6) |
| **Not-yet-reached** | `var(--color-surface)` (plain) | `var(--color-border)`, 1.5px | `var(--color-text-muted)` text, no prefix | Neither taken, current, nor untaken |
| **Untaken branch side** | `var(--color-surface)` (plain) | `var(--color-border)`, 1.5px, **dashed** | `var(--color-text-muted)` text, prefixed `"✕ "`, reduced opacity (`0.6`) | The decision's other side, once that decision has been made (R5) |

A decision point's "other side" is untaken once its decision is resolved:
`ingredientError` is untaken as soon as any entry beyond `parseIngredients`
exists and isn't `ingredientError` itself (i.e., the run went the
`proposeDirections` way); `refine` (and its loop-back edge) is untaken once
`finalize` is taken or current, and `refine` never appears in the
taken-stages list. Before its decision resolves, the un-visited side reads
as plain **not-yet-reached** (no dashed/✕ treatment) — the two are only
distinguished once the choice has actually been made, matching FR-007's
"once already passed" qualifier.

**Rationale**: Directly implements FR-004/FR-007's four required states.
Reusing the About page's own "taken"-equivalent fill (its only style, since
that diagram has no run-specific states) keeps one visual link between the
two diagrams' vocabularies without inventing a fifth palette. The dashed
outline for "untaken" doesn't collide with the About page's own use of
dashed *edges* for "a new network request" (a different diagram, a
different meaning, never shown side-by-side with this one).

**Alternatives considered**: Three states plus a written caption for the
fourth — rejected, FR-007 requires the untaken side to be *visually*
distinguishable, not just described in the accessible-text summary (R6).
Color alone (e.g. a fourth hue) for "untaken" — rejected, fails "never color
alone" given how close a fourth accent hue would sit to "not-yet-reached"'s
neutral tone for anyone with a color-vision deficiency; the dashed
stroke + `✕` + label prefix carries the distinction redundantly.

---

## R5 — Accessibility: a visually-hidden text summary, `<svg aria-hidden="true">`, no `aria-live`

**Decision**: The component renders a visually-hidden `<p>` (the same
`visuallyHiddenStyle` object already defined identically in
`StageProgress.tsx` and `AboutSlideshow.tsx`) immediately before the `<svg>`,
containing a generated plain-language sentence covering both required facts
(FR-012/FR-013): which stage is current, and which path was taken —
e.g. *"Progress: parseIngredients, proposeDirections, and selectDirection
are done. draftRecipe is the current stage. critique, refine, and finalize
are not yet reached. The ingredient-error path was not taken."* The `<svg>`
itself gets `aria-hidden="true"` (its content is fully redundant with the
text summary, so it's excluded from the accessibility tree rather than
requiring a second, harder-to-keep-in-sync `aria-label`). No `aria-live`
region is added.

**Rationale — no `aria-live`**: `components/RunningStage.tsx` already
renders `role="status" aria-live="polite"` ("Running **X**… (Ns)") while a
stage is actually in flight — the moment a stage transition happens. Adding
a second live region on this component would double-announce the same
transition. Between stages (paused, nothing in flight), the summary text
simply reflects the current state in the DOM on every re-render — a screen
reader user reaching it (by Tab or heading navigation) always reads the
current, correct sentence; it doesn't need to be pushed at them the instant
it changes, any more than the replaced component's plain `<ol>` (which had
no `aria-live` of its own either) did. This preserves the "at least as
accessible" bar (FR-012) without a regression risk (redundant chatter) the
old component never had.

**Rationale — text summary over `aria-label`**: An `aria-label` on the
`<svg role="img">` (design/v002/about.html's own pattern) works for a
*static* description written once; this diagram's description changes on
every render and needs the same generation logic whichever attribute holds
it. A separate visually-hidden element is simpler to generate, test (a
plain string, not an attribute buried in JSX), and keep in sync than an
`aria-label` computed inline on the `<svg>` tag — and matches this
component's own established precedent (`StageProgress.tsx`'s own
`visuallyHiddenStyle`, currently unused by it but already defined once, in
case a hidden live region were ever needed — this feature is the first to
actually use the pattern here).

**Alternatives considered**: `aria-label` on the `<svg>` — rejected per
above. A live region on this component too — rejected, redundant with
`RunningStage`. Per-node `aria-label`s inside the SVG (one per shape) —
rejected as far more verbose than a single summary sentence for no
additional information, and harder to keep the "one current node" fact
legible against 8 separate per-shape announcements.

---

## R6 — No agent/graph code changes

**Decision**: Confirmed no change to `lib/agent/edges.ts`, `MAX_REFINE_CYCLES`,
`lib/agent/graph.ts`, or any node file. This feature reads already-recorded
`TimelineEntry[]` data and renders it; it doesn't touch how the graph
executes or routes.

**Rationale**: Matches spec 005's own Out of Scope. `routeAfterCritique`'s
`MAX_REFINE_CYCLES` read stays exactly as-is; per the resolved clarification
(binary taken/not-taken for the revision loop, no cycle count), this
component doesn't even need to read that env var's value.

**Alternatives considered**: None — this is a confirmation, not a decision.

---

## R7 — Component shape: `AgentGraphProgress`, replacing `StageProgress` at its exact call site

**Decision**: `components/StageProgress.tsx` is deleted; `components/
AgentGraphProgress.tsx` replaces it, with `app/page.tsx`'s call site changed
from:

```tsx
<StageProgress next={displayedNext} outcome={displayedState?.outcome ?? snapshot.state.outcome} />
```

to:

```tsx
<AgentGraphProgress
  timeline={history?.timeline ?? []}
  branchId={(viewed ?? snapshot)!.branchId}
  next={displayedNext}
  outcome={displayedState?.outcome ?? snapshot.state.outcome}
/>
```

`history` is already destructured from `useSession()` in `app/page.tsx`
(used today by the `BranchTimeline` inside the collapsible "History"
section) — no new hook, no new fetch.

**Rationale**: Smallest change that supplies exactly the data R1–R2 need,
at the exact spot the replaced component already occupies. `branchId` reads
from `viewed ?? snapshot` (not `displayedState`, which has no `branchId` of
its own — `pendingSave` doesn't change which branch is active either, so
falling through to `snapshot` for that case is correct).

**Alternatives considered**: Passing the whole `history` object plus
`snapshot`/`viewed` into the component and letting it resolve `branchId`
itself — rejected, keeps the derivation (R1/R2) as a pure, independently
testable function taking plain values, consistent with this codebase's
existing convention (`lib/tree.ts`'s `buildTree`, `lib/session-title.ts`'s
`titleForStage`) of pure logic functions separate from the components that
call them.

---

## R8 — Test coverage: new from scratch, a pure function plus component/e2e coverage

**Decision**: `deriveRunPath` (R1/R2) lives in a new `lib/graph-progress.ts`
(pure, no React import — mirrors `lib/session-title.ts`'s own shape),
unit-tested directly (`tests/unit/graph-progress.test.ts`) against the five
scenarios the planning request named: run-just-started, ingredient-error
path, several-stages-in-and-paused, revised-at-least-once, and the
untaken-branch-side case — plus the stage-failure and historical-viewing
cases R1/R2 found. `tests/e2e/` gets a new spec exercising the same
scenarios through the real UI (reusing `startSession`/`clickStep`/
`expectNoA11yViolations` from `tests/e2e/helpers.ts`, the fake-model
fixtures already available for triggering `ingredient-error` and a refine
cycle — confirmed present in `lib/agent/fake-model.ts` from prior features).

**Rationale**: No existing coverage to carry forward (confirmed by the
planning request's own grep). Separating the pure derivation from the
component keeps the hardest-to-get-right logic (R1/R2's timeline
reinterpretation) cheaply testable without a browser, matching this
project's established pattern for every other non-trivial pure function.

**Alternatives considered**: Testing only through Playwright — rejected,
slower feedback for logic this fiddly (stage-failure timeline shape,
step-truncation for historical views) and harder to hit every edge case
(a real refine cycle needs several real steps in a live browser vs. a
one-line fixture array in a unit test).
