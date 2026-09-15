import type { CSSProperties } from "react";
import type { Constraints, DishDirection, Ingredient, RecipeDraft, State } from "@/lib/agent/state";
import { IngredientsEditor } from "@/components/fields/IngredientsEditor";
import { ConstraintsEditor } from "@/components/fields/ConstraintsEditor";
import { DirectionsEditor } from "@/components/fields/DirectionsEditor";
import { RecipeDraftEditor } from "@/components/fields/RecipeDraftEditor";
import { CritiquesView } from "@/components/fields/CritiquesView";
import { FinalRecipeView } from "@/components/fields/FinalRecipeView";
import type { EditableField } from "@/lib/field-consumers";

const sectionStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-4)",
  background: "var(--color-surface)",
};
const headingStyle: CSSProperties = {
  margin: "0 0 var(--space-2) 0",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export interface StatePanelProps {
  state: State;
  /** Enables inline editing of ingredients/constraints/directions/recipeDraft
   * (spec FR-023/FR-024) — the fields `/fork` accepts a patch for, per T079's
   * scope (critiques/finalRecipe stay read-only in this UI). */
  editable?: boolean;
  onFieldChange?: (field: EditableField, value: unknown, error: string | null) => void;
}

/** Read-only (or, with `editable`, editable) view of the current Graph State
 * (spec FR-022), dispatching to a per-field component for each channel. */
export function StatePanel({ state, editable, onFieldChange }: StatePanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {state.ingredients.length > 0 && (
        <div style={sectionStyle}>
          <h3
            style={
              state.outcome === "ingredient-error"
                ? { ...headingStyle, color: "var(--color-kind-ingredient-error)" }
                : headingStyle
            }
          >
            Ingredients
          </h3>
          <IngredientsEditor
            ingredients={state.ingredients}
            editable={editable}
            onChange={
              editable && onFieldChange
                ? (value: Ingredient[]) => onFieldChange("ingredients", value, null)
                : undefined
            }
          />
        </div>
      )}

      {(editable ||
        state.constraints.cuisine ||
        state.constraints.maxMinutes ||
        state.constraints.servings ||
        state.constraints.diets.length > 0) && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Constraints</h3>
          <ConstraintsEditor
            constraints={state.constraints}
            editable={editable}
            onChange={
              editable && onFieldChange
                ? (value: Constraints) => onFieldChange("constraints", value, null)
                : undefined
            }
          />
        </div>
      )}

      {(state.directions.length > 0 || editable) && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Dish directions</h3>
          <DirectionsEditor
            directions={state.directions}
            editable={editable}
            onChange={
              editable && onFieldChange
                ? (value: DishDirection[] | null, error: string | null) =>
                    onFieldChange("directions", value, error)
                : undefined
            }
          />
        </div>
      )}

      {state.recipeDraft && !state.finalRecipe && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Recipe draft</h3>
          <RecipeDraftEditor
            recipeDraft={state.recipeDraft}
            editable={editable}
            onChange={
              editable && onFieldChange
                ? (value: RecipeDraft | null, error: string | null) =>
                    onFieldChange("recipeDraft", value, error)
                : undefined
            }
          />
        </div>
      )}

      {state.finalRecipe && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Final recipe</h3>
          <FinalRecipeView finalRecipe={state.finalRecipe} />
        </div>
      )}

      {state.critiques.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Critique</h3>
          <CritiquesView critiques={state.critiques} />
        </div>
      )}
    </div>
  );
}
