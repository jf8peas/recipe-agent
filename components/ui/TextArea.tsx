"use client";

import { useId, type TextareaHTMLAttributes } from "react";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

/** Matches `EntryForm.tsx`'s existing `<label htmlFor>`/`<textarea id>`
 * pattern, now shared (spec 006 Clarifications, research R4). */
export function TextArea({ label, id, style, ...rest }: TextAreaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <label htmlFor={textareaId} style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
        {label}
      </label>
      <textarea
        id={textareaId}
        style={{
          padding: "var(--space-3)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          font: "inherit",
          resize: "vertical",
          ...style,
        }}
        {...rest}
      />
    </div>
  );
}
