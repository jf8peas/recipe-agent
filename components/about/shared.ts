import type { CSSProperties } from "react";

/** Reusable style-object helpers for the About page's ~15 sections and 3
 * diagrams (research R3) — the same handful of visual patterns
 * (design/v002/about.html's `.card`, `.grid`, `.callout`, `.badge`, `table`)
 * repeat dozens of times, so each is defined once here instead of inline at
 * every call site. Every value resolves through app/tokens.css (FR-022). */

export function cardStyle(extra?: CSSProperties): CSSProperties {
  return {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--color-surface)",
    padding: "var(--space-4)",
    ...extra,
  };
}

/** A responsive grid that reflows column count by available width instead
 * of a fixed breakpoint — no media-query listener needed for what
 * design/v002/about.html achieves with `@media (max-width: 720px)`. */
export function gridStyle(minColumnWidth = 220): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`,
    gap: "var(--space-4)",
    marginTop: "var(--space-4)",
  };
}

export function calloutStyle(extra?: CSSProperties): CSSProperties {
  return {
    borderRadius: "var(--radius-lg)",
    padding: "var(--space-5)",
    background: "var(--color-text)",
    color: "var(--color-bg)",
    marginTop: "var(--space-4)",
    ...extra,
  };
}

export type BadgeKind = "node" | "edge" | "critique";

export function badgeStyle(kind: BadgeKind): CSSProperties {
  const colorVar =
    kind === "node"
      ? "var(--color-accent)"
      : kind === "edge"
        ? "var(--color-warning)"
        : "var(--color-danger)";
  return {
    display: "inline-block",
    fontFamily: "var(--font-mono)",
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: "999px",
    // A tinted color-mix() background (the mockup's own choice) measures
    // under the WCAG AA 4.5:1 threshold against this text color at this
    // size — a plain surface background with a colored border keeps the
    // same visual distinction at a passing contrast ratio (FR-024).
    background: "var(--color-surface)",
    border: `1px solid ${colorVar}`,
    color: colorVar,
  };
}

export const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  overflow: "hidden",
  marginTop: "var(--space-4)",
  fontSize: "var(--text-sm)",
};

export const tableCellStyle: CSSProperties = {
  textAlign: "left",
  padding: "var(--space-2) var(--space-3)",
  borderBottom: "1px solid var(--color-border)",
  verticalAlign: "top",
};

export const tableHeadStyle: CSSProperties = {
  background: "var(--color-text)",
  color: "var(--color-bg)",
  fontWeight: 600,
};

// A tinted color-mix() background (the mockup's own choice) measures under
// the WCAG AA 4.5:1 threshold against this text color — a left border on a
// plain surface background keeps the same "highlighted row" cue at a
// passing contrast ratio (FR-024).
export const accentRowCellStyle: CSSProperties = {
  background: "var(--color-surface)",
  borderLeft: "3px solid var(--color-accent)",
  color: "var(--color-accent)",
  fontWeight: 600,
};

export const monoCellStyle: CSSProperties = { fontFamily: "var(--font-mono)" };

export const kickerStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  color: "var(--color-accent)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: "var(--space-2)",
};

export const stepNumStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  color: "var(--color-accent)",
  fontSize: "var(--text-sm)",
  marginBottom: "var(--space-2)",
  display: "block",
};

export const pillLinkStyle: CSSProperties = {
  display: "inline-block",
  marginTop: "var(--space-4)",
  padding: "var(--space-2) var(--space-4)",
  borderRadius: "999px",
  background: "var(--color-accent)",
  color: "var(--color-accent-contrast)",
  fontWeight: 600,
  fontSize: "var(--text-sm)",
  textDecoration: "none",
};

export const plainListStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
};

export const plainListItemStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-muted)",
};

export const bodyTextStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  maxWidth: "72ch",
};

export const ledeStyle: CSSProperties = {
  fontSize: "var(--text-lg)",
  color: "var(--color-text-muted)",
  lineHeight: 1.5,
  maxWidth: "68ch",
};

export const h2Style: CSSProperties = {
  fontSize: "var(--text-2xl)",
  fontWeight: 700,
  lineHeight: 1.2,
  marginBottom: "var(--space-3)",
  marginTop: 0,
};

export const h3Style: CSSProperties = {
  fontSize: "var(--text-lg)",
  fontWeight: 600,
  margin: 0,
  marginBottom: "var(--space-2)",
};

export const sectionStyle: CSSProperties = {
  padding: "var(--space-8) 0",
  borderBottom: "1px solid var(--color-border)",
  outline: "none",
};

export const legendStyle: CSSProperties = {
  fontSize: "var(--text-xs)",
  color: "var(--color-text-muted)",
  marginTop: "var(--space-2)",
};
