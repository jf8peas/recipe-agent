"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";

interface RunningStageProps {
  stageName: string;
  /** Omitted for a request with no cancellation wired up yet (the entry
   * screen's own "Start" call, which runs `parseIngredients` before a
   * session/branch even exists to abort) — the Cancel button itself is
   * omitted too, rather than rendered inert. */
  onCancel?: () => void;
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
        flexWrap: "wrap",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface)",
      }}
    >
      <Spinner />
      <span style={{ fontSize: "var(--text-sm)", minWidth: 0, overflowWrap: "anywhere" }}>
        Running <strong>{stageName}</strong>… ({seconds}s)
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
        {onPause && (
          <Button variant="secondary" onClick={onPause} title="Finish this stage, then stop before the next one">
            Pause
          </Button>
        )}
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
