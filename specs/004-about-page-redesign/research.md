# Phase 0 Research: About Page Redesign

Resolves the technical unknowns for [plan.md](plan.md), verified directly
against the current codebase and against `design/v002/about.html` (read in
full — all 638 lines, every section, both inline `<style>` and inline
`<svg>` blocks) before adopting any of its claims. Format: **Decision**,
**Rationale**, **Alternatives considered**. Nothing here reopens a product
decision already settled in [spec.md](spec.md) or the
[constitution](../../.specify/memory/constitution.md).

---

## R1 — `public/about.html` is a dead, unreferenced duplicate — safe to delete

**Decision**: Delete `public/about.html` as part of this feature.

**Rationale**: `diff public/about.html design/v002/about.html` returns no
differences — it's an exact copy, currently servable live at `/about.html`
purely because anything under Next.js's `public/` directory is auto-routed.
`grep`ing the whole repo (excluding `design/`) for any reference to
`about.html` returns nothing — no link, no import, nothing points at it. It
exactly matches spec.md's Out of Scope: "a standalone, publicly servable
version of this page outside the app's own overlay." `design/v002/about.html`
itself is untouched — it stays as the design-reference artifact, matching
this repo's existing `design/v001/` convention for non-shipped mockups.

**Alternatives considered**: None — this is a confirmed dead file, not a
design choice.

---

## R2 — Two new design tokens, added to `app/tokens.css` itself, not hardcoded locally

