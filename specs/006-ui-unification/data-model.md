# Phase 1 Data Model: UI Unification

No graph state channel, database table, or API contract changes — this is a
presentation/layout feature over already-correct, already-implemented data
(feature 005's `RunPathState`, `useSession`'s real state, `useSessionList`'s
real entries). "Data model" here means the shape of the new primitives, the
graph's new layout geometry, and the tabs' derivation logic.

---

## 1. `components/ui/` primitives

```ts
// Button.tsx
export type ButtonVariant = "primary" | "secondary" | "link";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; // default "primary"
}

// Card.tsx
export interface CardProps {
  heading?: string;
  children: ReactNode;
  style?: CSSProperties;
}

// ListRow.tsx
export interface ListRowProps {
  title: string;
  subtitle: string;
  onOpen: () => void;
  onDelete: () => void;
  deleteLabel: string; // e.g. `Delete session ${title}` — caller-supplied, matches SessionList.tsx's existing aria-label convention
}

// TextArea.tsx
export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

// Spinner.tsx
// No props — extracted from RunningStage.tsx's existing inline spinner markup + @keyframes.

// Toggle.tsx
export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}
```

Every prop shape is a direct match for how each primitive is actually called
across the touched screens (research R1/R4) — no speculative extra options.

---

## 2. Unified header

```ts
export type HeaderMode = "app" | "about";

export interface AppHeaderProps {
  mode: HeaderMode;
  // "app" mode:
  pauseBetweenStages?: boolean;
  onTogglePause?: (next: boolean) => void;
  onOpenAbout?: () => void;
  // "about" mode:
  onReturn?: () => void;
}
```

One component, `components/AppHeader.tsx` (path unchanged — the file's own
content is replaced, not moved), rendered from both `app/layout.tsx` (mode
`"app"`, unchanged call site) and `components/about/AboutPage.tsx` (mode
`"about"`, replacing that file's own inline `<header>` block). The "about"
mode's topic nav is unchanged from feature 004 — this component only gains
the mode switch and the shared visual shell.

---

## 3. Agent graph: new layout geometry, same derived state

`lib/graph-progress.ts`'s `GraphNodeName`, `NodeVisualState`, `RunPathState`,
and `deriveRunPath` (feature 005) are **unchanged** — this feature only
changes `GRAPH_NODES`/`DECISION_POINTS`'s coordinate *values* (and adds one
new field) to describe the two-row layout instead of the single main row:

```ts
export interface GraphNodeLayout {
  name: GraphNodeName;
  kind: "node" | "terminal";
  x: number;
  y: number;
  /** NEW: which logical row this node sits in — row 1 is the
   * parseIngredients..selectDirection sequence, row 2 (directly below) is
   * draftRecipe..finalize, visually reversed left-to-right so the join
   * connector between them is a short vertical drop, not a line crossing
   * back over the whole diagram width. */
  row: 1 | 2;
}
```

`DECISION_POINTS`'s shape is unchanged (`after`, `routesTo`) — only `x`/`y`
move to sit inline within their new row. No new decision point, no new node:
still exactly 8 `GraphNodeName`s, 2 decision points, 8 `GraphEdge`s.

The join connector (`selectDirection` → `draftRecipe`, row 1 → row 2) and
each decision point's dashed dead-end branch (`ingredientError` below
`usable?`, `refine` below `blocking?`, plus its diagonal loop-back edge to
`critique`) are **rendering-only** additions in `components/
AgentGraphProgress.tsx` — they read `RunPathState.edges`/`nodes` exactly as
today, just draw a different path shape for the two connectors that aren't a
straight same-row line.

---

## 4. Running-session tabs

```ts
export type TabId = "ingredients" | "directions" | "selection" | "draft" | "critique" | "final";

export const STAGE_TO_TAB: Record<GraphNodeName, TabId | null> = {
  parseIngredients: "ingredients",
  ingredientError: null, // terminal outcome, no tab — its own outcome messaging stays where it is today
  proposeDirections: "directions",
  selectDirection: "selection",
  draftRecipe: "draft",
  critique: "critique",
  refine: "critique",
  finalize: "final",
};

export const TAB_LABELS: Record<TabId, string> = {
  ingredients: "Ingredients",
  directions: "Dish directions",
  selection: "Direction selection",
  draft: "Recipe draft",
  critique: "Critique",
  final: "Final recipe",
};

export const EDITABLE_TABS: ReadonlySet<TabId> = new Set(["ingredients", "directions", "selection", "draft"]);
```

**Visible tabs** (derived every render, not stored):

```ts
function visibleTabs(path: RunPathState): TabId[] {
  const seen = new Set<TabId>();
  const order: TabId[] = [];
  for (const stage of path.takenInOrder) {
    const tab = STAGE_TO_TAB[stage];
    if (tab && !seen.has(tab)) { seen.add(tab); order.push(tab); }
  }
  return order; // already in TAB_LABELS' natural order, since takenInOrder is
                // graph-flow ordered (lib/graph-progress.ts) and STAGE_TO_TAB
                // never maps a later stage to an earlier tab
}
```

**Implementation correction (found during T018 implementation)**: an earlier
draft of this sketch also added `path.current`'s tab to the visible set.
That contradicts FR-011 ("one tab per stage that has *already produced
output*, appearing as each stage completes") and FR-013 ("default to the
most recently *completed* stage") — both explicitly exclude the
in-progress stage, matching `StatePanel.tsx`'s own prior conditional
rendering (e.g. `state.directions.length > 0`). The real
`lib/run-tabs.ts` omits the `path.current` branch entirely.

**New local state** in `app/page.tsx`: `const [activeTab, setActiveTab] = useState<TabId | null>(null);`
— exactly one new state variable for this whole feature's interaction model.

```ts
const previousVisibleCount = useRef(0);
useEffect(() => {
  const tabs = visibleTabs(path);
  const grew = tabs.length > previousVisibleCount.current;
  if (grew || !activeTab || !tabs.includes(activeTab)) setActiveTab(tabs[tabs.length - 1] ?? null);
  previousVisibleCount.current = tabs.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [visibleTabs(path).join(",")]); // re-fires only when the *set* of visible tabs changes
```

**Implementation correction (found during T018 implementation)**: an
earlier draft of this sketch only reset `activeTab` when it dropped out of
the visible set, never when a new stage completed while the visitor was
still on an *earlier* (still-visible) tab. That silently violated FR-013's
"defaults to the most recently completed stage" — completing a new stage
must jump the selection forward regardless of where the visitor had
navigated; only leave it alone on an unchanged or shrinking set. The real
`app/page.tsx` tracks the previous tab count in a `ref` to detect growth.

**Node ↔ tab sync**: clicking a graph node calls `setActiveTab(STAGE_TO_TAB[nodeName])` (a no-op if that tab isn't visible yet — matches `design_files/RunningSession.jsx`'s own `handleSelectNode` guard). The graph's `selectedId` prop is computed the other direction: the first `GraphNodeName` whose `STAGE_TO_TAB` entry equals `activeTab` and whose `RunPathState.nodes` state is `current` if any such node is current, else the first match — this resolves `critique`/`refine` sharing one tab (research R5) by preferring whichever of the two is actually the live node.

---

## 5. About page

No new data shape — `components/about/AboutPage.tsx` keeps its own existing
`RunPathState`-free, purely-illustrative content (feature 004). Only its
`<header>` block (→ `AppHeader mode="about"`) and its scroll container's
inline styles change.
