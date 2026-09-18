import type { State } from "./agent/state";

function directionTitle(state: State): string | null {
  const selection = state.directionSelection;
  if (!selection) return null;
  return state.directions[selection.selectedIndex]?.title ?? null;
}

/**
 * The session title as of one specific stage's completion — used right
 * after a `/step` (or `/step/commit`) call, gated on which stage the graph
 * just ran. A session is untitled until `selectDirection` first runs, then
 * gets progressively more accurate: the chosen dish direction's title,
 * then the drafted recipe's own title, then the finalized one.
 */
export function titleForStage(stage: string, state: State): string | null {
  switch (stage) {
    case "selectDirection":
      return directionTitle(state);
    case "draftRecipe":
      return state.recipeDraft?.title ?? null;
    case "finalize":
      return state.finalRecipe?.title ?? null;
    default:
      return null;
  }
}

/**
 * The best title available in `state`, regardless of which stage most
 * recently produced it — used after `/fork`, where an edit patch can jump
 * straight to any of the three title-bearing fields rather than arriving
 * one stage at a time. A finalized recipe's own title always wins over an
 * in-progress draft's, which always wins over the dish direction it
 * started from — later stages' titles are strictly more accurate.
 */
export function bestAvailableTitle(state: State): string | null {
  return state.finalRecipe?.title ?? state.recipeDraft?.title ?? directionTitle(state) ?? null;
}
