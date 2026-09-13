import type { State } from "./agent/state";

/**
 * Maps each editable Graph State channel to the node that consumes it
 * (data-model.md § 1). Used by fork/edit validation (spec FR-025a): editing a
 * field re-enters the graph at its consumer node, not necessarily the node
 * that produced it.
 */
export const FIELD_CONSUMERS = {
  ingredients: "parseIngredients",
  constraints: "proposeDirections",
  directions: "draftRecipe",
  recipeDraft: "critique",
  critiques: "refine",
  finalRecipe: "finalize",
} as const satisfies Partial<Record<keyof State, string>>;

export type EditableField = keyof typeof FIELD_CONSUMERS;

export const EDITABLE_FIELDS: ReadonlySet<EditableField> = new Set(
  Object.keys(FIELD_CONSUMERS) as EditableField[],
);
