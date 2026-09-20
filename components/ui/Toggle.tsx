"use client";

import type { KeyboardEvent } from "react";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Optional id of an existing (typically visually-hidden) element with
   * extra description — preserves `AppHeader.tsx`'s pre-existing
   * "Auto-run" hint text via `aria-describedby` on the switch itself. */
  describedById?: string;
}

/** Direct port of `design/v003/design_files/Toggle.jsx`'s switch control
 * (spec 006 US1) — replaces the raw `<input type="checkbox">` previously
 * used for "Pause between stages". */
export function Toggle({ checked, onChange, label, describedById }: ToggleProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(!checked);
    }
  }

  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        fontSize: "var(--text-sm)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={describedById}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={handleKeyDown}
        style={{
          position: "relative",
          width: 36,
          height: 20,
          borderRadius: 999,
          background: checked ? "var(--color-accent)" : "var(--color-border)",
          transition: "background 0.15s ease",
          flexShrink: 0,
          display: "inline-block",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "var(--color-surface)",
            boxShadow: "var(--shadow-sm)",
            transition: "left 0.15s ease",
          }}
        />
      </span>
      {label}
    </label>
  );
}
