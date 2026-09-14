import type { SessionApiError } from "@/hooks/useSession";

interface ActionToolbarProps {
  next: string[];
  outcome: string;
  loading: boolean;
  error: SessionApiError | null;
  onStep: () => void;
  onRetry: () => void;
  onNewSession: () => void;
}

const LIMIT_MESSAGES: Record<string, string> = {
  "rate-limited": "You're going a bit fast — please wait a moment and try again.",
  "daily-cap": "You've reached today's usage limit. Please try again tomorrow.",
  "global-cap": "This app has reached its usage limit for today. Please try again tomorrow.",
  "provider-cap": "The AI service is temporarily unavailable due to a usage limit. Please try again later.",
  "session-cap": "This session has reached its maximum number of steps. Start a new session to continue.",
};

/** Step/Retry controls plus limit and stage-failure messaging (spec FR-051,
 * FR-061–FR-066, FR-077–FR-078). Auto-run (T057/T058) is not wired up yet —
 * this is manual Step only. */
export function ActionToolbar({ next, outcome, loading, error, onStep, onRetry, onNewSession }: ActionToolbarProps) {
  const done = outcome === "finalized" || outcome === "ingredient-error";
  const isStageFailure = outcome === "stage-failure";
  const limitMessage = error ? LIMIT_MESSAGES[error.error] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {limitMessage && (
        <p role="alert" style={{ margin: 0, color: "var(--color-warning)", fontSize: "var(--text-sm)" }}>
          {limitMessage}
        </p>
      )}
      {error && !limitMessage && (
        <p role="alert" style={{ margin: 0, color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>
          {error.message}
        </p>
      )}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        {!done && !isStageFailure && (
          <button
            type="button"
            onClick={onStep}
            disabled={loading || next.length === 0}
            style={buttonStyle(loading || next.length === 0)}
          >
            {loading ? "Working…" : `Step (${next[0] ?? "…"})`}
          </button>
        )}
        {isStageFailure && (
          <button type="button" onClick={onRetry} disabled={loading} style={buttonStyle(loading)}>
            {loading ? "Retrying…" : "Retry"}
          </button>
        )}
        {done && (
          <button type="button" onClick={onNewSession} style={buttonStyle(false)}>
            Start a new session
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
