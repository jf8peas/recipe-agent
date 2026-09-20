# Handoff: Recipe Agent UI Unification

## Overview
Redesign that unifies Recipe Agent's app screens (entry form, session list, running session, finished recipe) with its "About This App" page — one top bar, one content width, one type scale, one component family, mobile-first with desktop widening into a two-column layout.

## About the Design Files
The files in `design_files/` are **design references built in HTML/React (inline Babel JSX)** — prototypes showing intended look, structure, and interaction, not production code to copy directly. The task is to **recreate these designs in Recipe Agent's real codebase** (Next.js + the existing `.tsx` component set) using its established patterns — not to ship this HTML as-is.

## Fidelity
**High-fidelity.** Colors, spacing, type, and component states are final; token values are given below. Copy shown in the prototype is placeholder session/recipe content — reuse the app's real copy/data wiring.

## Screens / Views

### 1. App top bar (`AppHeader.jsx`)
Two states of one component, `--header-height` tall, sticky, `1px solid var(--color-border)` bottom edge, `var(--color-surface)` background, flex row, `space-4` horizontal padding, wraps on narrow widths (`flex-wrap`, `gap: space-2 space-4`).
- **App state**: product title (with a small "RA" monospace mark, `--color-accent` bg, `--radius-sm`, 28×28px) → flex-grow actions group: custom Toggle ("Pause between stages"), Author link, Feedback link (both plain `--color-text-muted`, no underline, hover → `--color-text`), "About This App" button (secondary variant).
- **About state**: title (+ " — how it works" muted suffix) → section nav (Overview / Using it / Agent graph / Principles, same muted-link style) → "Return to App" button (primary variant).

### 2. Toggle (`Toggle.jsx`)
Replaces the raw checkbox. 36×20px pill track, `--color-border` off / `--color-accent` on, 16px circular thumb (`--color-surface`, `--shadow-sm`) sliding via `left` 2px→18px, 0.15s ease. `role="switch"`, keyboard-operable (Space/Enter), label to the right.

### 3. Session list (`SessionScreens.jsx` → `SessionListScreen`)
Single `.ra-content` column (max-width 720px, centered, `space-6 space-4` padding). Heading (`--text-xl`), primary "Start a new session" button, then a `ListRow` per session (title + last-opened subtitle, open/delete affordances from the design system).

### 4. Entry form (`SessionScreens.jsx` → `EntryScreen`)
Same 720px column. Heading "What's in your kitchen?" (`--text-xl`), a `TextArea` (ingredients, one per line), primary "Start" button, link-style "Back to your sessions".

### 5. Running session (`RunningSession.jsx`)
Same 720px column (`.ra-run`), bottom-padded to clear the sticky action row.
- **History** `<details>` disclosure at top (checkpoint list, monospace-flavored "[normal]"/"[in progress]" tags).
- **Graph**: `AgentGraphProgress`, full width, auto-scaled to fit (see Interactions).
- **Tabs**: full width below the graph, appear as their stage completes (Ingredients → Dish directions → Direction selection → Recipe draft → Critique → Final recipe). Selecting a graph node selects its tab.
- **Tab content**: a `Card` per stage; editable stages (ingredients, directions, selection, draft) get an "Edit this stage" link; critique and final recipe are read-only.
- **Action row**: sticky to viewport bottom, bordered card, `shadow-md`. Idle: "Step (nextNode)" primary + "Play" secondary + "Edit" secondary. Running: spinner + "Running **nodeId**… (7.6s)" + right-aligned "Cancel". Done: "Start a new session".

### 6. Agent graph (`AgentGraphProgress.jsx`)
Two-level layout so every node is large enough to read (86px circles / 51px diamonds mobile, 95px/59px ≥900px — **not to shrink further**; container auto-scales instead of the nodes, see below).
- **Row 1** (left→right): parse ingredients → usable? → propose directions → select direction.
- **Row 2** (right→left, directly under row 1, same 4 columns): draft recipe → critique → blocking? → finalize.
- A **join connector** (2px line + arrowhead, same style/weight as the horizontal edges) drops from select direction into draft recipe, column-aligned by replicating the row's exact node/edge widths in an invisible spacer row (`ra-graph-joinrow`) — do not approximate this with generic centering, it drifts.
- **Decisions** (`usable?`, `blocking?`) are diamonds; their untaken/rework paths hang below as a **dashed dead-end** branch (drop line + arrowhead + a lighter node), the visual language for "a fork" and "a path not taken."
- **refine** hangs below `blocking?` the same way, plus a **diagonal straight-line arrow** (same 2px weight, same small arrowhead) from refine back up to critique, showing the rework loop.
- **State color**: pending = dashed border + muted text; current = solid `--color-accent` fill; done = `--color-success`-tinted fill + solid success border. Every state also carries a **text caption** ("running" / "done") below the node — color is never the only signal.

