import { useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { buildTree, type TimelineEntry, type TreeNode, type TimelineEntryKind } from "@/lib/tree";
import type { BranchInfo } from "@/hooks/useSession";

const KIND_LABELS: Record<TimelineEntryKind, string> = {
  normal: "normal",
  "in-progress": "in progress",
  finalized: "finalized",
  "ingredient-error": "ingredient error",
  "stage-failure": "stage failed",
};

const KIND_COLOR_VAR: Record<TimelineEntryKind, string> = {
  normal: "--color-kind-normal",
  "in-progress": "--color-kind-normal",
  finalized: "--color-kind-finalized",
  "ingredient-error": "--color-kind-ingredient-error",
  "stage-failure": "--color-kind-stage-failure",
};

interface BranchTimelineProps {
  branches: BranchInfo[];
  timeline: TimelineEntry[];
  selectedCheckpointId: string | null;
  onSelect: (branchId: string, checkpointId: string) => void;
}

/** The unified cross-branch tree (spec FR-017–FR-019, FR-053): one row per
 * saved state, newest branches nested under their fork point. Kind is always
 * rendered as text (and via `aria-label`), never color alone. Keyboard
 * navigable (spec FR-085): native Tab order through each entry's button,
 * plus Up/Down/Home/End to move directly between entries without needing
 * to tab past every one individually. */
export function BranchTimeline({ branches, timeline, selectedCheckpointId, onSelect }: BranchTimelineProps) {
  const navRef = useRef<HTMLElement>(null);
  const tree = useMemo(
    () =>
      buildTree(
        timeline,
        branches.map((b) => ({ thread_id: b.threadId, forked_from_checkpoint_id: b.forkedFromCheckpointId })),
      ),
    [timeline, branches],
  );

  if (tree.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No history yet.</p>;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const container = navRef.current;
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);

    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, buttons.length - 1);
    else nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);

    event.preventDefault();
    buttons[nextIndex]?.focus();
  }

  return (
    <nav aria-label="Session history" ref={navRef} onKeyDown={handleKeyDown}>
      <TreeList nodes={tree} selectedCheckpointId={selectedCheckpointId} onSelect={onSelect} />
    </nav>
  );
}

function TreeList({
  nodes,
  selectedCheckpointId,
  onSelect,
}: {
  nodes: TreeNode[];
  selectedCheckpointId: string | null;
  onSelect: (branchId: string, checkpointId: string) => void;
}) {
  return (
    <ul style={{ listStyle: "none", margin: 0, paddingLeft: "var(--space-4)" }}>
      {nodes.map((node) => {
        const { entry } = node;
        const isSelected = entry.checkpointId === selectedCheckpointId;
        const label = `${entry.stage}, ${KIND_LABELS[entry.kind]}, ${new Date(entry.createdAt).toLocaleString()}`;
        return (
          <li key={entry.checkpointId}>
            <button
              type="button"
              onClick={() => onSelect(entry.threadId, entry.checkpointId)}
              aria-current={isSelected ? "true" : undefined}
              aria-label={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                width: "100%",
                textAlign: "left",
                padding: "var(--space-1) var(--space-2)",
                margin: "1px 0",
                borderRadius: "var(--radius-sm)",
                border: isSelected ? "1px solid var(--color-accent)" : "1px solid transparent",
                background: isSelected ? "var(--color-surface)" : "transparent",
                font: "inherit",
                fontSize: "var(--text-sm)",
                cursor: "pointer",
                color: "var(--color-text)",
              }}
            >
              <span>{entry.stage}</span>
              <span style={{ color: `var(${KIND_COLOR_VAR[entry.kind]})`, fontSize: "var(--text-xs)" }}>
                [{KIND_LABELS[entry.kind]}]
              </span>
              <span style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>
                {new Date(entry.createdAt).toLocaleTimeString()}
              </span>
            </button>
            {node.children.length > 0 && (
              <TreeList nodes={node.children} selectedCheckpointId={selectedCheckpointId} onSelect={onSelect} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
