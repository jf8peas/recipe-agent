import type { FinalRecipe } from "@/lib/agent/state";

/** Read-only final recipe view (spec FR-022, FR-016) — includes the approximate nutrition estimate. */
export function FinalRecipeView({ finalRecipe }: { finalRecipe: FinalRecipe }) {
  return (
    <>
      <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600 }}>{finalRecipe.title}</p>
      <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--text-sm)" }}>
        Serves {finalRecipe.scaledServings}
      </p>
      <ol style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
        {finalRecipe.steps.map((s) => (
          <li key={s.order}>
            {s.text}
            {s.minutes ? ` (${s.minutes} min)` : ""}
            {s.technique ? ` — ${s.technique}` : ""}
          </li>
        ))}
      </ol>
      <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
        ~{finalRecipe.nutrition.calories} kcal, {finalRecipe.nutrition.protein}g protein,{" "}
        {finalRecipe.nutrition.carbs}g carbs, {finalRecipe.nutrition.fat}g fat per serving (approximate)
      </p>
    </>
  );
}
