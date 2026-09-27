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
  /** Blocks clicks/keyboard toggling and removes it from tab order, same as
   * a native `<input disabled>` — used for "Pause between stages" while
   * Auto-run is actually mid-stage, so it can't be flipped out from under a
   * run already in flight. */
  disabled?: boolean;
}

/** Direct port of `design/v003/design_files/Toggle.jsx`'s switch control
 * (spec 006 US1) — replaces the raw `<input type="checkbox">` previously
 * used for "Pause between stages". */
export function Toggle({ checked, onChange, label, describedById, disabled = false }: ToggleProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (disabled) return;
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
        cursor: disabled ? "not-allowed" : "pointer",
        userSelect: "none",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={describedById}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
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
