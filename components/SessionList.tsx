import type { LocalSessionEntry } from "@/hooks/useSessionList";
import { Button } from "@/components/ui/Button";
import { ListRow } from "@/components/ui/ListRow";

interface SessionListProps {
  entries: LocalSessionEntry[];
  onOpen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onNewSession: () => void;
  /** Every session whose delete request is currently in flight — a `Set`,
   * not a single id, since deleting two different rows at once (two quick
   * clicks before either request settles) is a real path and each is
   * independent. That row's buttons disable and show a busy state instead
   * of staying clickable. */
  deletingSessionIds?: Set<string>;
}

/** The on-device session list (spec FR-004, SC-018): resume or delete a past
 * session, or start a new one. No navigation — this just switches what the
 * single `/` route renders (spec FR-003b). */
export function SessionList({ entries, onOpen, onDelete, onNewSession, deletingSessionIds }: SessionListProps) {
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
              deleting={deletingSessionIds?.has(entry.sessionId) ?? false}
              thumbnail={{
                src: entry.thumbnail?.url ?? null,
                alt: entry.thumbnail?.alt ?? "",
                focalX: entry.thumbnail?.focalX,
                focalY: entry.thumbnail?.focalY,
                zoom: entry.thumbnail?.zoom,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
