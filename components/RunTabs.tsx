import type { Constraints, DishDirection, Ingredient, RecipeDraft, State } from "@/lib/agent/state";
import { IngredientsEditor } from "@/components/fields/IngredientsEditor";
import { ConstraintsEditor } from "@/components/fields/ConstraintsEditor";
import { DirectionsEditor } from "@/components/fields/DirectionsEditor";
import { RecipeDraftEditor } from "@/components/fields/RecipeDraftEditor";
import { CritiqueView } from "@/components/fields/CritiqueView";
import { FinalRecipeView } from "@/components/fields/FinalRecipeView";
import { DirectionSelectionEditor } from "@/components/fields/DirectionSelectionEditor";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EDITABLE_TABS, critiqueCycleOf, tabLabel, type TabId } from "@/lib/run-tabs";
import type { EditableField } from "@/lib/field-consumers";

export interface RunTabsProps {
  activeTab: TabId;
  state: State;
  /** Already in edit mode (spec 006 US3) — when true, the tab body's own
   * field editor renders editable and no "Edit this stage" link shows
   * (the existing global Cancel/Try-this-version controls in the sticky
   * action row cover it, exactly as `StatePanel.tsx` did before). */
  editable: boolean;
  onFieldChange?: (field: EditableField, value: unknown, error: string | null) => void;
  /** Wired to the app's existing edit-start handler (`ActionToolbar`'s own
   * "Edit" button today) — this is not new functionality, just a second,
   * per-tab entry point into the same global edit mode (research R1). */
  onEditThisStage: () => void;
}

/**
 * One tab body per `TabId` (spec 006 US3) — replaces `StatePanel.tsx`'s
 * all-sections-stacked layout with one-at-a-time content behind the tab
 * strip. Every field editor (`components/fields/*`) is reused completely
 * unchanged; this component only decides which one shows and wraps it in
 * the shared `Card` primitive.
 */
export function RunTabs({ activeTab, state, editable, onFieldChange, onEditThisStage }: RunTabsProps) {
  const showEditLink = !editable && EDITABLE_TABS.has(activeTab);
  // The Tabs strip already shows tabLabel()'s own wording ("Direction
  // selection") as the clickable tab name — the content heading below
  // keeps `StatePanel.tsx`'s prior wording ("Direction selected",
  // describing the outcome) since existing e2e tests scope by it; every
  // other tab's old heading text already equals its tabLabel().
  const contentHeading = activeTab === "selection" ? "Direction selected" : tabLabel(activeTab);
  const critiqueCycle = critiqueCycleOf(activeTab);
  const critique = critiqueCycle !== null ? state.critiques.find((c) => c.cycle === critiqueCycle) : undefined;

  return (
    <Card heading={contentHeading}>
      {activeTab === "ingredients" && (
        <>
          <IngredientsEditor
            ingredients={state.ingredients}
            editable={editable}
            onChange={
              editable && onFieldChange
                ? (value: Ingredient[]) => onFieldChange("ingredients", value, null)
                : undefined
            }
          />
          <ConstraintsEditor
            constraints={state.constraints}
            editable={editable}
            onChange={
              editable && onFieldChange
                ? (value: Constraints) => onFieldChange("constraints", value, null)
                : undefined
            }
          />
        </>
      )}

      {activeTab === "directions" && (
        <DirectionsEditor
          directions={state.directions}
          editable={editable}
          onChange={
            editable && onFieldChange
              ? (value: DishDirection[] | null, error: string | null) => onFieldChange("directions", value, error)
              : undefined
          }
        />
      )}

      {activeTab === "selection" && state.directionSelection && (
        <DirectionSelectionEditor
          directionSelection={state.directionSelection}
          directions={state.directions}
          editable={editable}
          onChange={editable && onFieldChange ? (value, error) => onFieldChange("directionSelection", value, error) : undefined}
        />
      )}

      {activeTab === "draft" && state.recipeDraft && (
        <RecipeDraftEditor
          recipeDraft={state.recipeDraft}
          editable={editable}
          onChange={
            editable && onFieldChange
              ? (value: RecipeDraft | null, error: string | null) => onFieldChange("recipeDraft", value, error)
              : undefined
          }
        />
      )}

      {critique && <CritiqueView critique={critique} />}

      {activeTab === "final" && state.finalRecipe && <FinalRecipeView finalRecipe={state.finalRecipe} />}

      {showEditLink && (
        <div>
          <Button variant="link" onClick={onEditThisStage}>
            Edit this stage
          </Button>
        </div>
      )}
    </Card>
  );
}
