import type { CSSProperties } from "react";
import type { Critique } from "@/lib/agent/state";

const subheadingStyle: CSSProperties = {
  margin: "0 0 var(--space-1) 0",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

/** One critique cycle's own view (spec FR-022) — critiques are never
 * user-editable. Each field gets its own labeled block instead of being
 * crammed onto one line, since `feasibility`/`flavorBalance` are often
 * full sentences and `missingOrUnclear` reads better as a list than an
 * inline comma-join. */
export function CritiqueView({ critique }: { critique: Critique }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {critique.blocking && (
        <p style={{ margin: 0, fontWeight: 600, color: "var(--color-warning)" }}>
          Blocking — sent back for revision
        </p>
      )}

      <div>
        <p style={subheadingStyle}>Feasibility</p>
        <p style={{ margin: 0 }}>{critique.feasibility}</p>
      </div>

      <div>
        <p style={subheadingStyle}>Flavor balance</p>
        <p style={{ margin: 0 }}>{critique.flavorBalance}</p>
      </div>

      {critique.missingOrUnclear.length > 0 && (
        <div>
          <p style={subheadingStyle}>Missing or unclear</p>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {critique.missingOrUnclear.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
