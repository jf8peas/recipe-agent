import { useState } from "react";
import type { RecipeDraft } from "@/lib/agent/state";
import { FIELD_SCHEMAS } from "@/lib/field-consumers";

interface RecipeDraftEditorProps {
  recipeDraft: RecipeDraft;
  editable?: boolean;
  onChange?: (recipeDraft: RecipeDraft | null, error: string | null) => void;
}

/** Recipe-draft view/editor (spec FR-022/FR-023/FR-024) — JSON for now,
 * inline-validated against the same schema the server enforces on fork. */
export function RecipeDraftEditor({ recipeDraft, editable, onChange }: RecipeDraftEditorProps) {
  const [raw, setRaw] = useState(() => JSON.stringify(recipeDraft, null, 2));
  const [error, setError] = useState<string | null>(null);

  if (!editable || !onChange) {
    return (
      <>
        <p style={{ margin: "0 0 var(--space-2) 0", fontWeight: 600 }}>{recipeDraft.title}</p>
        <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--text-sm)" }}>Serves {recipeDraft.servings}</p>
        {/* `ingredients` was added to this schema after some checkpoints
            were already recorded — `StateSchema` is never actually parsed
            at runtime, so an older checkpoint's stored JSON simply lacks
            the key and this reads as `undefined`, not `[]`. Same treatment
            for `toBuy`/`steps`, cheap insurance against the same gap. */}
        {(recipeDraft.ingredients?.length ?? 0) > 0 && (
          <ul style={{ margin: "0 0 var(--space-3) 0", paddingLeft: "var(--space-5)" }}>
            {recipeDraft.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.quantity ? `${ing.quantity} ` : ""}
                {ing.name}
              </li>
            ))}
          </ul>
        )}
        <ol style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
          {(recipeDraft.steps ?? []).map((s) => (
            <li key={s.order}>
              {s.text}
              {s.minutes ? ` (${s.minutes} min)` : ""}
              {s.technique ? ` — ${s.technique}` : ""}
            </li>
          ))}
        </ol>
        {(recipeDraft.toBuy?.length ?? 0) > 0 && (
          <p style={{ margin: "var(--space-2) 0 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            To buy: {recipeDraft.toBuy.join(", ")}
          </p>
        )}
      </>
    );
  }

  function handleChange(value: string) {
    setRaw(value);
    try {
      const parsed = JSON.parse(value);
      const result = FIELD_SCHEMAS.recipeDraft.safeParse(parsed);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? "Invalid recipe draft.");
        onChange?.(null, "Invalid recipe draft.");
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
        aria-label="Recipe draft (JSON)"
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        rows={14}
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
