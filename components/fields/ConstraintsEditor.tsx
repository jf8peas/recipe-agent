import { useState } from "react";
import type { Constraints } from "@/lib/agent/state";

interface ConstraintsEditorProps {
  constraints: Constraints;
  editable?: boolean;
  onChange?: (constraints: Constraints) => void;
}

/** Constraints view/editor (spec FR-022/FR-023/FR-024). */
export function ConstraintsEditor({ constraints, editable, onChange }: ConstraintsEditorProps) {
  // Locally buffered, seeded once from the incoming snapshot — like
  // `IngredientsEditor`'s `raw` state. `constraints` only reflects the
  // graph's last-saved state and never updates mid-keystroke, so binding
  // the inputs to it directly (as this used to) made them impossible to
  // type into: every keystroke's change was immediately overwritten back
  // to the unchanged prop on the next render.
  const [local, setLocal] = useState(constraints);
  // Diets' own raw text, kept separate from the parsed `local.diets` array
  // for the same reason `IngredientsEditor` keeps raw text separate from
  // its parsed ingredients — normalizing on every keystroke (dropping a
  // trailing ", " via split/trim/filter) would otherwise fight the typing
  // itself, erasing separators the moment they're typed.
  const [dietsRaw, setDietsRaw] = useState(() => constraints.diets.join(", "));

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

  function update(patch: Partial<Constraints>) {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange!(next);
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
          value={local.cuisine ?? ""}
          onChange={(e) => update({ cuisine: e.target.value || null })}
          style={fieldStyle}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
        Max minutes
        <input
          type="number"
          min={1}
          value={local.maxMinutes ?? ""}
          onChange={(e) => update({ maxMinutes: e.target.value ? Number(e.target.value) : null })}
          style={fieldStyle}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
        Servings
        <input
          type="number"
          min={1}
          value={local.servings ?? ""}
          onChange={(e) => update({ servings: e.target.value ? Number(e.target.value) : null })}
          style={fieldStyle}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
        Diets (comma-separated)
        <input
          type="text"
          value={dietsRaw}
          onChange={(e) => {
            setDietsRaw(e.target.value);
            update({
              diets: e.target.value
                .split(",")
                .map((d) => d.trim())
                .filter(Boolean),
            });
          }}
          style={fieldStyle}
        />
      </label>
    </div>
  );
}
