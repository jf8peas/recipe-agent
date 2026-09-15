import type { Constraints } from "@/lib/agent/state";

interface ConstraintsEditorProps {
  constraints: Constraints;
  editable?: boolean;
  onChange?: (constraints: Constraints) => void;
}

/** Constraints view/editor (spec FR-022/FR-023/FR-024). */
export function ConstraintsEditor({ constraints, editable, onChange }: ConstraintsEditorProps) {
  if (!editable || !onChange) {
    const parts: string[] = [];
    if (constraints.cuisine) parts.push(`Cuisine: ${constraints.cuisine}`);
    if (constraints.maxMinutes) parts.push(`Max time: ${constraints.maxMinutes} min`);
    if (constraints.servings) parts.push(`Servings: ${constraints.servings}`);
    if (constraints.diets.length > 0) parts.push(`Diets: ${constraints.diets.join(", ")}`);

    if (parts.length === 0) {
      return <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No constraints specified.</p>;
    }
    return (
      <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
        {parts.map((part) => (
          <li key={part}>{part}</li>
        ))}
      </ul>
    );
  }

  const fieldStyle = {
    padding: "var(--space-1) var(--space-2)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    font: "inherit",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
        Cuisine
        <input
          type="text"
          value={constraints.cuisine ?? ""}
          onChange={(e) => onChange({ ...constraints, cuisine: e.target.value || null })}
          style={fieldStyle}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
        Max minutes
        <input
          type="number"
          min={1}
          value={constraints.maxMinutes ?? ""}
          onChange={(e) => onChange({ ...constraints, maxMinutes: e.target.value ? Number(e.target.value) : null })}
          style={fieldStyle}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
        Servings
        <input
          type="number"
          min={1}
          value={constraints.servings ?? ""}
          onChange={(e) => onChange({ ...constraints, servings: e.target.value ? Number(e.target.value) : null })}
          style={fieldStyle}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
        Diets (comma-separated)
        <input
          type="text"
          value={constraints.diets.join(", ")}
          onChange={(e) =>
            onChange({
              ...constraints,
              diets: e.target.value
                .split(",")
                .map((d) => d.trim())
                .filter(Boolean),
            })
          }
          style={fieldStyle}
        />
      </label>
    </div>
  );
}
