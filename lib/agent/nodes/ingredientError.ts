import type { State } from "../state";

/** No model call: sets the terminal ingredient-error outcome (spec FR-042/FR-043). */
export async function ingredientError(_state: State): Promise<Partial<State>> {
  return { outcome: "ingredient-error" };
}
