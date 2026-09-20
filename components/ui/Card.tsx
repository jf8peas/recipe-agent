import type { CSSProperties, ReactNode } from "react";

export interface CardProps {
  heading?: string;
  children: ReactNode;
  style?: CSSProperties;
}

/** The same bordered/`radius-md`/`surface`/`space-4` visual result
 * `StatePanel.tsx`'s own `sectionStyle`/`headingStyle` used to produce
 * per-field, now shared (spec 006 Clarifications, research R4). */
export function Card({ heading, children, style }: CardProps) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        background: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        ...style,
      }}
    >
      {heading && (
        <h3
          style={{
            margin: 0,
            fontSize: "var(--text-sm)",
            color: "var(--color-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {heading}
        </h3>
      )}
      {children}
    </div>
  );
}
