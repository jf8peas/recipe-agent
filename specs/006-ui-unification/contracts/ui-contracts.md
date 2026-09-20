# UI Contracts: Unified Header, Graph, Tabs, Primitives

No API route changes (research: presentation/layout only). This documents
prop contracts and behavioral guarantees for every component this feature
adds or changes, in place of an API contract.

## `AppHeader`

```ts
interface AppHeaderProps {
  mode: "app" | "about";
  pauseBetweenStages?: boolean;
  onTogglePause?: (next: boolean) => void;
  onOpenAbout?: () => void;
  onReturn?: () => void;
}
```

| Guarantee | Spec ref |
|---|---|
| Same height, background, border, padding in both modes. | FR-002 |
| `mode="app"` renders: mark+title, `Toggle`, Author link, Feedback link, "About This App" (`Button variant="secondary"`), in that order. | FR-003 |
| `mode="about"` renders: title + " — how it works", the existing topic `<nav>` (feature 004, unchanged), "Return to App" (`Button variant="primary"`). | FR-004 |
| Wraps (doesn't clip or overflow) at 320px width. | FR-002, inherited from feature 004's own responsiveness bar |

## `Toggle`

```ts
interface ToggleProps { checked: boolean; onChange: (next: boolean) => void; label: string }
```

| Guarantee | Spec ref |
|---|---|
| `role="switch"`, `aria-checked` reflects `checked`. | FR-005 |
| Operable via click and via Space/Enter when focused. | FR-005 |
| Visible focus indicator when tabbed to. | FR-005, FR-020 |
| The on/off state is never conveyed by color alone — the thumb's own position (left/right) plus `aria-checked` both carry it independent of hue. | Constitution ("color is never the sole signal") |

## `Tabs`

```ts
interface TabsProps { tabs: { id: TabId; label: string }[]; activeId: TabId | null; onChange: (id: TabId) => void }
```

| Guarantee | Spec ref |
|---|---|
| `role="tablist"` container, one `role="tab"` per entry, `aria-selected` on the active one. | FR-011, FR-020 |
| Every tab reachable and activatable via keyboard (native Tab order onto each button; Enter/Space activates, standard button semantics — no roving-tabindex arrow-key pattern introduced, since this is a small, always-fully-visible tab strip, not a large disclosure widget). | FR-020 |
| New tabs appear in-place (no reflow surprise) as `tabs` grows — the strip wraps onto additional rows (`flex-wrap:wrap`) rather than scrolling horizontally, once a run's own critique/draft-revision cycles produce more tabs than fit on one line (superseded `design_files/index.html`'s `.ra-tabs` `overflow-x:auto` rule, by explicit request — no tab is ever reachable only via a scroll gesture). | FR-011, SC-002 (no page-level horizontal scroll) |
| Each tab renders as a distinct bordered pill, not just an underlined label — the active one is filled (background + border + bold together, never color alone) so it reads as a clickable control even once wrapped across rows. | Constitution ("color is never the sole signal") |

## `AgentGraphProgress` (rebuilt layout, same prop contract as feature 005 plus one new one)

```ts
interface AgentGraphProgressProps {
  timeline: TimelineEntry[];
  branchId: string;
  next: string[];
  outcome: State["outcome"];
  checkpointId: string;
  onSelectNode?: (node: GraphNodeName) => void; // NEW — node-click callback (research R5/data-model.md § 4)
  selectedNode?: GraphNodeName | null;           // NEW — which node reads as "linked to the active tab"
}
```

| Guarantee | Spec ref |
|---|---|
| Renders 2 rows of 4 stages each, row 2 directly below row 1, visually reversed left-to-right (research R1, data-model.md § 3). | FR-006 |
| Every node stays at or above its defined minimum comfortable size at any supported width; the whole diagram scales as one unit (SVG `viewBox`, research R2) rather than any node shrinking further. | FR-006, FR-007 |
| A join connector visually connects `selectDirection` (row 1) to `draftRecipe` (row 2). | FR-006 (two-row layout) |
| `ingredientError` hangs below `usable?` and `refine` hangs below `blocking?` as a dashed branch, with `refine` additionally connected back to `critique` by its own loop-back edge — both exactly reflecting `RunPathState`'s existing taken/current/not-yet-reached/untaken states (unchanged derivation, feature 005). | FR-008, FR-010 |
| The accessible text summary (feature 005, unchanged content/logic) continues to render. | FR-009 |
| Clicking a node calls `onSelectNode` with that node's `GraphNodeName`, when provided. | FR-012 |
| `selectedNode`, when provided, renders that node with a visible "linked to the active tab" treatment distinct from (and combinable with) its taken/current/not-yet-reached/untaken state — e.g. a focus-ring-style outline, not a color swap (color is never the sole signal). | FR-012, Constitution |
| At the very narrowest supported width, falls back to the existing bounded-horizontal-scroll-container pattern (feature 005) instead of shrinking node text further. | FR-006, Edge Cases |

## `components/ui/*` primitives

See `data-model.md` § 1 for full prop shapes.

| Component | Guarantee |
|---|---|
| `Button` | `variant="primary"` = accent-filled; `"secondary"` = bordered/transparent; `"link"` = text-only, accent-colored. All three: visible focus ring, `disabled` renders at reduced opacity with `cursor:not-allowed` (matching `ActionToolbar.tsx`'s existing convention). |
| `Card` | Bordered, `radius-md`, `surface` background, `space-4` padding — the same visual result `StatePanel.tsx`'s per-field `sectionStyle` already produces today, just extracted. |
| `ListRow` | Title + subtitle + an "open" affordance covering the row (matching `SessionList.tsx`'s existing full-row-button pattern) + a separately-focusable delete button with its own `aria-label`. |
| `TextArea` | A `<label>` associated to the field via `htmlFor`/`id` (matching `EntryForm.tsx`'s existing pattern), token-styled border/background/font. |
| `Spinner` | The exact visual (`RunningStage.tsx`'s existing spinning-ring) extracted verbatim — no visual change, just reuse. |

## Test surface

`tests/e2e/ui-unification.spec.ts` (new) covers the cross-cutting guarantees
(header parity across modes, toggle keyboard operation, tab↔node sync, no
whole-page horizontal scroll, dark mode, axe scans). Existing per-feature
e2e specs (`tests/e2e/us*.spec.ts`, `about-page.spec.ts`,
`agent-graph-progress.spec.ts`) are updated only where a selector moved
(e.g. a button now inside a `Card`), never for new behavior — per FR-022/
SC-007, no existing real interaction's logic should require a test change.
