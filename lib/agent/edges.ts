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

/** True when `finalize` was reached with the latest critique still
 * `blocking` — the only way `routeAfterCritique` above sends a still-blocking
 * draft to `finalize` instead of `refine` is `refineCount` having already hit
 * `MAX_REFINE_CYCLES`. Surfaced on the final recipe tab so it's clear the
 * recipe wasn't approved outright — the cycle cap (there to bound token
 * spend) was hit while a real issue was still flagged. */
export function finalizedAtRefineLimit(state: State): boolean {
  if (state.outcome !== "finalized") return false;
  const latest = state.critiques[state.critiques.length - 1];
  return latest?.blocking ?? false;
}
