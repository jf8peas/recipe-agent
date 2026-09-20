import type { CSSProperties } from "react";

const spinnerStyle: CSSProperties = {
  display: "inline-block",
  width: "1em",
  height: "1em",
  borderRadius: "50%",
  border: "2px solid var(--color-border)",
  borderTopColor: "var(--color-accent)",
  animation: "recipe-agent-spin 0.8s linear infinite",
};

/** The exact spinning-ring markup + `@keyframes` extracted verbatim from
 * `RunningStage.tsx` (spec 006 Clarifications, research R4) — no visual
 * change, just reuse. */
export function Spinner() {
  return (
    <>
      <span aria-hidden="true" style={spinnerStyle} />
      <style>{`
        @keyframes recipe-agent-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
