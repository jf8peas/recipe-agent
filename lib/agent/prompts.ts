import type {
  Constraints,
  Critique,
  DirectionSelection,
  DishDirection,
  FinalRecipe,
  Ingredient,
  RecipeDraft,
} from "./state";

function constraintsBlock(constraints: Constraints): string {
  const parts: string[] = [];
  if (constraints.cuisine) parts.push(`Cuisine: ${constraints.cuisine}`);
  if (constraints.maxMinutes) parts.push(`Max total time: ${constraints.maxMinutes} minutes`);
  if (constraints.servings) parts.push(`Servings: ${constraints.servings}`);
  if (constraints.diets.length > 0) parts.push(`Dietary needs: ${constraints.diets.join(", ")}`);
  return parts.length > 0 ? parts.join("\n") : "No constraints specified.";
}

export function parseIngredientsPrompt(
  ingredients: Ingredient[],
  constraints: Constraints,
): string {
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

export function proposeDirectionsPrompt(
  ingredients: Ingredient[],
  constraints: Constraints,
): string {
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

export function selectDirectionPrompt(
  ingredients: Ingredient[],
  directions: DishDirection[],
  constraints: Constraints,
): string {
  const usable = ingredients.filter((i) => i.usable);
  return `Given these candidate dish directions, judge which one best fits the
available ingredients and constraints, and is the strongest choice to cook.
Report its index (0-based, in the order listed below), a brief explanation
of why, and whether it was a clear favorite or a close call among equivalent
options.

Constraints:
${constraintsBlock(constraints)}

Usable ingredients:
${usable.map((i) => `- ${i.name ?? i.raw}${i.quantity ? ` (${i.quantity})` : ""}`).join("\n")}

Candidate directions:
${directions.map((d, i) => `${i}. ${d.title} — ${d.summary} (${d.whyItFits})`).join("\n")}

If no candidate is clearly better than the others, that's a valid outcome:
report clearFavorite: false, pick the first-listed candidate (index 0), and
say plainly in the explanation that it was a default pick among equivalent
options — don't invent a confident-sounding reason for it.`;
}

export function draftRecipePrompt(
  ingredients: Ingredient[],
  constraints: Constraints,
  directions: DishDirection[],
  directionSelection: DirectionSelection | null,
): string {
  const usable = ingredients.filter((i) => i.usable);
  // The `?? 0` fallback is solely for a checkpoint that predates this
  // feature, where `directionSelection` is still null (spec FR-014) — a
  // normal run always has a selection by the time drafting runs.
  const chosen = directions[directionSelection?.selectedIndex ?? 0];
  return `Write a full recipe draft for this dish direction, using the
available ingredients.

Constraints:
${constraintsBlock(constraints)}

Dish direction: ${chosen?.title ?? "(unspecified)"} — ${chosen?.summary ?? ""}

Usable ingredients:
${usable.map((i) => `- ${i.name ?? i.raw}${i.quantity ? ` (${i.quantity})` : ""}`).join("\n")}

Produce a title, a servings count, an "ingredients" list (name + quantity)
covering everything the recipe actually uses — including items already
among the ingredients above, with a quantity scaled to the servings count
you chose — an ordered list of steps (each with an estimated time in
minutes where sensible, and a technique name if relevant), and a "toBuy"
list of anything on the ingredients list that isn't already among the
ingredients above.`;
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

export function refinePrompt(
  recipeDraft: RecipeDraft | null,
  latestCritique: Critique | undefined,
): string {
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

Keep the draft's "ingredients" list as the same items, adjusting each
quantity only if you scaled the servings — do not drop or invent
ingredients. Keep the "toBuy" list as-is the same way — same items, same
wording, quantities adjusted only if scaling changed them. Do not drop
items from it and do not invent new ones; if the draft's list is empty,
the finalized recipe's should be empty too.

Constraints:
${constraintsBlock(constraints)}

Recipe draft:
${JSON.stringify(recipeDraft, null, 2)}`;
}

/** Feature 007 — `finalize`'s second call (MODELS.image, not MODELS.default;
 * see contracts/finalize-node.md). Not wrapped in `withStructuredOutput()`
 * (research R2: combining that with image-output modality isn't confirmed
 * to work), so the crop comes back as plain accompanying text the node
 * parses and validates itself, not as a schema-constrained field. */
export function dishImagePrompt(finalRecipe: FinalRecipe): string {
  return `Generate one photo-realistic photograph of this finished dish, as it
would appear plated and ready to eat — no illustration, no text or logos in
the image.

Dish: ${finalRecipe.title}
Steps: ${finalRecipe.steps.map((s) => s.text).join(" ")}
${finalRecipe.toBuy.length > 0 ? `Still needed: ${finalRecipe.toBuy.join(", ")}` : ""}

Along with the image, reply with a short line of plain JSON (nothing else)
naming the single most appetizing point to crop a thumbnail around — the
food itself, a glossy highlight, or a garnish, never the plate's edge or
the empty table around it:
{"focalX": <0-1, left-to-right>, "focalY": <0-1, top-to-bottom>, "zoom": <optional, >=1>}`;
}
