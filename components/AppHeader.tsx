"use client";

import { usePauseBetweenStages } from "@/hooks/usePauseBetweenStages";

const AUTHOR_URL = "https://www.linkedin.com/in/john-fong-04b7a120/";
const FEEDBACK_URL = "https://github.com/jf8peas/recipe-agent/issues";

/**
 * Persistent header on every screen (spec FR-046–FR-049): title, author +
 * feedback links (new tab, never disturb the current session), and the
 * Step vs Auto-run toggle (FR-034/FR-036).
 */
export function AppHeader() {
  const [pauseBetweenStages, setPauseBetweenStages] = usePauseBetweenStages();

  return (
    <header
      style={{
        height: "var(--header-height)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--space-4)",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <strong style={{ fontSize: "var(--text-lg)" }}>Recipe Agent</strong>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
          <input
            type="checkbox"
            checked={pauseBetweenStages}
            onChange={(e) => setPauseBetweenStages(e.target.checked)}
            aria-describedby="pause-between-stages-hint"
          />
          Pause between stages
        </label>
        <span id="pause-between-stages-hint" hidden>
          When off, the assistant advances through stages automatically (Auto-run).
        </span>

        <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
          Author
        </a>
        <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
          Feedback
        </a>
      </div>
    </header>
  );
}
