import { useState } from "react";
import type { DishDirection } from "@/lib/agent/state";
import { FIELD_SCHEMAS } from "@/lib/field-consumers";

interface DirectionsEditorProps {
  directions: DishDirection[];
  editable?: boolean;
  onChange?: (directions: DishDirection[] | null, error: string | null) => void;
}

/** Dish-directions view/editor (spec FR-022/FR-023/FR-024). Nested-array
 * editing is JSON for now — inline-validated against the same schema the
 * server enforces on fork, so an invalid edit is caught before submitting. */
export function DirectionsEditor({ directions, editable, onChange }: DirectionsEditorProps) {
  const [raw, setRaw] = useState(() => JSON.stringify(directions, null, 2));
  const [error, setError] = useState<string | null>(null);

  if (!editable || !onChange) {
    return (
      <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
        {directions.map((d, idx) => (
          <li key={idx}>
            <strong>{d.title}</strong> — {d.summary}
            <div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>{d.whyItFits}</div>
          </li>
        ))}
      </ul>
    );
  }

  function handleChange(value: string) {
    setRaw(value);
    try {
      const parsed = JSON.parse(value);
      const result = FIELD_SCHEMAS.directions.safeParse(parsed);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? "Invalid directions.");
        onChange?.(null, "Invalid directions.");
        return;
      }
      setError(null);
      onChange?.(result.data, null);
    } catch {
      setError("Not valid JSON.");
      onChange?.(null, "Not valid JSON.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <textarea
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        rows={10}
        style={{
          width: "100%",
          padding: "var(--space-2)",
          border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`,
          borderRadius: "var(--radius-sm)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          font: "var(--font-mono)",
          fontSize: "var(--text-xs)",
          resize: "vertical",
        }}
      />
      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--color-danger)", fontSize: "var(--text-xs)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
