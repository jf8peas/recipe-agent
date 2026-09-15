import type { Critique } from "@/lib/agent/state";

/** Read-only critique history (spec FR-022) — critiques are never user-editable. */
export function CritiquesView({ critiques }: { critiques: Critique[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
      {critiques.map((c) => (
        <li key={c.cycle}>
          Cycle {c.cycle}: {c.feasibility} / {c.flavorBalance}
          {c.missingOrUnclear.length > 0 ? ` — missing: ${c.missingOrUnclear.join(", ")}` : ""}
          {c.blocking && (
            <span style={{ color: "var(--color-warning)" }}> (blocking)</span>
          )}
        </li>
      ))}
    </ul>
  );
}
