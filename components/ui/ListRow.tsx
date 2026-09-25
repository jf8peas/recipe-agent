import { DishImage } from "./DishImage";
import { Spinner } from "./Spinner";

export interface ListRowThumbnail {
  /** `null` renders the neutral placeholder — no finalized branch yet, or
   * its most recent finalize's image failed (feature 007, FR-004/FR-005). */
  src: string | null;
  alt: string;
  focalX?: number;
  focalY?: number;
  zoom?: number | null;
}

export interface ListRowProps {
  title: string;
  subtitle: string;
  onOpen: () => void;
  onDelete: () => void;
  deleteLabel: string;
  /** True while this row's own delete request is in flight — the server
   * round trip can take a while, so both buttons disable (no double-delete,
   * no opening a session that's about to disappear) and the delete button
   * shows a spinner instead of silently staying clickable. */
  deleting?: boolean;
  /** Omitted only pending the very first render before any list data has
   * loaded — otherwise always present (as `{ src: null, ... }` at worst),
   * so the fixed-size media slot below reserves its space unconditionally
   * and never shifts the row's layout once real data arrives (FR-013). */
  thumbnail?: ListRowThumbnail;
}

/** One session-list row: an "open" button covering the row, plus a
 * separately-focusable delete button with its own `aria-label` (matches
 * `SessionList.tsx`'s existing pattern, now shared — spec 006 Clarifications). */
export function ListRow({ title, subtitle, onOpen, onDelete, deleteLabel, deleting = false, thumbnail }: ListRowProps) {
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
      <DishImage
        src={thumbnail?.src ?? null}
        alt={thumbnail?.alt ?? ""}
        focalX={thumbnail?.focalX}
        focalY={thumbnail?.focalY}
        zoom={thumbnail?.zoom}
        style={{ width: "var(--dish-thumb-size)", height: "var(--dish-thumb-size)" }}
      />
      <button
        type="button"
        onClick={onOpen}
        disabled={deleting}
        style={{
          flex: 1,
          textAlign: "left",
          background: "none",
          border: "none",
          font: "inherit",
          cursor: deleting ? "not-allowed" : "pointer",
          color: "var(--color-text)",
          padding: 0,
          opacity: deleting ? 0.6 : 1,
        }}
      >
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{subtitle}</div>
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={deleting ? `Deleting ${deleteLabel}` : deleteLabel}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          padding: "var(--space-1) var(--space-3)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border)",
          background: "transparent",
          color: "var(--color-danger)",
          font: "inherit",
          cursor: deleting ? "not-allowed" : "pointer",
          opacity: deleting ? 0.6 : 1,
        }}
      >
        {deleting ? (
          <>
            <Spinner />
            Deleting…
          </>
        ) : (
          "Delete"
        )}
      </button>
    </li>
  );
}
