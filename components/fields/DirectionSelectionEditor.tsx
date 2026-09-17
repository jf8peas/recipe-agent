import { useState } from "react";
import type { DirectionSelection, DishDirection } from "@/lib/agent/state";
import { FIELD_SCHEMAS } from "@/lib/field-consumers";

interface DirectionSelectionEditorProps {
  directionSelection: DirectionSelection;
  /** The full candidate list `selectedIndex` indexes into, so the chosen
   * direction's own title/summary can be shown alongside the verdict
   * (read-only view only — the edit branch is JSON, like every other
   * object-shaped field). */
  directions: DishDirection[];
  editable?: boolean;
  onChange?: (directionSelection: DirectionSelection | null, error: string | null) => void;
}

/** Direction-selection view/editor (spec FR-008/FR-009) — which candidate
 * was chosen, why, and whether it was a clear favorite or a default pick.
 * JSON for now, inline-validated against the same schema the server
 * enforces on fork, mirroring `DirectionsEditor.tsx`'s exact pattern. */
export function DirectionSelectionEditor({
  directionSelection,
  directions,
  editable,
  onChange,
}: DirectionSelectionEditorProps) {
  const [raw, setRaw] = useState(() => JSON.stringify(directionSelection, null, 2));
  const [error, setError] = useState<string | null>(null);

  if (!editable || !onChange) {
    const chosen = directions[directionSelection.selectedIndex];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <p style={{ margin: 0 }}>
          <strong>{chosen?.title ?? `Direction ${directionSelection.selectedIndex}`}</strong>
        </p>
        <p style={{ margin: 0 }}>{directionSelection.explanation}</p>
        {/* Text, not color alone, carries the meaning (matches
         * BranchTimeline's kind-label convention). */}
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
          {directionSelection.clearFavorite
            ? "Clear favorite"
            : "Default pick among equivalent options"}
        </p>
      </div>
    );
  }

  function handleChange(value: string) {
    setRaw(value);
    try {
      const parsed = JSON.parse(value);
      const result = FIELD_SCHEMAS.directionSelection.safeParse(parsed);
      if (!result.success) {
        setError(result.error.issues[0]?.message ?? "Invalid direction selection.");
        onChange?.(null, "Invalid direction selection.");
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
        aria-label="Direction selection (JSON)"
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        rows={8}
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
        <p
          role="alert"
          style={{ margin: 0, color: "var(--color-danger)", fontSize: "var(--text-xs)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
