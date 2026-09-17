import { z } from "zod";
import type { State } from "./agent/state";
import {
  IngredientSchema,
  ConstraintsSchema,
  DishDirectionSchema,
  DirectionSelectionSchema,
  RecipeDraftSchema,
  CritiqueSchema,
  FinalRecipeSchema,
} from "./agent/state";

/**
 * Maps each editable Graph State channel to the node that consumes it
 * (data-model.md § 1). Used by fork/edit validation (spec FR-025a): editing a
 * field re-enters the graph at its consumer node, not necessarily the node
 * that produced it.
 */
export const FIELD_CONSUMERS = {
  ingredients: "parseIngredients",
  constraints: "proposeDirections",
  directions: "selectDirection",
  directionSelection: "draftRecipe",
  recipeDraft: "critique",
  critiques: "refine",
  finalRecipe: "finalize",
} as const satisfies Partial<Record<keyof State, string>>;

export type EditableField = keyof typeof FIELD_CONSUMERS;

export const EDITABLE_FIELDS: ReadonlySet<EditableField> = new Set(
  Object.keys(FIELD_CONSUMERS) as EditableField[],
);

/** Per-field Zod schema for validating a `/fork` patch (spec FR-024) — an
 * edit replaces the whole channel value, so the schema matches the channel
 * type exactly (an array field's schema is the array, not one element). */
export const FIELD_SCHEMAS = {
  ingredients: z.array(IngredientSchema),
  constraints: ConstraintsSchema,
  directions: z.array(DishDirectionSchema).min(1),
  directionSelection: DirectionSelectionSchema,
  recipeDraft: RecipeDraftSchema,
  critiques: z.array(CritiqueSchema),
  finalRecipe: FinalRecipeSchema,
} as const satisfies Record<EditableField, z.ZodType>;

/** Graph stage order, earliest first — used to pick the earliest
 * `FIELD_CONSUMERS` stage among several changed fields (research R3 step 2). */
const STAGE_ORDER = [
  "parseIngredients",
  "proposeDirections",
  "selectDirection",
  "draftRecipe",
  "critique",
  "refine",
  "finalize",
] as const;

export function earliestReplayStage(fields: readonly EditableField[]): string {
  const stages = fields.map((field) => FIELD_CONSUMERS[field]);
  return [...stages].sort(
    (a, b) => STAGE_ORDER.indexOf(a as never) - STAGE_ORDER.indexOf(b as never),
  )[0]!;
}
