import type { LocalSessionEntry } from "@/hooks/useSessionList";

interface SessionListProps {
  entries: LocalSessionEntry[];
  onOpen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onNewSession: () => void;
}

/** The on-device session list (spec FR-004, SC-018): resume or delete a past
 * session, or start a new one. No navigation — this just switches what the
 * single `/` route renders (spec FR-003b). */
export function SessionList({ entries, onOpen, onDelete, onNewSession }: SessionListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <button
        type="button"
        onClick={onNewSession}
        style={{
          alignSelf: "flex-start",
          padding: "var(--space-2) var(--space-4)",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: "var(--color-accent)",
          color: "var(--color-accent-contrast)",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        Start a new session
      </button>

      {entries.length === 0 ? (
        <p style={{ margin: 0, color: "var(--color-text-muted)" }}>No sessions yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {entries.map((entry) => (
            <li
              key={entry.sessionId}
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
                onClick={() => onOpen(entry.sessionId)}
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
                <div style={{ fontWeight: 600 }}>{entry.title ?? "Untitled session"}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
                  {new Date(entry.lastOpened).toLocaleString()}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDelete(entry.sessionId)}
                aria-label={`Delete session ${entry.title ?? entry.sessionId}`}
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
          ))}
        </ul>
      )}
    </div>
  );
}
