# Phase 0 Research: UI Unification

Resolves the technical unknowns for [plan.md](plan.md), grounded in direct
reading of every file in `design/v003/design_files/` and `design/v003/
screenshots/`, and every real component this feature touches:
`components/AppHeader.tsx`, `components/AgentGraphProgress.tsx` +
`lib/graph-progress.ts` (feature 005), `components/about/AboutPage.tsx` +
`components/about/shared.ts` + `components/about/diagrams.tsx` (feature 004),
`components/StatePanel.tsx`, `components/ActionToolbar.tsx`,
`components/RunningStage.tsx`, `components/StageFailureBanner.tsx`,
`components/BranchTimeline.tsx`, `components/EntryForm.tsx`,
`components/SessionList.tsx`, `components/fields/*.tsx`, `app/page.tsx`,
`app/layout.tsx`, `app/tokens.css`. Format: **Decision**, **Rationale**,
**Alternatives considered**.

---

## R1 — Component mapping: design reference → real codebase

| `design_files/*.jsx` | Real file(s) it replaces or touches | Disposition |
|---|---|---|
| `tokens.css` | `app/tokens.css` | **No change** — confirmed byte-equivalent on every token the README cites (`--text-2xl: 2rem`, `--text-3xl: 2.75rem` = 44px already; `--panel-left-width` unchanged, still unused). Zero deltas to apply. |
| `AppHeader.jsx` | `components/AppHeader.tsx` (app state) + `components/about/AboutPage.tsx`'s own `<header>` (about state) | **Merged into one new component.** Today these are two independently-styled headers with duplicated `minHeight`/padding/border/background values. |
| `Toggle.jsx` | The raw `<input type="checkbox">` in `components/AppHeader.tsx` | **New component**, `components/ui/Toggle.tsx` — first real switch control in this codebase. |
| `AgentGraphProgress.jsx` | `components/AgentGraphProgress.tsx` + `lib/graph-progress.ts` | **Layout rebuild only.** `lib/graph-progress.ts`'s `deriveRunPath`, `GRAPH_NODES`/`DECISION_POINTS`/`GRAPH_EDGES`, and the 4-state model are reused verbatim — only the component's own rendering (coordinates, viewBox, node sizes) changes. See R2. |
| `Tabs.jsx` | *(new concept — nothing today)* | **New component**, `components/ui/Tabs.tsx`, generic `role="tablist"` primitive. |
| `RunningSession.jsx` | `app/page.tsx`'s post-`snapshot` branch (currently a single stacked `<div>`: History `<details>` → error → graph → viewing-history banner → `StatePanel` → advance-lock banner → `ActionToolbar`/`RunningStage`/`StageFailureBanner`) | **Restructured**, not replaced wholesale — `app/page.tsx` keeps owning all real state/wiring; only the JSX shape changes (graph + tabs instead of graph + stacked `StatePanel`). |
| `SectionCard`/tab bodies (inline in `RunningSession.jsx`) | `components/StatePanel.tsx`'s per-field sections (dispatching to `components/fields/*.tsx`: `IngredientsEditor`, `ConstraintsEditor`, `DirectionsEditor`, `DirectionSelectionEditor`, `RecipeDraftEditor`, `CritiquesView`, `FinalRecipeView`) | **`StatePanel` is split into one tab body per field-group**, each wrapped in the new `Card` primitive; the field editors themselves (`components/fields/*`) are reused completely unchanged — they already are exactly the "tab content" the design shows, just currently rendered all-at-once in a stack instead of one-at-a-time behind tabs. |
| `SessionScreens.jsx` (`SessionListScreen`, `EntryScreen`) | `components/SessionList.tsx`, `components/EntryForm.tsx` | **Restyled in place** — both already live in `app/page.tsx`'s existing 720px `<main>` column; only their internal button/row/field styling changes to the shared primitives. |
| `AboutPage.jsx` | `components/about/AboutPage.tsx` | **Header swapped to the new shared header; scroll container restyled (R9); own content, sections, and agent-graph illustration (`components/about/diagrams.tsx`'s `AgentGraphDiagram`) otherwise untouched** (spec Clarifications: kept separate, not replaced by the live component) — just restyled to the new two-row visual language. |
| `favicon.svg` | *(none today — confirmed empty `public/`, no icon metadata in `app/layout.tsx`)* | **New asset**, placed as `app/icon.svg` (Next.js App Router's file-based icon convention — auto-wires `<link rel="icon">`, no manual `<head>` edit needed). |
| The prototype's own `DesignSystem_693deb` bundle (`Button`, `Card`, `ListRow`, `TextArea`, `Spinner`) | *(doesn't exist in this app)* | **New internal module**, `components/ui/` (spec Clarifications) — see R4. |

**Rationale**: Named every real target file before any implementation task references it, per the planning request's own instruction not to assume names.

---

## R2 — Graph rebuild: keep the existing inline-SVG technique, don't adopt the reference's plain-HTML + `ResizeObserver` approach

**Decision**: The rebuilt `AgentGraphProgress` stays a single `<svg viewBox>` (matching feature 005's own technique, and the About page's diagram before it) — not the design reference's plain HTML/CSS (`<div>`s with `border-radius`, CSS pseudo-element arrows) driven by a `ResizeObserver`-measured `transform: scale()` wrapper (`AutoFitGraph` in `design_files/RunningSession.jsx`).

The two-row layout, the join connector, the dashed dead-end branches, and the diagonal refine loop are all re-derived as SVG coordinates/paths (a wider viewBox with two logical rows of `<circle>`/`<polygon>` shapes, positioned the same way feature 005's own compact layout already positions 8 fixed nodes — just at the reference's row/branch arrangement instead of feature 005's single-row-plus-two-branches one). The legibility floor (FR-006) is achieved the same way feature 005's own narrow-viewport fallback already works: a `min-width` in CSS pixels on the `<svg>` element itself, wrapped in the same bounded-horizontal-scroll-container pattern already used three times in this codebase, rather than a JS-measured scale transform.

**Rationale**:
- **SVG's `viewBox` already does most of what `AutoFitGraph` exists to do, for free.** `AutoFitGraph` exists specifically because plain HTML/CSS boxes don't scale as one proportional unit on their own — it has to measure natural size and apply a `transform: scale()`. An SVG with `viewBox` + `width: 100%; height: auto` already scales both dimensions together, preserving aspect ratio, with zero JavaScript — the reference's entire `ResizeObserver` + state + effect apparatus has no SVG equivalent because it solves a problem SVG doesn't have.
- **Matches this codebase's own established, already-accessibility-reviewed convention** (three prior diagrams: the About page's architecture diagram, its own agent-graph diagram, and feature 005's `AgentGraphProgress` are all one self-contained `<svg>`) — introducing a second diagramming technique (plain HTML/CSS) for one component would fragment that convention for no benefit.
- **The spec's own framing agrees**: "Recreate this design in the app's real ... components ... using its established patterns — not to ship this HTML as-is" (spec Input). The reference's DOM/CSS structure is a visual reference, not a technique mandate.
- The vertical-legibility problem `AutoFitGraph` also solves (no vertical scrollbar either) is likewise inherent to `viewBox` scaling — a taller two-row diagram simply gets a taller `viewBox`, and proportional scaling shrinks height along with width automatically.

**Alternatives considered**: Porting `AutoFitGraph` + plain-HTML nodes verbatim — rejected per the rationale above: strictly more code (a `ResizeObserver`, two refs, two pieces of state, an effect) to solve a problem SVG's own `viewBox` scaling doesn't have, and a second diagramming technique alongside three existing SVG ones. Keeping the *existing* feature-005 single-row layout and only changing colors — rejected, doesn't satisfy FR-006/FR-010 (the two-row layout and the join connector are explicit requirements, not styling).

---

## R3 — Desktop breakpoint: confirmed there isn't one for graph/tabs side-by-side — resolved, not an open question

**Decision**: No breakpoint switches the graph and tabs to a side-by-side layout at any width. The graph sits above the tabs at every width, exactly as today — the only responsive change is the graph's own node-size floor stepping up once (86px/51px → 95px/59px circles/diamonds) at `≥900px`, per `design_files/index.html`'s own `@media (min-width:900px)` rule, which touches nothing else.

**Rationale**: Read `design_files/index.html`'s full `<style>` block directly rather than assuming — `.ra-run-body` (the wrapper around the graph and the tabs+content panel) is `display:flex;flex-direction:column` unconditionally, with no media query anywhere overriding it to `row`. The *only* `@media (min-width:900px)` rule in the entire reference touches `--ra-node-circle`/`--ra-node-diamond` (the size floor) and nothing about layout direction. The planning request's own hedge ("if that's the final call") is moot — the reference itself never implements a side-by-side option, so there's nothing to decide between.

**Alternatives considered**: None — this is a factual finding from the reference's own code, not a design choice this plan is making.

---

## R4 — `components/ui/` primitives: shape and API

**Decision**: Five small, presentational-only components, each a direct TypeScript port of its `design_files` counterpart's visual result (not its prototype-only implementation):

```ts
// components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "link";
}

// components/ui/Card.tsx
interface CardProps { heading?: string; children: React.ReactNode; style?: CSSProperties }

// components/ui/ListRow.tsx
interface ListRowProps { title: string; subtitle: string; onOpen: () => void; onDelete: () => void; deleteLabel: string }

// components/ui/TextArea.tsx
interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label: string }

// components/ui/Spinner.tsx
// no props — the exact inline spinner `RunningStage.tsx` already animates,
// extracted so `ActionToolbar`'s restyled running-state row can reuse it too.

// components/ui/Toggle.tsx
interface ToggleProps { checked: boolean; onChange: (next: boolean) => void; label: string }
```

Each is a plain function component with inline styles reading `var(--...)` tokens directly — no new pattern beyond what every existing component in this codebase already does; `components/ui/` is a *location* convention (mirroring `components/fields/`'s existing precedent of a purpose-grouped subdirectory), not a new styling technique.

**Rationale**: Matches spec Clarifications' resolution exactly. `Button`'s three variants cover every button in every reference screen (primary = accent-filled, secondary = bordered/transparent, link = text-only) — `ActionToolbar.tsx`'s own existing `buttonStyle`/`secondaryButtonStyle` functions become `Button`'s two non-link variants' implementation, folded into one place instead of duplicated per-component (today `ActionToolbar.tsx`, `EntryForm.tsx`, and `SessionList.tsx` each define their own near-identical button style function). `Toggle` matches `design_files/Toggle.jsx`'s own implementation almost exactly (it's already inline-styled, token-driven, dependency-free — a straight `.tsx` port).

**Alternatives considered**: A single `Button` with boolean props (`secondary`, `link`) instead of a `variant` union — rejected, a closed set of three mutually exclusive states is exactly what a union type is for, and matches the reference's own `variant="secondary"` API. Generating class names / a CSS file for these — rejected, would be the first component in this codebase not using the inline-style-reading-tokens convention.

---

## R5 — Tabs: `activeTab` is new local state; the *visible tab set* is derived, not tracked

**Decision**: One new piece of local state in `app/page.tsx`: `activeTab: TabId | null`. Everything else is derived on every render from data that already exists:

- **Visible tabs**: computed from `deriveRunPath`'s own `takenInOrder` + `current` (feature 005, already computed for the graph) — a stage's tab becomes visible the instant that stage is `taken` or `current` in `RunPathState.nodes`, via a fixed `STAGE_TO_TAB` map (`parseIngredients`→`ingredients`, `proposeDirections`→`directions`, `selectDirection`→`selection`, `draftRecipe`→`draft`, `critique`/`refine`→`critique`, `finalize`→`final`) — no second, independently-maintained "which tabs exist" concept (spec Key Entities: "not a separate, independently-tracked list").
- **Node → tab / tab → node**: the same `STAGE_TO_TAB` map, inverted for the tab→node direction (a tab can correspond to more than one node — `critique` and `refine` both map to the `critique` tab — so highlighting "the node for the active tab" highlights whichever of that tab's mapped nodes is the current `RunPathState.current`, falling back to the first if neither is current).
- **Default/override behavior** (FR-013): a `useEffect` keyed on the *set* of visible tabs (not on every render) sets `activeTab` to the newest visible tab whenever that set grows — mirroring `app/page.tsx`'s own existing `useEffect(() => { if (view === "entry" && sessionList.entries.length > 0) setView("list"); }, [sessionList.entries.length])` pattern (a one-directional, dependency-scoped effect) rather than introducing a new state-management approach.
- **Viewing a historical checkpoint**: `deriveRunPath` is already called with whichever checkpoint is being viewed (feature 005, R2 there) — the visible-tabs derivation above naturally shrinks to match, and the "newest visible tab" default-effect naturally re-fires if the current `activeTab` is no longer in the (now smaller) visible set, landing on the latest one still available — no new historical-view-specific logic needed.

**Rationale**: Keeps exactly one genuinely new piece of state (matching FR-013's "user selection wins until next stage completes" requirement, which cannot be derived — it's real interaction history), while everything else stays a pure function of already-correct data, avoiding two sources of truth for "what's visible" (the graph's own state vs. a separate tab list) ever drifting apart.

**Alternatives considered**: Tracking `visibleTabIds: TabId[]` as its own state, pushed to as stages complete — rejected, duplicates `deriveRunPath`'s own already-correct taken/current computation and risks the two disagreeing (e.g., after a fork changes which stages are actually on the path).

---

## R6 — `constraints` has no tab of its own — folded into the Ingredients tab

**Decision**: The Ingredients tab shows both the ingredients list and the constraints editor/display (when set or when editing) — matching `StatePanel.tsx`'s own current adjacency of the two (they're the first two sections today) and the reference's own tab list, which has no separate constraints tab at all.

**Rationale**: The entry form doesn't currently collect constraints at all (no constraints UI exists yet — confirmed via `components/EntryForm.tsx` and the fake-model fixture's own documented assumption), so `state.constraints` is always its default/empty shape outside of an explicit edit. Giving it a whole tab for content that's essentially always empty would contradict FR-011's "one tab per stage that has already produced output." Folding it into Ingredients keeps `StatePanel`'s existing conditional-rendering logic for constraints (`editable || any field set`) exactly as-is, just inside one tab body instead of one stacked section.

**Alternatives considered**: A seventh tab — rejected per the rationale above (empty tab, most of the time). Dropping constraints entirely from the tabbed view — rejected, it's still a real, editable field or worth showing on the rare run where the user has set one.

---

## R7 — Sequencing

1. **`components/ui/` primitives** (R4) — nothing else depends on real interaction wiring, purely presentational, and every other piece consumes them.
2. **`components/ui/Toggle.tsx` + the unified `AppHeader`** — next, since both the app screens and the About page mount it; doing this first means every subsequent screen change happens against the final header, not a soon-to-change one. Includes the new `app/icon.svg` (trivial, no dependency on anything else).
3. **`AgentGraphProgress` rebuild** (R2) — depends only on `lib/graph-progress.ts` (unchanged) and the new primitives' tokens/spacing conventions being settled; nothing about tabs depends on this being finished first except the *visual* result, but the node→tab map (R5) is easiest to write once the final node id set is confirmed by the rebuilt component.
4. **Tabs + `app/page.tsx` restructuring** (R5) — depends on both 1 and 3 (needs `Tabs`/`Card` from `components/ui/`, and the graph's own `onSelect`/`selectedId` contract to wire node↔tab sync).
5. **`SessionList`/`EntryForm` restyle** — independent of 3/4, can happen in parallel with them once `components/ui/` (step 1) exists; both only ever needed the header (step 2) and the primitives.
6. **About page polish** (header swap, scroll-container fix, agent-graph illustration restyle) — last: depends on the unified header (step 2) and, for the illustration restyle only, the same visual language established in step 3, but touches no shared code any other step depends on.

**Rationale**: Matches the planning request's own instinct (header before the graph) with the concrete dependency reason made explicit — it's not that the header's routing/state changes block the graph technically, it's that both the About page and every app screen mount the header, so settling its final shape first avoids re-touching already-migrated screens a second time.

---

## R8 — Constitution Principle VI: amended, not just documented as a deviation

**Finding, surfaced as an explicit open question rather than assumed**: Principle VI required "a fixed three-panel structure: Left — branch-tree timeline; Center — editable state view; Right — action controls." The **current, already-shipped** `app/page.tsx` never actually implemented this (it's a single stacked column: history disclosure, then graph, then state, then actions) — that predates this feature entirely. `design/v003`'s own reference (which the user commissioned and approved) is also explicitly a single mobile-first column with a *sticky bottom* action row, not a three-panel grid, at any width — a genuine, on-point conflict with the principle as written (not the kind of "global chrome, doesn't touch the session layout" case features 002–005 could correctly mark N/A).

**Decision**: The user, as this constitution's own maintainer, chose to amend Principle VI rather than proceed under a documented deviation. `.specify/memory/constitution.md` is updated (version 3.0.0 → 4.0.0, MAJOR — a redefinition of what "the application layout" is, per the constitution's own versioning policy) to describe the single-column, stage-tabbed, sticky-action-row layout as the standard, replacing the three-panel description. This plan's own Constitution Check is written against the *amended* text, not the old one.

**Rationale**: Matches the planning request's own explicit instruction to surface real open questions rather than silently work around them — this one had governance consequences (a principle rewrite) only the maintainer could authorize, so it was asked rather than assumed.

**Alternatives considered**: Documenting it as a deviation without amending — the other option offered; not chosen. Silently marking Principle VI "N/A" — rejected, would have understated a real, on-point conflict this specific feature (a full running-session layout redesign) directly implicates.

---

## R9 — About page scroll container: explicit `outline: none` on the region itself, not reliance on `:focus-visible` alone

**Decision**: `components/about/AboutPage.tsx`'s scrollable `<main>` gets `scrollbarWidth: "thin"`, `scrollbarColor: "var(--color-border) transparent"` inline, plus a scoped `<style>` block (co-located in the component, matching `RunningStage.tsx`'s own existing precedent of a component-local `<style>` tag for the one thing inline styles can't reach — its `@keyframes`) for the WebKit-only `::-webkit-scrollbar` pseudo-elements, and an explicit `outline: "none"` restated on the element itself (in addition to the existing global `:focus-visible` rule) so a mouse/touch-triggered scroll can never show a ring regardless of a given browser's own `:focus-visible` heuristic.

**Rationale**: `scrollbar-width`/`scrollbar-color` and `::-webkit-scrollbar-*` cover Firefox and Chromium/Safari respectively — there's no single standard property yet, so both are needed for the "thin, unobtrusive" requirement (FR-018) to hold across browsers. The explicit `outline: none` is a defensive belt-and-braces measure: `:focus-visible`'s exact heuristic for "was this focus keyboard-driven" isn't fully hand-authored-spec-guaranteed to treat a scrollbar drag as non-keyboard in every engine, and the design's own requirement (FR-019) is unconditional ("MUST NOT show... as a result of being scrolled by mouse or touch alone") — an explicit rule removes any doubt rather than trusting an inherited global heuristic for this one specific interaction.

**Alternatives considered**: Relying on the existing global `:focus-visible` rule alone — rejected as insufficiently guaranteed across browser engines for this specific interaction, given FR-019's unconditional phrasing.

---

## R10 — Testing/verification approach

- **Visual**: manual side-by-side comparison against each of the four `design/v003/screenshots/*.png` at the screen it depicts, at both a phone width and a desktop width, in both color schemes — no pixel-diffing tool introduced (none exists in this project; consistent with "no new dependency").
- **Token discipline**: `grep -rn "#[0-9a-fA-F]\{3,6\}\|: [0-9]\+px" components/ui components/AppHeader.tsx components/AgentGraphProgress.tsx components/about/AboutPage.tsx` (and the other touched files) before considering any task done — a zero-hits bar, matching FR-021's "every visual value... resolves through... tokens" (a `viewBox`'s own numeric coordinates and a component-local pixel-based legibility floor are graph *geometry*, not a "visual value" in the token sense — same distinction feature 005's own plan already drew for its node radii).
- **Keyboard**: `Toggle` (Space/Enter, `role="switch"`, `aria-checked`) and `Tabs` (native Tab order onto each `role="tab"`, `aria-selected`) get explicit manual keyboard passes plus e2e coverage, mirroring feature 004/005's own established keyboard-testing convention.
- **Accessibility**: `expectNoA11yViolations` (the existing Playwright/axe helper) run on every touched screen, at minimum once at the default viewport and once at 320px (matching the established convention of re-scanning specifically where a narrow-viewport fallback activates).
- **Dark mode**: `page.emulateMedia({ colorScheme: "dark" })` pass on every touched screen, matching feature 005's own established pattern.
- **Regression**: the *existing* e2e suite (every `tests/e2e/*.spec.ts` file) must stay green unmodified in behavior-under-test — per FR-022/SC-007, this feature must not change what any existing real interaction does, only how it's reached; a test needing a *selector* update (because a button moved into a `Card`, say) is expected, but a test needing new *logic* to keep passing would signal a behavior regression.

**Rationale**: Matches this session's own established verification rigor (`tsc`/`vitest`/`build`/`playwright` ×2) at a scope calibrated to a feature this size — nothing here is new practice, just applied across every touched screen instead of one component.
