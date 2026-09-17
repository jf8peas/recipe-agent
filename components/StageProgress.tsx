const STAGES = [
  "parseIngredients",
  "proposeDirections",
  "selectDirection",
  "draftRecipe",
  "critique",
  "refine",
  "finalize",
] as const;

interface StageProgressProps {
  next: string[];
  outcome: string;
}

/** A simple stepper: which stages are done vs. next (spec FR-009). */
export function StageProgress({ next, outcome }: StageProgressProps) {
  const nextStage = next[0];
  const currentIndex =
    outcome === "finalized" || outcome === "ingredient-error"
      ? STAGES.length
      : STAGES.indexOf(nextStage as (typeof STAGES)[number]);

  return (
    <ol
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-2)",
        listStyle: "none",
        padding: 0,
        margin: 0,
        fontSize: "var(--text-sm)",
      }}
    >
      {STAGES.map((stage, i) => {
        const done = currentIndex === -1 ? false : i < currentIndex;
        const active = i === currentIndex;
        return (
          <li
            key={stage}
            aria-current={active ? "step" : undefined}
            style={{
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              background: active
                ? "var(--color-accent)"
                : done
                  ? "var(--color-surface)"
                  : "transparent",
              // Not-yet-reached stages use the (already-AA-contrast) muted
              // text token, not a translucent --color-text — opacity-blended
              // text against --color-bg failed WCAG AA contrast (axe-core,
              // spec SC-027).
              color: active ? "var(--color-accent-contrast)" : done ? "var(--color-text)" : "var(--color-text-muted)",
            }}
          >
            {done ? "✓ " : ""}
            {stage}
          </li>
        );
      })}
    </ol>
  );
}
