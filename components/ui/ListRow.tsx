export interface ListRowProps {
  title: string;
  subtitle: string;
  onOpen: () => void;
  onDelete: () => void;
  deleteLabel: string;
}

/** One session-list row: an "open" button covering the row, plus a
 * separately-focusable delete button with its own `aria-label` (matches
 * `SessionList.tsx`'s existing pattern, now shared — spec 006 Clarifications). */
export function ListRow({ title, subtitle, onOpen, onDelete, deleteLabel }: ListRowProps) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        background: "var(--color-surface)",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          textAlign: "left",
          background: "none",
          border: "none",
          font: "inherit",
          cursor: "pointer",
          color: "var(--color-text)",
          padding: 0,
        }}
      >
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{subtitle}</div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={deleteLabel}
        style={{
          padding: "var(--space-1) var(--space-3)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border)",
          background: "transparent",
          color: "var(--color-danger)",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        Delete
      </button>
    </li>
  );
}
