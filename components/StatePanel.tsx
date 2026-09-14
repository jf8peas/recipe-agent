import type { CSSProperties } from "react";
import type { State } from "@/lib/agent/state";

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

/** Minimal read-only view of the current Graph State (spec FR-022). Per-field
 * editors (IngredientsEditor, ConstraintsEditor, ...) replace this over time. */
export function StatePanel({ state }: { state: State }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {state.outcome === "ingredient-error" && (
        <div style={sectionStyle}>
          <h3 style={{ ...headingStyle, color: "var(--color-kind-ingredient-error)" }}>
            Ingredient problem
          </h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            {state.ingredients
              .filter((i) => !i.usable)
              .map((i, idx) => (
                <li key={idx}>
                  “{i.raw}” — {i.reason ?? "not usable"}
                </li>
              ))}
          </ul>
        </div>
      )}

      {state.ingredients.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Ingredients</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            {state.ingredients.map((i, idx) => (
              <li key={idx}>
                {i.name ?? i.raw}
                {i.quantity ? ` (${i.quantity})` : ""}
                {!i.usable ? " — not usable" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.directions.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Dish directions</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            {state.directions.map((d, idx) => (
              <li key={idx}>
                <strong>{d.title}</strong> — {d.summary}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.recipeDraft && !state.finalRecipe && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Recipe draft</h3>
          <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600 }}>{state.recipeDraft.title}</p>
          <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--text-sm)" }}>
            Serves {state.recipeDraft.servings}
          </p>
          <ol style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            {state.recipeDraft.steps.map((s) => (
              <li key={s.order}>
                {s.text}
                {s.minutes ? ` (${s.minutes} min)` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}

      {state.finalRecipe && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Final recipe</h3>
          <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600 }}>{state.finalRecipe.title}</p>
          <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--text-sm)" }}>
            Serves {state.finalRecipe.scaledServings}
          </p>
          <ol style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            {state.finalRecipe.steps.map((s) => (
              <li key={s.order}>
                {s.text}
                {s.minutes ? ` (${s.minutes} min)` : ""}
              </li>
            ))}
          </ol>
          <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            ~{state.finalRecipe.nutrition.calories} kcal, {state.finalRecipe.nutrition.protein}g protein,{" "}
            {state.finalRecipe.nutrition.carbs}g carbs, {state.finalRecipe.nutrition.fat}g fat per serving
            (approximate)
          </p>
        </div>
      )}

      {state.critiques.length > 0 && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Critique</h3>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            {state.critiques.map((c) => (
              <li key={c.cycle}>
                Cycle {c.cycle}: {c.feasibility} / {c.flavorBalance}
                {c.missingOrUnclear.length > 0 ? ` — missing: ${c.missingOrUnclear.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.outcome === "stage-failure" && (
        <div style={sectionStyle}>
          <h3 style={{ ...headingStyle, color: "var(--color-kind-stage-failure)" }}>Stage failed</h3>
          <p style={{ margin: 0 }}>{state.failureReason}</p>
        </div>
      )}
    </div>
  );
}
