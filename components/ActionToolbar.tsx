import type { SessionApiError } from "@/hooks/useSession";
import { Button } from "@/components/ui/Button";

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
  /** Abandons this session (still resumable later from the session list —
   * nothing is deleted) and returns to it, for someone mid-run who wants to
   * start or switch to a different one without waiting for this one to
   * finish. */
  onExit: () => void;
  /** Re-runs `finalize` on an already-finalized branch — a new recipe pass
   * and a new photo, not just a new crop (feature 007, FR-010). Omitted
   * (not just disabled) whenever there's no valid checkpoint to retry from,
   * so its mere presence is the visibility check. */
  onRetryFinalize?: () => void;
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
  onExit,
  onRetryFinalize,
}: ActionToolbarProps) {
  const done = outcome === "finalized" || outcome === "ingredient-error";
  const sessionCapped = error?.error === "session-cap";
  const limitMessage = error ? LIMIT_MESSAGES[error.error] : null;

  if (editing.active) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <Button variant="primary" onClick={editing.onSave} disabled={loading || !editing.canSave}>
            {loading ? "Saving…" : "Try this version"}
          </Button>
          <Button variant="secondary" onClick={editing.onCancel} disabled={loading}>
            Cancel
          </Button>
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        {!done && pauseBetweenStages && (
          <Button variant="primary" onClick={onStep} disabled={loading || next.length === 0}>
            {loading ? "Working…" : `Step (${next[0] ?? "…"})`}
          </Button>
        )}

        {!done && !pauseBetweenStages && !autoRun.running && (
          <Button variant="primary" onClick={autoRun.play} disabled={loading || next.length === 0}>
            Play
          </Button>
        )}
        {!done && !pauseBetweenStages && autoRun.running && (
          <Button variant="primary" onClick={autoRun.pause}>
            Pause
          </Button>
        )}

        {done && (
          <Button variant="primary" onClick={onNewSession}>
            Start a new session
          </Button>
        )}

        {outcome === "finalized" && onRetryFinalize && (
          // Deliberately doesn't contain the word "Retry" —
          // `StageFailureBanner` already owns that label for its own,
          // differently-scoped action (recovering a failed stage), and
          // Playwright/testing-library's accessible-name matching is
          // substring-based by default, so "Retry finalize" would still
          // collide with a bare `{ name: "Retry" }` selector even though
          // both buttons can be on screen at once (this one, plus "Start a
          // new session") only in the finalized state.
          <Button variant="secondary" onClick={onRetryFinalize} disabled={loading}>
            {loading ? "Working…" : "Regenerate"}
          </Button>
        )}

        {!sessionCapped && (
          <Button variant="secondary" onClick={editing.onStart} disabled={loading}>
            Edit
          </Button>
        )}

        <Button variant="secondary" onClick={onExit}>
          Back to your sessions
        </Button>
      </div>
    </div>
  );
}
