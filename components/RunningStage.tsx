"use client";

import { useEffect, useState } from "react";

interface RunningStageProps {
  stageName: string;
  onCancel: () => void;
  /** Present only during Auto-run: stop after this stage finishes, without aborting it. */
  onPause?: () => void;
}

/** Indeterminate progress + elapsed time + Cancel while a stage is in flight (spec FR-009a). */
export function RunningStage({ stageName, onCancel, onPause }: RunningStageProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => clearInterval(interval);
  }, [stageName]);

  const seconds = (elapsedMs / 1000).toFixed(1);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "1em",
          height: "1em",
          borderRadius: "50%",
          border: "2px solid var(--color-border)",
          borderTopColor: "var(--color-accent)",
          animation: "recipe-agent-spin 0.8s linear infinite",
        }}
      />
      <span style={{ fontSize: "var(--text-sm)" }}>
        Running <strong>{stageName}</strong>… ({seconds}s)
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
        {onPause && (
          <button
            type="button"
            onClick={onPause}
            title="Finish this stage, then stop before the next one"
            style={{
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              background: "transparent",
              color: "var(--color-text)",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Pause
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "var(--space-1) var(--space-3)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border)",
            background: "transparent",
            color: "var(--color-text)",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      <style>{`
        @keyframes recipe-agent-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
