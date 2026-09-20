import type { GraphNodeName, RunPathState } from "./graph-progress";
import type { Critique } from "./agent/state";

/**
 * Node-to-tab mapping and tab visibility for the running-session screen's
 * tab strip (spec 006 US3, later extended). Neither `critique` nor
 * `draftRecipe`/`refine` map to one fixed tab — each time the run passes
 * through either, it gets its own numbered tab (`critique-${cycle}`,
 * `draft-${occurrence}`), so a multi-cycle refine loop reads as a sequence
 * of distinct critiques and distinct draft revisions rather than tabs whose
 * content keeps changing underneath the visitor. `ingredientError` has no
 * tab (it's shown as a StageFailureBanner instead).
 */

export type TabId =
  | "ingredients"
  | "directions"
  | "selection"
  | "final"
  | `critique-${number}`
  | `draft-${number}`;

export function critiqueTabId(cycle: number): TabId {
  return `critique-${cycle}`;
}

/** The cycle number encoded in a critique tab's id, or `null` for any other tab. */
export function critiqueCycleOf(id: TabId): number | null {
  if (!id.startsWith("critique-")) return null;
  return Number(id.slice("critique-".length));
}

export function draftTabId(occurrence: number): TabId {
  return `draft-${occurrence}`;
}

/** The 1-indexed occurrence encoded in a draft tab's id (1 = the original
 * `draftRecipe` output, 2+ = each subsequent `refine` revision), or `null`
 * for any other tab. */
export function draftOccurrenceOf(id: TabId): number | null {
  if (!id.startsWith("draft-")) return null;
  return Number(id.slice("draft-".length));
}

/** Every `GraphNodeName` except `critique`/`draftRecipe`/`refine` maps to
 * one fixed tab — those three don't, since each pass through them gets its
 * own numbered tab instead (see module doc). */
export const STAGE_TO_TAB: Partial<Record<GraphNodeName, TabId | null>> = {
  parseIngredients: "ingredients",
  ingredientError: null,
  proposeDirections: "directions",
  selectDirection: "selection",
  finalize: "final",
};

const FIXED_TAB_LABELS: Record<"ingredients" | "directions" | "selection" | "final", string> = {
  ingredients: "Ingredients",
  directions: "Dish directions",
  selection: "Direction selection",
  final: "Final recipe",
};

export function tabLabel(id: TabId): string {
  const critiqueCycle = critiqueCycleOf(id);
  if (critiqueCycle !== null) return `Critique ${critiqueCycle}`;
  const draftOccurrence = draftOccurrenceOf(id);
  if (draftOccurrence !== null) return `Recipe draft ${draftOccurrence}`;
  return FIXED_TAB_LABELS[id as "ingredients" | "directions" | "selection" | "final"];
}

/** The last tab in `visible` matching `kindOf` (e.g. `critiqueCycleOf`,
 * `draftOccurrenceOf`) — used both to resolve a graph-node click to "the
 * newest tab of that kind" and to find which numbered tab is still "live"
 * (its content is `state`'s own current value, not a historical fetch). */
export function latestTabOfKind(visible: TabId[], kindOf: (id: TabId) => number | null): TabId | null {
  for (let i = visible.length - 1; i >= 0; i--) {
    if (kindOf(visible[i]!) !== null) return visible[i]!;
  }
  return null;
}

/** A tab is editable when it's one of the always-editable fixed stages, or
 * it's the *latest* draft tab — an older draft revision is a historical
 * fetch (see `draftTabCheckpoints`), and the app's edit/fork mechanism only
 * ever forks from the live tip, so editing an older revision in place isn't
 * meaningful. Critique tabs are never editable (critiques aren't user
 * input). */
export function isEditableTab(id: TabId, visible: TabId[]): boolean {
  if (id === "ingredients" || id === "directions" || id === "selection") return true;
  if (draftOccurrenceOf(id) !== null) return id === latestTabOfKind(visible, draftOccurrenceOf);
  return false;
}

/** The `visible` list, collapsed to at most one draft tab (the latest) —
 * for the edit-mode stacked view, which (matching `StatePanel.tsx`'s prior
 * behavior of showing exactly one `recipeDraft` value) only ever shows the
 * current draft, never every past revision at once. Critique tabs are kept
 * in full, matching `StatePanel.tsx`'s own prior all-cycles-at-once
 * `critiques` list. */
export function stackableTabs(visible: TabId[]): TabId[] {
  const lastDraft = latestTabOfKind(visible, draftOccurrenceOf);
  return visible.filter((id) => draftOccurrenceOf(id) === null || id === lastDraft);
}

/** Tabs visible so far, in stage order — one tab per stage that has
 * *already produced output* (FR-011), with `critique` and
 * `draftRecipe`/`refine` occurrences each numbered individually.
 * `critiques` (not `path` alone) supplies each critique cycle's real
 * number, since that isn't otherwise recoverable from `takenInOrder`. */
export function visibleTabs(path: RunPathState, critiques: Critique[]): TabId[] {
  const order: TabId[] = [];
  const seen = new Set<TabId>();
  let critiqueOccurrence = 0;
  let draftOccurrence = 0;

  for (const stage of path.takenInOrder) {
    if (stage === "critique") {
      const cycle = critiques[critiqueOccurrence]?.cycle ?? critiqueOccurrence + 1;
      order.push(critiqueTabId(cycle));
      critiqueOccurrence += 1;
      continue;
    }
    if (stage === "draftRecipe" || stage === "refine") {
      draftOccurrence += 1;
      order.push(draftTabId(draftOccurrence));
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

/** Maps each draft tab to the checkpoint whose completion produced it (the
 * `draftRecipe`/`refine` occurrence itself) — used to fetch that specific
 * historical `recipeDraft` value when it isn't the currently-displayed one. */
export function draftTabCheckpoints(path: RunPathState): Partial<Record<TabId, string>> {
  const map: Partial<Record<TabId, string>> = {};
  let draftOccurrence = 0;
  path.takenInOrder.forEach((stage, i) => {
    if (stage === "draftRecipe" || stage === "refine") {
      draftOccurrence += 1;
      const checkpointId = path.takenCheckpoints[i];
      if (checkpointId) map[draftTabId(draftOccurrence)] = checkpointId;
    }
  });
  return map;
}
