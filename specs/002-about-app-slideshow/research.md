# Phase 0 Research: About This App Slideshow

Resolves the technical unknowns and reconciles the planning request against the
actual codebase for [plan.md](plan.md). Format: **Decision**, **Rationale**,
**Alternatives considered**. Nothing here reopens a product decision already
settled in [spec.md](spec.md) or the
[constitution](../../.specify/memory/constitution.md).

The original planning request (see plan.md's Input) specified several concrete
implementation choices. Most are adopted as-is; a few conflict with this
repository's actual conventions or with verified facts about the running
system, and are corrected below rather than followed literally — each
correction is called out explicitly so the discrepancy isn't silently lost.

---

## R1 — Styling approach: inline styles + CSS custom properties, not Tailwind

**Decision**: Style `AboutSlideshow` and the new header button exactly like
every other component in the app: inline `style={{...}}` objects referencing
`var(--token-name)` from `app/tokens.css`. Scrollable regions (the Slide 4
directory tree, Slide 5 flow diagram) use plain `overflowX: "auto"` inline, the
functional equivalent of the requested `overflow-x-auto` utility.

**Rationale**: There is no Tailwind in this project — no config file, no
dependency, no existing utility-class usage anywhere in `components/` or
`app/`. Constitution Principle VI requires all visual values to come from the
single shared token source in `app/tokens.css`; introducing a second styling
system for one feature would both violate that principle and add a dependency
the constitution's Fixed Technology Stack (Principle I) doesn't list.

**Alternatives considered**: Adding Tailwind as requested — rejected, new
dependency with no other consumer, and duplicates the token system that
already exists and that every other component uses. CSS Modules — rejected for
consistency; nothing else in the app uses them, and the existing inline-style
convention already handles responsive rules fine via `matchMedia`/resize
listeners (see R4) for the one breakpoint this feature needs.

---

## R2 — File placement: flat, matching existing `components/` and `lib/` layout

**Decision**:
- `components/AboutSlideshow.tsx` — the overlay component (not
  `components/about/AboutSlideshow.tsx`).
- `lib/about-content.ts` — the slide copy as plain exported constants (not
  `lib/data/slidesData.ts`).
- Modify the real header component, `components/AppHeader.tsx` (not a
  `components/layout/Header.tsx`, which doesn't exist in this codebase).
- No separate `SlideContent.tsx` — five bespoke slides (a directory tree, a
  flow diagram, a bio+link, etc.) don't share enough structure to justify a
  generic "slide" component; each is a small function inside
  `AboutSlideshow.tsx` rendering its own `lib/about-content.ts` constants.

**Rationale**: `components/` and `lib/` are both flat today (confirmed: no
subdirectories except `components/fields/` and `lib/agent/`/`lib/db/`, which
group genuinely large, multi-file subsystems — this feature is 2 new files,
not a subsystem). Matching the existing layout keeps the one-off feature from
looking like it introduces a new organizational convention.

**Alternatives considered**: The requested `components/about/` +
`components/layout/` subdirectories — rejected as introducing structure this
single-component feature doesn't need, and `components/layout/Header.tsx`
specifically doesn't match any existing file (the header is
`components/AppHeader.tsx`).

---

## R3 — Slide 2 model description: generic by role, not a specific model ID

**Decision**: Slide 2 describes the critique-step model as "a stronger,
more capable model, configured separately from the model used for the routine
graph nodes" — it does not name a specific model ID.

**Rationale**: Constitution Principle I: "model IDs MUST NOT be hard-coded at
call sites" and the model-routing rule that "the specific IDs are an
implementation choice, not a constitutional fixture." `lib/agent/models.ts`
resolves `MODELS.critique` from the `MODEL_CRITIQUE` environment variable, and
its own fallback constant is `anthropic/claude-sonnet-5` — not
`claude-opus-5` as the planning request assumed. That fallback already
changed once this project (an earlier deployed model ID, `claude-3.7-sonnet`,
was deprecated by the provider mid-project). Printing a specific model name as
documentation copy would very likely go stale exactly the same way, and would
be inaccurate on this deployment today. Describing the *role* the stronger
model plays, without naming it, is both accurate and durable — and satisfies
spec FR-007's actual requirement ("a faster model for routine graph nodes, a
stronger model reserved for the critique step"), which was deliberately
written the same way.

**Alternatives considered**: Naming `claude-opus-5` as requested — rejected,
factually wrong for this deployment's current fallback and liable to drift out
of sync again. Reading the live value of `MODELS.critique` into the slide at
render time — rejected by the spec's own Assumptions (all slide content is
static, developer-authored copy, not live-introspected — see spec.md).

---

## R4 — Correcting `interruptAfter` framing for Slide 5

**Decision**: Slide 5 (and FR-011's "why a run pauses after every stage"
explanation) describes the graph as configured to interrupt after **every
node, by an explicit list of every node's name** — not the wildcard string
`"*"`.

