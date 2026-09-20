import type { LocalSessionEntry } from "@/hooks/useSessionList";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";

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
      <Button variant="primary" onClick={onNewSession} style={{ alignSelf: "flex-start" }}>
        Start a new session
      </Button>

      {entries.length === 0 ? (
        <p style={{ margin: 0, color: "var(--color-text-muted)" }}>No sessions yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {entries.map((entry) => (
            <ListRow
              key={entry.sessionId}
              title={entry.title ?? "Untitled session"}
              subtitle={new Date(entry.lastOpened).toLocaleString()}
              onOpen={() => onOpen(entry.sessionId)}
              onDelete={() => onDelete(entry.sessionId)}
              deleteLabel={`Delete session ${entry.title ?? entry.sessionId}`}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
