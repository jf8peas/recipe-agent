import { z } from "zod";

// --- Sub-schemas (data-model.md § 1) ---------------------------------------

export const IngredientSchema = z.object({
  raw: z.string(),
  name: z.string().nullable(),
  quantity: z.string().nullable(),
  pantryStaple: z.boolean(),
  usable: z.boolean(),
  reason: z.enum(["not-food", "unintelligible", "duplicate", "other"]).nullable(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const ConstraintsSchema = z.object({
  cuisine: z.string().nullable(),
  maxMinutes: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  diets: z.array(z.string()),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const DishDirectionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  whyItFits: z.string(),
});
export type DishDirection = z.infer<typeof DishDirectionSchema>;

export const RecipeStepSchema = z.object({
  order: z.number().int().positive(),
  text: z.string(),
  minutes: z.number().nonnegative().nullable(),
  technique: z.string().nullable(),
});
export type RecipeStep = z.infer<typeof RecipeStepSchema>;

export const RecipeDraftSchema = z.object({
  title: z.string(),
  servings: z.number().int().positive(),
  steps: z.array(RecipeStepSchema),
  toBuy: z.array(z.string()),
});
export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

export const CritiqueSchema = z.object({
  cycle: z.number().int().nonnegative(),
  feasibility: z.string(),
  flavorBalance: z.string(),
  missingOrUnclear: z.array(z.string()),
  blocking: z.boolean(),
});
export type Critique = z.infer<typeof CritiqueSchema>;

export const NutritionSchema = z.object({
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  note: z.literal("approximate"),
});
export type Nutrition = z.infer<typeof NutritionSchema>;

export const FinalRecipeSchema = RecipeDraftSchema.extend({
  scaledServings: z.number().int().positive(),
  nutrition: NutritionSchema,
});
export type FinalRecipe = z.infer<typeof FinalRecipeSchema>;

export const OutcomeSchema = z.enum([
  "in-progress",
  "finalized",
  "ingredient-error",
  "stage-failure",
]);
export type Outcome = z.infer<typeof OutcomeSchema>;

// --- Graph state -------------------------------------------------------
//
// This is a plain data/schema module — no `@langchain/langgraph` import here,
// so client components can import it without pulling LangGraph into the
// browser bundle. The `Annotation.Root` definition (every channel a plain
// last-value-wins Annotation, so `updateState` can overwrite any field on
// edit — constitution Principle IV, spec FR-025) lives in `lib/agent/graph.ts`,
// the only place it's needed, built from the `State` type defined here.

export const StateSchema = z.object({
  ingredients: z.array(IngredientSchema),
  constraints: ConstraintsSchema,
  directions: z.array(DishDirectionSchema),
  recipeDraft: RecipeDraftSchema.nullable(),
  critiques: z.array(CritiqueSchema),
  finalRecipe: FinalRecipeSchema.nullable(),
  refineCount: z.number().int().nonnegative(),
  outcome: OutcomeSchema,
  failureReason: z.string().nullable(),
});

export type State = z.infer<typeof StateSchema>;

/** Seeds a Graph State ingredient from a raw user-typed line, pending `parseIngredients` classification. */
export function toRawIngredient(raw: string): Ingredient {
  return { raw, name: null, quantity: null, pantryStaple: false, usable: true, reason: null };
}

export const INITIAL_STATE: State = {
  ingredients: [],
  constraints: { cuisine: null, maxMinutes: null, servings: null, diets: [] },
  directions: [],
  recipeDraft: null,
  critiques: [],
  finalRecipe: null,
  refineCount: 0,
  outcome: "in-progress",
  failureReason: null,
};