### 7. Finished recipe (in `RunningSession.jsx`, `final` tab)
Read-only card: title, "Serves N", numbered steps with per-step minutes, and an approximate nutrition line (calories/protein/carbs/fat).

### 8. About page (`AboutPage.jsx`)
Same 720px column, uses the shared `AppHeader` in its "about" state. Sections: cover (kicker + h1 + lede), pitch (3-card grid), journey (2-card numbered grid + inverted callout block), agent graph (live diagram reused mid-run), principles (3-card grid), closing (inverted callout with name + LinkedIn link).
- Scroll container: `overflow-y:auto`, thin scrollbar (`scrollbar-width:thin`, 8px WebKit thumb, `--color-border`, transparent track) — no heavy native scrollbar, no focus ring on the container itself.

## Interactions & Behavior
- **Graph auto-fit**: the graph's natural (unscaled) width/height is measured (`ResizeObserver`) and the whole diagram is scaled down via CSS `transform: scale()` to fit its container — this removes horizontal *and* vertical scrollbars at any window width instead of shrinking node/text sizes below the legibility floor.
- **Node click → tab**: clicking a graph node maps to its tab id (`parseIngredients`/`usable` → ingredients, `proposeDirections` → directions, `selectDirection` → selection, `draftRecipe` → draft, `critique`/`blocking`/`refine` → critique, `finalize` → final) and switches the active tab; the reverse (selected tab → highlighted node) uses the same map.
- **Run simulation**: "Play" auto-advances one stage per ~1.1s until done or Cancel; "Step" advances one stage per click.
- Toggle, tabs, and disclosure are all keyboard-operable (native `<details>`, `role="switch"`, `role="tab"`).
- Motion stays minimal per the design system: no new easing/animation beyond the toggle thumb slide and the existing spinner rotation.

## State Management
- `stageIndex` (0..7, drives node status + which tabs are visible) and `running` (bool) drive the whole run screen.
- `activeTab` is derived-but-overridable: defaults to the latest-unlocked tab, but user selection (via tab click or node click) wins until the next stage completes.
- `paused` (top bar toggle) and `view` (list/entry/running/about) are app-shell-level state in the real app's existing state machine — the prototype's `App` root is illustrative only.

## Design Tokens
See `design_files/tokens.css` for the full file (already the project's real token file, unchanged in structure, only `--panel-left-width` value point of note — not currently used by layout). Key values:
- Colors: bg `#faf8f5`, surface `#ffffff`, border `#e4ddd3`, text `#241f1a`, text-muted `#6b6156`, accent `#b5502f` (contrast `#ffffff`), success `#2f6d4f`, warning `#a06a00`, danger `#a3312a`, focus `#1a5fb4` — full dark-mode set under `prefers-color-scheme: dark` (unchanged, still required).
- Spacing (4px base): space-1 4px … space-8 48px.
- Radii: sm 4px, md 8px, lg 12px.
- Type: font-sans `system-ui,-apple-system,"Segoe UI",sans-serif`; font-mono `ui-monospace,"Cascadia Code",monospace`; text-xs 12px → text-3xl 44px.
- Shadow: sm `0 1px 2px rgba(0,0,0,.06)`, md `0 4px 12px rgba(0,0,0,.08)`.
- Layout: header-height 56px.

## Assets
No photography/illustration. One added asset: `favicon.svg` — a 64×64 rounded-square "RA" monospace mark (`--color-accent` background, `--color-accent-contrast` text) used as both the favicon and the small in-header logotype mark. This is a deliberate, minimal departure from the design system's "no logo" stance, scoped to just this mark — confirm with design before treating it as a permanent brand asset.

## Files
- `design_files/index.html` — shell, all CSS, script loading order.
- `design_files/tokens.css` — the token file (copy of the app's real `app/tokens.css`).
- `design_files/AppHeader.jsx` — unified top bar, both states.
- `design_files/Toggle.jsx` — the pause toggle control.
- `design_files/Tabs.jsx` — stage-output tab strip.
- `design_files/AgentGraphProgress.jsx` — the two-level graph component.
- `design_files/RunningSession.jsx` — running-session screen (graph + tabs + action row) and the graph auto-fit wrapper.
- `design_files/SessionScreens.jsx` — session list + entry form.
- `design_files/AboutPage.jsx` — About This App page.
- `design_files/favicon.svg` — logo/favicon mark.
