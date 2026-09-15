import { useState } from "react";
import type { Ingredient } from "@/lib/agent/state";
import { toRawIngredient } from "@/lib/agent/state";

const REASON_LABELS: Record<NonNullable<Ingredient["reason"]>, string> = {
  "not-food": "not a food item",
  unintelligible: "couldn't understand this",
  duplicate: "duplicate of another line",
  other: "not usable",
};

interface IngredientsEditorProps {
  ingredients: Ingredient[];
  editable?: boolean;
  onChange?: (ingredients: Ingredient[]) => void;
}

/** Ingredients view/editor (spec FR-022/FR-023/FR-024/FR-043). Editing re-enters
 * the graph at `parseIngredients` (its consumer), so an edit is just the raw
 * text — the next step re-classifies it for real. */
export function IngredientsEditor({ ingredients, editable, onChange }: IngredientsEditorProps) {
  const [raw, setRaw] = useState(() => ingredients.map((i) => i.raw).join("\n"));

  if (!editable || !onChange) {
    return (
      <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {ingredients.map((ingredient, index) => (
          <li key={index}>
            {ingredient.usable ? (
              <>
                {ingredient.name ?? ingredient.raw}
                {ingredient.quantity ? ` (${ingredient.quantity})` : ""}
                {ingredient.pantryStaple && (
                  <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}> — pantry staple</span>
                )}
              </>
            ) : (
              <span>
                <span style={{ color: "var(--color-kind-ingredient-error)" }} aria-hidden="true">
                  !{" "}
                </span>
                &ldquo;{ingredient.raw}&rdquo;
                <span style={{ color: "var(--color-text-muted)" }}>
                  {" "}
                  — {ingredient.reason ? REASON_LABELS[ingredient.reason] : "not usable"}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <textarea
      aria-label="Ingredients (one per line)"
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        const lines = e.target.value.split("\n").map((line) => line.trim()).filter(Boolean);
        onChange(lines.map(toRawIngredient));
      }}
      rows={Math.max(3, ingredients.length)}
      style={{
        width: "100%",
        padding: "var(--space-2)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-surface)",
        color: "var(--color-text)",
        font: "inherit",
        resize: "vertical",
      }}
    />
  );
}
