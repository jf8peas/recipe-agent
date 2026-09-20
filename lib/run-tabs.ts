import type { GraphNodeName, RunPathState } from "./graph-progress";

/**
 * Node-to-tab mapping and tab visibility for the running-session screen's
 * tab strip (spec 006 US3) — `critique` and `refine` share one "Critique"
 * tab (a refine loop revisits the critique/refine pair, not a new stage);
 * `ingredientError` has no tab (it's shown as a StageFailureBanner instead).
 */

export type TabId = "ingredients" | "directions" | "selection" | "draft" | "critique" | "final";

export const STAGE_TO_TAB: Record<GraphNodeName, TabId | null> = {
  parseIngredients: "ingredients",
  ingredientError: null,
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

export const EDITABLE_TABS: ReadonlySet<TabId> = new Set([
  "ingredients",
  "directions",
  "selection",
  "draft",
]);

/** Tabs visible so far, in stage order — one tab per stage that has
 * *already produced output* (FR-011), derived from the run's own taken
 * path, never a separately-tracked list. Deliberately excludes
 * `path.current` — the stage that's about to run/is running has no output
 * yet, so it gets no tab (matches `StatePanel.tsx`'s old conditional
 * rendering, e.g. `state.directions.length > 0`, which this replaces). */
export function visibleTabs(path: RunPathState): TabId[] {
  const seen = new Set<TabId>();
  const order: TabId[] = [];

  for (const stage of path.takenInOrder) {
    const tab = STAGE_TO_TAB[stage];
    if (tab && !seen.has(tab)) {
      seen.add(tab);
      order.push(tab);
    }
  }

  return order;
}
