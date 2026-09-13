import type { State } from "./state";

/** `parseIngredients` → `ingredientError` | `proposeDirections` (data-model.md § 1). */
export function routeAfterParseIngredients(state: State): "ingredientError" | "proposeDirections" {
  return state.ingredients.some((i) => !i.usable) ? "ingredientError" : "proposeDirections";
}

/** `critique` → `refine` | `finalize`, bounded by `MAX_REFINE_CYCLES` (data-model.md § 1). */
export function routeAfterCritique(state: State): "refine" | "finalize" {
  const maxRefineCycles = Number(process.env.MAX_REFINE_CYCLES ?? 2);
  const latest = state.critiques[state.critiques.length - 1];
  const blocking = latest?.blocking ?? false;
  if (blocking && state.refineCount < maxRefineCycles) return "refine";
  return "finalize";
}
