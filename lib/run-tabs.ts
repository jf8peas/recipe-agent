import type { GraphNodeName, RunPathState } from "./graph-progress";
import type { Critique } from "./agent/state";

/**
 * Node-to-tab mapping and tab visibility for the running-session screen's
 * tab strip (spec 006 US3). `critique` does NOT map to one fixed tab — each
 * time the run passes through it gets its own tab (`critique-${cycle}`), so
 * a multi-cycle refine loop reads as a sequence of distinct critiques
 * rather than one tab whose content keeps changing underneath the visitor.
 * `refine`'s own output (a revised recipe draft) resurfaces on the same
 * `draft` tab `draftRecipe` already uses, since `recipeDraft` is a single
 * always-overwritten channel, not its own stage output. `ingredientError`
 * has no tab (it's shown as a StageFailureBanner instead).
 */

export type TabId = "ingredients" | "directions" | "selection" | "draft" | "final" | `critique-${number}`;

export function critiqueTabId(cycle: number): TabId {
  return `critique-${cycle}`;
}

/** The cycle number encoded in a critique tab's id, or `null` for any other tab. */
export function critiqueCycleOf(id: TabId): number | null {
  if (!id.startsWith("critique-")) return null;
  return Number(id.slice("critique-".length));
}

export const STAGE_TO_TAB: Partial<Record<GraphNodeName, TabId | null>> = {
  parseIngredients: "ingredients",
  ingredientError: null,
  proposeDirections: "directions",
  selectDirection: "selection",
  draftRecipe: "draft",
  refine: "draft",
  finalize: "final",
};

const FIXED_TAB_LABELS: Record<Exclude<TabId, `critique-${number}`>, string> = {
  ingredients: "Ingredients",
  directions: "Dish directions",
  selection: "Direction selection",
  draft: "Recipe draft",
  final: "Final recipe",
};

export function tabLabel(id: TabId): string {
  const cycle = critiqueCycleOf(id);
  if (cycle !== null) return `Critique ${cycle}`;
  return FIXED_TAB_LABELS[id as Exclude<TabId, `critique-${number}`>];
}

export const EDITABLE_TABS: ReadonlySet<TabId> = new Set(["ingredients", "directions", "selection", "draft"]);

/** Tabs visible so far, in stage order — one tab per stage that has
 * *already produced output* (FR-011), plus one tab per critique cycle that
 * has actually run. `critiques` (not `path` alone) supplies each cycle's
 * real number, since that isn't otherwise recoverable from `takenInOrder`. */
export function visibleTabs(path: RunPathState, critiques: Critique[]): TabId[] {
  const order: TabId[] = [];
  const seen = new Set<TabId>();
  let critiqueOccurrence = 0;

  for (const stage of path.takenInOrder) {
    if (stage === "critique") {
      const cycle = critiques[critiqueOccurrence]?.cycle ?? critiqueOccurrence + 1;
      order.push(critiqueTabId(cycle));
      critiqueOccurrence += 1;
      continue;
    }
    const tab = STAGE_TO_TAB[stage];
    if (tab && !seen.has(tab)) {
      seen.add(tab);
      order.push(tab);
    }
  }

  return order;
}
