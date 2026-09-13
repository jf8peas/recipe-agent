import type { Constraints, Critique, DishDirection, Ingredient, RecipeDraft } from "./state";

function constraintsBlock(constraints: Constraints): string {
  const parts: string[] = [];
  if (constraints.cuisine) parts.push(`Cuisine: ${constraints.cuisine}`);
  if (constraints.maxMinutes) parts.push(`Max total time: ${constraints.maxMinutes} minutes`);
  if (constraints.servings) parts.push(`Servings: ${constraints.servings}`);
  if (constraints.diets.length > 0) parts.push(`Dietary needs: ${constraints.diets.join(", ")}`);
  return parts.length > 0 ? parts.join("\n") : "No constraints specified.";
}

export function parseIngredientsPrompt(ingredients: Ingredient[], constraints: Constraints): string {
  return `You are a culinary assistant. Classify each raw ingredient line a home
cook typed. For each, decide if it's usable to cook with, normalize its name
and quantity if possible, and flag whether it's a common pantry staple
(salt, oil, water, etc.).

Constraints:
${constraintsBlock(constraints)}

Raw ingredient lines (one per item, preserve order):
${ingredients.map((r, i) => `${i + 1}. ${r.raw}`).join("\n")}

For each unusable item, set usable: false and reason to one of:
"not-food" (not an edible ingredient), "unintelligible" (can't tell what it is),
"duplicate" (repeats an earlier line), or "other".`;
}

export function proposeDirectionsPrompt(ingredients: Ingredient[], constraints: Constraints): string {
  const usable = ingredients.filter((i) => i.usable);
  return `Given these usable ingredients, propose 2-3 distinct dish directions
(different styles/cuisines/techniques) that make good use of them.

Constraints:
${constraintsBlock(constraints)}

Usable ingredients:
${usable.map((i) => `- ${i.name ?? i.raw}${i.quantity ? ` (${i.quantity})` : ""}`).join("\n")}

For each direction give a short title, a 1-2 sentence summary, and a brief
note on why it fits the ingredients and constraints.`;
}

export function draftRecipePrompt(
  ingredients: Ingredient[],
  constraints: Constraints,
  directions: DishDirection[],
): string {
  const usable = ingredients.filter((i) => i.usable);
  const chosen = directions[0];
  return `Write a full recipe draft for this dish direction, using the
available ingredients.

Constraints:
${constraintsBlock(constraints)}

Dish direction: ${chosen?.title ?? "(unspecified)"} — ${chosen?.summary ?? ""}

Usable ingredients:
${usable.map((i) => `- ${i.name ?? i.raw}${i.quantity ? ` (${i.quantity})` : ""}`).join("\n")}

Produce a title, a servings count, an ordered list of steps (each with an
estimated time in minutes where sensible, and a technique name if relevant),
and a "toBuy" list of anything needed but not among the ingredients above.`;
}

export function critiquePrompt(
  recipeDraft: RecipeDraft | null,
  constraints: Constraints,
  priorCritiques: Critique[],
): string {
  return `Critique this recipe draft as an experienced chef. Judge whether the
steps are feasible as written, whether the flavors balance, and list anything
missing or unclear. Set blocking: true only if the recipe has a real problem
that must be fixed before it's servable (not just stylistic preference).

Constraints:
${constraintsBlock(constraints)}

This is critique cycle ${priorCritiques.length + 1}.

Recipe draft:
${JSON.stringify(recipeDraft, null, 2)}`;
}

export function refinePrompt(recipeDraft: RecipeDraft | null, latestCritique: Critique | undefined): string {
  return `Revise this recipe draft to address the critique below. Keep what
already works; only change what the critique calls out.

Recipe draft:
${JSON.stringify(recipeDraft, null, 2)}

Critique to address:
${JSON.stringify(latestCritique, null, 2)}`;
}

export function finalizePrompt(recipeDraft: RecipeDraft | null, constraints: Constraints): string {
  return `Finalize this recipe: scale it to the requested servings (if given),
polish the wording, and produce an approximate nutrition estimate per serving
(calories, protein, carbs, fat). Nutrition figures are estimates, not lab
measurements.

Constraints:
${constraintsBlock(constraints)}

Recipe draft:
${JSON.stringify(recipeDraft, null, 2)}`;
}
