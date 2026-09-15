import type { SessionApiError } from "@/hooks/useSession";

interface AutoRunControls {
  running: boolean;
  play: () => void;
  pause: () => void;
}

interface EditingControls {
  active: boolean;
  canSave: boolean;
  onStart: () => void;
  onSave: () => void;
  onCancel: () => void;
}

interface ActionToolbarProps {
  next: string[];
  outcome: string;
  loading: boolean;
  error: SessionApiError | null;
  pauseBetweenStages: boolean;
  autoRun: AutoRunControls;
  editing: EditingControls;
  onStep: () => void;
  onNewSession: () => void;
}

const LIMIT_MESSAGES: Record<string, string> = {
  "rate-limited": "You're going a bit fast — please wait a moment and try again.",
  "daily-cap": "You've reached today's usage limit. Please try again tomorrow.",
  "global-cap": "This app has reached its usage limit for today. Please try again tomorrow.",
  "provider-cap": "The AI service is temporarily unavailable due to a usage limit. Please try again later.",
  "session-cap": "This session has reached its maximum number of steps. Start a new session to continue.",
};

/** Step (manual) vs. Play/Pause (Auto-run) controls, Edit & Fork, plus limit
 * messaging (spec FR-026–FR-029, FR-034–FR-038, FR-061–FR-066, FR-077–FR-078).
 * Which advance mode is shown follows the pause-between-stages toggle in
 * `AppHeader` (T032). Not shown at all for a `stage-failure` outcome —
 * `StageFailureBanner` owns that. */
export function ActionToolbar({
  next,
  outcome,
  loading,
  error,
  pauseBetweenStages,
  autoRun,
  editing,
  onStep,
  onNewSession,
}: ActionToolbarProps) {
  const done = outcome === "finalized" || outcome === "ingredient-error";
  const sessionCapped = error?.error === "session-cap";
  const limitMessage = error ? LIMIT_MESSAGES[error.error] : null;

  if (editing.active) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <button
            type="button"
            onClick={editing.onSave}
            disabled={loading || !editing.canSave}
            style={buttonStyle(loading || !editing.canSave)}
          >
            {loading ? "Saving…" : "Try this version"}
          </button>
          <button type="button" onClick={editing.onCancel} disabled={loading} style={secondaryButtonStyle(loading)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {limitMessage && (
        <p role="alert" style={{ margin: 0, color: "var(--color-warning)", fontSize: "var(--text-sm)" }}>
          {limitMessage}
        </p>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        {!done && pauseBetweenStages && (
          <button
            type="button"
            onClick={onStep}
            disabled={loading || next.length === 0}
            style={buttonStyle(loading || next.length === 0)}
          >
            {loading ? "Working…" : `Step (${next[0] ?? "…"})`}
          </button>
        )}

        {!done && !pauseBetweenStages && !autoRun.running && (
          <button
            type="button"
            onClick={autoRun.play}
            disabled={loading || next.length === 0}
            style={buttonStyle(loading || next.length === 0)}
          >
            Play
          </button>
        )}
        {!done && !pauseBetweenStages && autoRun.running && (
          <button type="button" onClick={autoRun.pause} style={buttonStyle(false)}>
            Pause
          </button>
        )}

        {done && (
          <button type="button" onClick={onNewSession} style={buttonStyle(false)}>
            Start a new session
          </button>
        )}

        {!sessionCapped && (
          <button type="button" onClick={editing.onStart} disabled={loading} style={secondaryButtonStyle(loading)}>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

function buttonStyle(disabled: boolean) {
  return {
    padding: "var(--space-2) var(--space-4)",
    borderRadius: "var(--radius-md)",
    border: "none",
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    font: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  } as const;
}

function secondaryButtonStyle(disabled: boolean) {
  return {
    padding: "var(--space-2) var(--space-4)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "transparent",
    color: "var(--color-text)",
    font: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  } as const;
}