**Decision**: Add `--text-2xl: 2rem;` and `--text-3xl: 2.75rem;` to
`app/tokens.css`'s type-scale block. `color-mix(in srgb, var(--color-accent)
10%, var(--color-surface))` (and similar) is used freely wherever the
mockup uses it — it's a CSS function computed from two *existing* tokens at
render time, not a new hardcoded value, so it needs no token of its own.

**Rationale**: The mockup's own `<style>` block defines these two sizes
locally, with its own comment explaining why: "a one-off 'hero' size isn't a
reusable token" (design/v002/about.html:46-48) — a reasonable call for a
standalone HTML mockup with no shared stylesheet to extend. But this app
*has* one, and constitution Principle VI is explicit: "Design tokens...
live in a single shared source" and "Component-local hard-coded style
values that duplicate a token are prohibited." The mockup's own local
`:root` re-declares every *other* token as a verbatim copy of
`app/tokens.css`'s real values (confirmed identical, hex for hex) specifically
so the standalone file visually matches the app — that copying is the
mockup's workaround for not having access to the real file; the live
component does, so there's no reason to re-invent a local copy of anything,
including the two new sizes. `color-mix()` needs no dependency or polyfill
— it's supported in every evergreen browser this app already targets
(Chrome 111+, Firefox 113+, Safari 16.2+), and this project has no older-
browser support requirement anywhere else.

**Alternatives considered**: Defining `--text-2xl`/`--text-3xl` locally
inside the new component (mirroring the mockup exactly) — rejected, directly
contradicts Principle VI's "lives in a single shared source" for the sake of
matching a standalone file's own necessary workaround. Reusing an existing
size (`--text-xl`) for both the hero and section headings — rejected, loses
the mockup's deliberate visual hierarchy between the hero and every `<h2>`
for no real benefit.

---

## R3 — New `components/about/` subdirectory (reversing spec 002's earlier "stay flat" call)

**Decision**: `components/AboutSlideshow.tsx` is deleted; its replacement
lives under a new `components/about/` subdirectory, not as a single flat
file.

**Rationale**: Spec 002's own research (R2) chose a flat file specifically
because that feature was "2 new files, not a subsystem." This feature is
categorically bigger: 16 sections (including 3 substantial inline-SVG
diagrams) versus 5 uniform slides — ported into one flat file it would run
well past a thousand lines with no natural seams. `components/fields/`
already establishes the precedent of a component subdirectory in this
project; `components/about/` follows the same reasoning at the point this
feature's own scope crosses the threshold spec 002 explicitly reserved for
"a genuine subsystem."

**Alternatives considered**: One flat `components/AboutPage.tsx` file
(spec 002's pattern) — rejected as the file would be unreasonably large and
hard to navigate for a feature this much bigger. A separate file per
section (16 files) — rejected as excessive for content this static; grouped
into a handful of files (below) is a better fit.

**File breakdown**:
- `components/about/AboutPage.tsx` — the overlay shell: dialog semantics,
  focus management, Tab trap, sticky header (title + topic nav + "Return to
  App"), and the ordered list of section components.
- `components/about/sections.tsx` — the ~15 section components (Cover,
  Author, Pitch, TimeTravel, Journey, UnderTheHood divider, Architecture,
  AgentGraph, Prompts, State, Branching, DataModel, Repo, Api, Principles,
  Closing).
- `components/about/diagrams.tsx` — the three inline-SVG diagrams
  (`TimeTravelDiagram`, `AgentGraphDiagram`, `StatePersistenceDiagram`).
- `components/about/shared.ts` — small reusable style-object helpers
  (`cardStyle`, `gridStyle(columns)`, `calloutStyle`, `badgeStyle`,
  `tableStyle`, …) used across `sections.tsx` and `diagrams.tsx`, so the
  same visual pattern (there are dozens of `.card`-equivalent elements) is
  defined once — mirrors `AboutSlideshow.tsx`'s existing
  `controlButtonStyle()` helper-function pattern, just factored out since
  this page reuses far more patterns than any single prior component did.

---

## R4 — Content stays a data module, restructured per-section (not inlined as TSX)

**Decision**: `lib/about-content.ts` is kept (not deleted), but its content
is fully rewritten: the five-slide exports (`AUTHOR_BIO` as a short bio,
`TECH_STACK_OVERVIEW`, `TECH_STACK_ITEMS`, `PERSISTENCE_EXPLANATION`,
`DIRECTORY_TREE`, `EXECUTION_STAGES`, `EXECUTION_DEEP_DIVE`) are retired in
favor of new exports, one (or a small group) per section, each shaped
however that section's own content actually is — not forced into one common
"section" interface.

**Rationale**: Matches this project's own established pattern (content
lives in `lib/about-content.ts`, rendering lives in `components/`) — proven
valuable already: feature 003 needed to update `EXECUTION_STAGES` there
without touching any rendering code when `selectDirection` was added.
Unlike spec 002's five *uniform* slides, this page's sections are not
uniform — some are a paragraph, some are a 3-4 item card grid, some are a
table, one is a flat list of channel names. Forcing one shared interface
across all of that would be artificial; separately-shaped named exports
(already this file's existing convention — `TECH_STACK_ITEMS`,
`DIRECTORY_TREE`, and `EXECUTION_STAGES` are three different shapes today)
extends the same pattern rather than inventing a new one.

**Alternatives considered**: Content inline as TSX directly in
`sections.tsx` — rejected: couples prose edits to component code for no
benefit, and abandons a pattern this repo has already gotten real value
from once. One uniform `Section[]` array (spec 002's shape) — rejected,
doesn't fit this page's genuinely non-uniform content.

---

## R5 — Topic nav: native anchor links + a manual focus() call, no scroll-spy

**Decision**: Each topic-nav entry is a plain `<a href="#section-id">`. No
`preventDefault()` — the browser's own native hash navigation handles the
scroll. A small `onClick` handler additionally looks up the target section
by id and calls `.focus()` on it (each section gets `tabIndex={-1}` so it's
programmatically focusable). No scroll-spy library, and no "currently
active section" highlighting logic.

**Rationale**: Native anchor-link navigation scrolls the viewport but does
**not** move keyboard focus by default — a well-known accessibility gap,
and exactly what spec.md's US2 Acceptance Scenario 2 and FR-025 require
fixing ("keyboard focus and screen-reader attention move to that section
too — not just the visual scroll position"). The fix is a small, standard,
well-established pattern (give the target a negative tabindex, focus it on
activation) — no library needed. A scroll-spy (tracking scroll position to
highlight the "current" nav link) is unnecessary work with no basis in the
request: re-reading `design/v002/about.html`'s own CSS confirms it never
highlights an "active" nav link either (`.about-nav a:hover` is the only
interactive style — no `.active` class, no scroll-tracking script anywhere
in the file, which has no `<script>` at all). Matching the mockup's own
(lack of) behavior here is the simpler and more faithful choice.

**Reduced motion**: the scrollable content region's own `scrollBehavior` is
set conditionally in an effect, based on
`window.matchMedia("(prefers-reduced-motion: reduce)").matches`, scoped to
that one element only — not a global `html { scroll-behavior }` rule in
`app/tokens.css`, which would change scroll behavior for the whole app, not
just this one overlay.

**Alternatives considered**: A scroll-spy library (e.g. reading
`IntersectionObserver` state to highlight the current section) — rejected,
unused feature per the mockup itself, and would be the first new dependency
this page introduces for something nobody asked for. `preventDefault()` +
manual `scrollIntoView()` for the scrolling itself — rejected as
unnecessary; native hash navigation already does this correctly and for
free, and reduces the amount of custom JS to get wrong.

---

## R6 — Diagrams: inline SVG, porting the app's own existing technique (not the mockup's raw markup verbatim)

**Decision**: All three diagrams (time-travel/branching, agent graph,
state/validation/persistence) are built as JSX functions returning a single
`<svg viewBox="...">` per diagram — shapes, connectors, and text labels all
as SVG children, no HTML overlay — living in `components/about/diagrams.tsx`.
This is not a new technique for this codebase: `components/AboutSlideshow.tsx`
already built exactly one such diagram this way (`ArchitectureDiagram`, spec
002 — `<marker>` defs for arrowheads, a small `DiagramBox` helper for
labeled boxes, `var(--color-*)` tokens used directly as SVG `fill`/`stroke`
values). The three new diagrams extend that same established pattern rather
than re-deriving the mockup's raw SVG from scratch.

For the **agent graph** specifically (the widest diagram, ~950 viewBox
units, small embedded text) — per the FR-021a clarification — it's wrapped
in the *exact* bounded-horizontal-scroll container pattern
`components/AboutSlideshow.tsx` already uses for its Slide 4/5 wide content
(`DirectoryTreeSlide`'s and `ExecutionFlowSlide`'s `data-testid` div: `role="group"`,
an `aria-label`, `tabIndex={0}` so it's independently keyboard-reachable and
scrollable, `style={{ overflowX: "auto" }}`) — reused verbatim, not
reinvented, per the user's own instruction to check how the app's existing
wide-content regions already solve this.

**Rationale**: Reusing an established, already-accessibility-reviewed
pattern (both the SVG-diagram technique and the bounded-scroll-container
technique were built, tested, and fixed for real axe-core violations during
spec 002) is lower-risk than re-deriving either from the mockup's raw markup,
and keeps the codebase's diagram/wide-content conventions in exactly one
place each.

**Alternatives considered**: Importing the mockup's SVG markup as static
external assets (`.svg` files) — rejected by the request itself ("not
pulled in as external image assets"). An `<iframe>` of the mockup file —
rejected by the request itself, and would sidestep the app's own token/
theme system entirely (an iframe's content can't see `app/tokens.css`'s
`prefers-color-scheme` cascade the same way).

---

## R7 — Overlay shell: what carries over from `AboutSlideshow.tsx`, what's dropped, what's added

**Decision**:

| Piece | Disposition |
|---|---|
| `role="dialog"` / `aria-modal="true"` on the fixed, full-viewport container | Carried over unchanged |
| Focus-restore-on-close (`previouslyFocused` ref capturing `document.activeElement` on open, `.focus()` on close) | Carried over unchanged |
| Tab-trap `onKeyDown` handling (`FOCUSABLE_SELECTOR` query, wrap at the first/last focusable) | Carried over unchanged |
| `slideIndex` state, `SLIDES` array, per-slide `render()` dispatch | Dropped — no slide concept |
| Next/Previous handlers and buttons | Dropped — no pagination (spec FR-004) |
| `ArrowLeft`/`ArrowRight` key handling | Dropped — nothing left for arrow keys to page through; removing it also means the browser's own native arrow-key scroll behavior on a long page is no longer intercepted, which is the correct behavior for a scrolling document |
| "Slide X of Y" `aria-live` announcement, updated on every `slideIndex` change | Replaced — the live region instead announces the section a nav-link activation just jumped to (updated by the same `onClick` handler that calls `.focus()`, research R5), not on every scroll pixel |
| The single scrollable content region (previously the "slide" `<section>`, `flex:1; overflowY:auto`) | Carried over as the whole page's own scrollable body — now containing every section in sequence instead of one slide at a time |

**Rationale**: Matches the request precisely — reuse the parts of the
overlay mechanics that have nothing to do with pagination (they're
generically about "a full-page dialog takeover," which this feature still
is), drop the parts that only existed to support slide-by-slide navigation.

**Alternatives considered**: None — this is a direct, itemized
implementation of the request's own instruction.

---

## R8 — Verified facts (no corrections needed this time)

**Decision**: Every specific technical claim in `design/v002/about.html`
that was checked against the real code matched exactly — ported as-is.

**Rationale** (grep-verified against the real code, not assumed):
- `MAX_REFINE_CYCLES` defaults to `2` (`lib/agent/edges.ts:10`,
  `.env.example:14`) — matches the mockup's "2 by default" claim.
- Exactly 3 app-owned tables: `sessions`, `usage_events`, `branches`
  (`lib/db/migrations/000{1,2,3}_*.sql`) — matches.
- 9 route handlers exist, matching the mockup's route list exactly
  (`start`, `:sid/step`, `:sid/step/commit`, `:sid/fork`, `:sid/history`,
  `:sid/state`, `:sid/delete`, `mine`, `cron/purge`), and all 9 set
  `runtime = "nodejs"` and `maxDuration = 60` — matches "every handler"
  claim exactly.
- `StateSchema` (`lib/agent/state.ts`) has exactly 10 channels, and they're
  the same 10 the mockup names — matches. (The mockup was evidently authored
  after feature 003 added `directionSelection` — it's already accounted
  for.)

**Alternatives considered**: None — this is fact-verification, not a
decision. Unlike specs 002/003, no content correction is needed before
porting this mockup's substance into the live component.

---

## R9 — Test file: full rewrite, renamed

**Decision**: `tests/e2e/about-slideshow.spec.ts` is deleted; its
replacement is `tests/e2e/about-page.spec.ts` (new file, not a rename-in-
place edit).

**Rationale**: The old file's name and its `SLIDE_TITLES` constant both
describe the retired slideshow model directly — matching the terminology
retirement this whole feature is about (spec FR-001), not just an internal
implementation swap.

**Alternatives considered**: Keeping the old filename and rewriting its
contents in place — rejected as a cosmetic inconsistency for no benefit,
now that "slideshow" is retired vocabulary everywhere else in this feature.

---

## R10 — `README.md` needs one small wording fix, not a rewrite

**Decision**: The "In the app" section (added to `README.md` earlier this
session) currently says the header's "About This App" button "opens a
slideshow walking a reader through this same architecture." That sentence's
one word ("slideshow") needs updating to match this feature — the rest of
that section (the pointer to `lib/about-content.ts`, the note that its
content needs manual updates alongside graph changes) stays accurate and
unchanged.

**Rationale**: Confirmed by re-reading the current `README.md` — this is a
small, already-scoped propagation fix, not a new documentation effort.

**Alternatives considered**: None.
