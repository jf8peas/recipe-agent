import type { ButtonHTMLAttributes, CSSProperties } from "react";

export type ButtonVariant = "primary" | "secondary" | "link";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BASE_STYLE: CSSProperties = {
  font: "inherit",
  fontSize: "var(--text-sm)",
};

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    padding: "var(--space-2) var(--space-4)",
    borderRadius: "var(--radius-md)",
    border: "none",
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    fontWeight: 600,
  },
  secondary: {
    padding: "var(--space-2) var(--space-4)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    background: "transparent",
    color: "var(--color-text)",
  },
  link: {
    padding: 0,
    border: "none",
    background: "none",
    color: "var(--color-accent)",
    textDecoration: "underline",
  },
};

/** Folds `ActionToolbar.tsx`'s previously-duplicated `buttonStyle`/
 * `secondaryButtonStyle` functions (and the near-identical ones `EntryForm.tsx`/
 * `SessionList.tsx` each defined separately) into one shared primitive
 * (spec 006 Clarifications, research R4). */
export function Button({ variant = "primary", disabled, style, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        ...BASE_STYLE,
        ...VARIANT_STYLE[variant],
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
      {...rest}
    />
  );
}
