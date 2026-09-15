interface StageFailureBannerProps {
  failureReason: string | null;
  loading: boolean;
  sessionCapped: boolean;
  onRetry: () => void;
}

/** Shown when the current saved state's kind is `stage-failure` (spec
 * FR-051–FR-052): the reason, a Retry action (a plain re-execution — never
 * `updateState` — research R3), and a hint that Edit & Fork also works.
 * Disabled once the session is capped (FR-077) or an advance is in flight. */
export function StageFailureBanner({ failureReason, loading, sessionCapped, onRetry }: StageFailureBannerProps) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-4)",
        border: "1px solid var(--color-kind-stage-failure)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-surface)",
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: "var(--color-kind-stage-failure)" }}>Stage failed</p>
      {failureReason && <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>{failureReason}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <button
          type="button"
          onClick={onRetry}
          disabled={loading || sessionCapped}
          style={{
            padding: "var(--space-1) var(--space-3)",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: "var(--color-accent)",
            color: "var(--color-accent-contrast)",
            font: "inherit",
            cursor: loading || sessionCapped ? "not-allowed" : "pointer",
            opacity: loading || sessionCapped ? 0.6 : 1,
          }}
        >
          {loading ? "Retrying…" : "Retry"}
        </button>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          {sessionCapped
            ? "This session has reached its step limit — start a new session to continue."
            : "You can also edit the input and try a different version instead of retrying as-is."}
        </span>
      </div>
    </div>
  );
}
