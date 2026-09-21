import type { Critique, FinalRecipe } from "@/lib/agent/state";

export interface FinalRecipeViewProps {
  finalRecipe: FinalRecipe;
  /** True when `finalize` was reached with the critique still flagging a
   * blocking problem — the refine-cycle cap was hit before it passed clean
   * (`lib/agent/edges.ts`'s `finalizedAtRefineLimit`). */
  finalizedAtRefineLimit: boolean;
  refineCount: number;
  latestCritique: Critique | null;
}

/** Read-only final recipe view (spec FR-022, FR-016) — includes the approximate nutrition estimate. */
export function FinalRecipeView({
  finalRecipe,
  finalizedAtRefineLimit,
  refineCount,
  latestCritique,
}: FinalRecipeViewProps) {
  return (
    <>
      {finalizedAtRefineLimit ? (
        <div
          role="status"
          style={{
            margin: "0 0 var(--space-4) 0",
            padding: "var(--space-3) var(--space-4)",
            border: "1px solid var(--color-warning)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
          }}
        >
          <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600, color: "var(--color-warning)" }}>
            Finalized at the refinement limit, not because it passed critique
          </p>
          <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--text-sm)" }}>
            After {refineCount} refinement cycle{refineCount === 1 ? "" : "s"}, the critique stage still flagged
            a blocking issue below, but the cycle cap was reached, so the recipe was finalized as-is instead of
            revising again. This cap exists to limit token usage — a recipe can otherwise keep going back and
            forth between critique and refine indefinitely.
          </p>
          {latestCritique && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              <strong>Last critique:</strong> {latestCritique.feasibility}
              {latestCritique.flavorBalance ? ` ${latestCritique.flavorBalance}` : ""}
            </p>
          )}
        </div>
      ) : (
        // The other, equally possible way `finalize` is reached — surfaced
        // just as explicitly as the limit-hit case above, so the final tab
        // never leaves it ambiguous which of the two actually happened.
        <div
          role="status"
          style={{
            margin: "0 0 var(--space-4) 0",
            padding: "var(--space-3) var(--space-4)",
            border: "1px solid var(--color-success)",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: "var(--color-success)" }}>
            Passed critique — no blocking issues found
          </p>
          <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--text-sm)" }}>
            {refineCount > 0
              ? `The critique stage found no remaining blocking problems after ${refineCount} refinement cycle${refineCount === 1 ? "" : "s"}.`
              : "The critique stage found no blocking problems with feasibility or flavor on the first pass — no revisions were needed."}
          </p>
        </div>
      )}

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