**Rationale**: `lib/agent/graph.ts`'s `buildGraph()` is compiled (in
`lib/agent/runtime.ts`) with `interruptAfter: [...NODE_NAMES]`, an explicit
array. This project's own Phase 0 research from feature 001 (R1) explicitly
rejected the `"*"` wildcard "less certain in JS" in favor of an explicit
node-name array, for determinism. The planning request's `interruptAfter:
["*"]` describes a different (rejected) design; stating it as fact on the
slide would misdescribe the actual, shipped mechanism.

**Alternatives considered**: None — this is a factual correction against the
already-built system, not a design choice.

---

## R5 — Presentation mechanics: no new dependency, hand-rolled overlay

**Decision**: `AboutSlideshow` is a plain React component using local
`useState` for `open`/`slideIndex`, a `position: fixed; inset: 0` full-
viewport container (covering the header too, satisfying FR-002's "the
underlying app is not visible... while the slideshow is open"), a hand-rolled
focus trap (capture `document.activeElement` on open, restore on close;
intercept Tab/Shift+Tab within the overlay's own focusable elements), and a
container-level `onKeyDown` handler for the arrow keys (bubbled from whatever
element inside the overlay has focus — no `window`-level listener needed).
One new design token, `--z-overlay`, is added to `app/tokens.css` so the
overlay's stacking is explicit and documented rather than an accident of DOM
order.

**Rationale**: No dialog/modal/carousel library exists in this project's
dependencies today, and the constitution's Fixed Technology Stack doesn't
include one. `BranchTimeline.tsx` already hand-rolls its own keyboard
navigation (`onKeyDown` on a container) for the same reasons this session
established when that component was built — a small, fixed set of five slides
and three controls doesn't need a general-purpose library. `--z-overlay` is
the first stacking-order value this app needs (nothing else uses fixed
positioning), so it's a genuinely new value, not a duplicate the constitution
would flag.

**Alternatives considered**: A third-party dialog/carousel library (e.g.
Radix, a swiper library) — rejected, same reasoning as R1: no other consumer,
adds a dependency for a five-slide, fixed-content feature. React Portal via
`createPortal` — considered and rejected as unnecessary: `position: fixed`
already escapes any non-transformed ancestor's layout flow and covers the full
viewport including the header, without the extra indirection of a portal
target element.

---

## R6 — Testing strategy: pure logic under Vitest is minimal; Playwright + axe-core carries the rest

**Decision**: No dedicated unit-test file for slide-index math (clamping
`slideIndex` to `[0, 4]` is two `Math.min`/`Math.max` calls, inline in the
component — not worth extracting). Coverage comes from a new
`tests/e2e/about-slideshow.spec.ts`, mirroring the existing `tests/e2e/us*-*.spec.ts`
pattern (uses `expectNoA11yViolations` from `tests/e2e/helpers.ts`), covering:
open/close and content presence (Story 1), keyboard navigation and focus
management (Story 2), and a phone-width viewport resize check (Story 3).

**Rationale**: This project's Vitest config runs `environment: "node"`
(`vitest.config.ts`) — no `jsdom` component-rendering setup is in active use
(the one existing `@testing-library/react` usage, in
`tests/unit/use-auto-run.test.ts`, exercises a hook in isolation, not a
rendered component). Focus management, ARIA announcements, and real keyboard
event handling are exactly what the project's existing Playwright + axe-core
harness (established this session for the other user-facing features) is
built to verify, and every other interactive component in this app is tested
that way, not via component unit tests.

**Alternatives considered**: Adding `jsdom` + React Testing Library component
tests — rejected for consistency; would be the first component-render test in
the project and duplicates coverage the e2e suite already provides more
faithfully (real focus/ARIA behavior in a real browser).

---

## R7 — Content accuracy baseline for the deep architectural explanations (FR-011)

**Decision**: The specific facts each slide's deeper explanation must state,
verified directly against the current code:

- **Connection pooling**: `lib/db/pool.ts` caches one `pg.Pool` on
  `globalThis.__recipeAgentPool`.
- **Graph compilation caching**: `lib/agent/runtime.ts`'s `getGraph()` caches
  one compiled graph on `globalThis.__recipeGraph`, reusing the same pool for
  its `PostgresSaver`.
- **Last-value-wins channels**: `lib/agent/graph.ts`'s `GraphState` — every
  channel is a plain `Annotation<T>()`, no reducer; the code comment there
  states the reason directly: so `updateState` can overwrite any field on
  edit (constitution Principle IV).
- **Step-wise execution**: `interruptAfter: [...NODE_NAMES]` — an explicit
  array of all seven node names (see R4), not a wildcard.
- **Tree reconstruction**: constitution v3.0.0 / Principle IV — each branch is
  its own LangGraph thread; a single thread's `parentConfig` chain
  (`getStateHistory`) reconstructs that branch's own linear step history
  (`lib/history.ts`); the app's own `branches` table (session id, thread id,
  parent thread id, forked-from checkpoint id) links separate branches into
  the full cross-branch tree (`lib/tree.ts`). Forking never writes a second
  child of an already-branched checkpoint within one thread — that's a
  confirmed data-loss bug in the checkpointer package this project uses
  (constitution Principle IV) — a fork instead seeds a brand-new thread by
  replaying the parent branch's recorded outputs (`lib/fork-replay.ts`).

**Rationale**: FR-012 requires slide content to be "the specific, correct
technical detail," not simplified-to-the-point-of-wrong. These are the exact
mechanisms and file locations `data-model.md` and the slide content constants
must stay faithful to.

**Alternatives considered**: None — this is fact-gathering, not a decision
point.
