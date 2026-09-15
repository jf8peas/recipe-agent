"use client";

import { useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useAutoRun } from "@/hooks/useAutoRun";
import { usePauseBetweenStages } from "@/hooks/usePauseBetweenStages";
import { EntryForm } from "@/components/EntryForm";
import { StageProgress } from "@/components/StageProgress";
import { StatePanel } from "@/components/StatePanel";
import { ActionToolbar } from "@/components/ActionToolbar";
import { RunningStage } from "@/components/RunningStage";
import { UnsavedResultBanner } from "@/components/UnsavedResultBanner";
import { StageFailureBanner } from "@/components/StageFailureBanner";
import { BranchTimeline } from "@/components/BranchTimeline";
import type { EditableField } from "@/lib/field-consumers";

const LIMIT_ERROR_CODES = new Set([
  "rate-limited",
  "daily-cap",
  "global-cap",
  "provider-cap",
  "session-cap",
]);

/** FR-033: a session/checkpoint that's gone (deleted, purged, or never the
 * caller's) must show a clear message, not fail silently. */
const UNAVAILABLE_ERROR_MESSAGES: Record<string, string> = {
  "not-found": "That session is no longer available.",
  "unknown-checkpoint": "That saved state no longer exists.",
};

export default function HomePage() {
  const {
    clientId,
    snapshot,
    history,
    viewed,
    loading,
    runningStage,
    pendingSave,
    error,
    restoring,
    start,
    step,
    cancel,
    retrySave,
    viewCheckpoint,
    clearViewedCheckpoint,
    fork,
    reset,
  } = useSession();
  const [pauseBetweenStages] = usePauseBetweenStages();
  const autoRun = useAutoRun({ step });

  const [editMode, setEditMode] = useState(false);
  const [patch, setPatch] = useState<Partial<Record<EditableField, unknown>>>({});
  const [patchErrors, setPatchErrors] = useState<Partial<Record<EditableField, string>>>({});

  if (!clientId || restoring) {
    return (
      <main style={{ padding: "var(--space-6)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

  const isViewingHistory = viewed !== null;
  const displayedState = viewed?.state ?? pendingSave?.state ?? snapshot?.state;
  const displayedNext = viewed?.next ?? snapshot?.next ?? [];
  const isStageFailure = !isViewingHistory && !editMode && snapshot?.state.outcome === "stage-failure";

  function handleFieldChange(field: EditableField, value: unknown, fieldError: string | null) {
    if (fieldError) {
      setPatchErrors((prev) => ({ ...prev, [field]: fieldError }));
      return;
    }
    setPatchErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setPatch((prev) => ({ ...prev, [field]: value }));
  }

  function startEdit() {
    setPatch({});
    setPatchErrors({});
    setEditMode(true);
  }

  function cancelEdit() {
    setPatch({});
    setPatchErrors({});
    setEditMode(false);
  }

  async function saveEdit() {
    const forkBranchId = viewed?.branchId ?? snapshot?.branchId;
    const forkCheckpointId = viewed?.checkpointId ?? snapshot?.checkpointId;
    if (!forkBranchId || !forkCheckpointId) return;
    const result = await fork(forkBranchId, forkCheckpointId, patch);
    if (result) {
      setPatch({});
      setPatchErrors({});
      setEditMode(false);
    }
  }

  return (
    <main style={{ padding: "var(--space-6)", maxWidth: "720px", margin: "0 auto" }}>
      {!snapshot ? (
        <>
          <h1 style={{ fontSize: "var(--text-xl)", marginTop: 0 }}>What&apos;s in your kitchen?</h1>
          <EntryForm onSubmit={(ingredients) => start(ingredients)} disabled={loading} />
          {error && (
            <p role="alert" style={{ marginTop: "var(--space-3)", color: "var(--color-danger)" }}>
              {error.message}
            </p>
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
          {history && (
            <details style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)" }}>
              <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                History
              </summary>
              <div style={{ marginTop: "var(--space-3)" }}>
                <BranchTimeline
                  branches={history.branches}
                  timeline={history.timeline}
                  selectedCheckpointId={viewed?.checkpointId ?? snapshot.checkpointId}
                  onSelect={(branchId, checkpointId) => viewCheckpoint(branchId, checkpointId)}
                />
              </div>
            </details>
          )}

          {error && !LIMIT_ERROR_CODES.has(error.error) && (
            <p role="alert" style={{ margin: 0, color: "var(--color-danger)", fontSize: "var(--text-sm)" }}>
              {UNAVAILABLE_ERROR_MESSAGES[error.error] ?? error.message}
            </p>
          )}

          <StageProgress next={displayedNext} outcome={displayedState?.outcome ?? snapshot.state.outcome} />

          {isViewingHistory && !editMode && (
            <p role="status" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
              Viewing an earlier step ({viewed.state.outcome === "in-progress" ? viewed.next[0] ?? "…" : viewed.state.outcome}).{" "}
              <button
                type="button"
                onClick={clearViewedCheckpoint}
                style={{ font: "inherit", color: "var(--color-accent)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
              >
                Back to current
              </button>
            </p>
          )}

          {displayedState && (
            <StatePanel
              state={displayedState}
              editable={editMode}
              onFieldChange={editMode ? handleFieldChange : undefined}
            />
          )}

          {editMode ? (
            <ActionToolbar
              next={displayedNext}
              outcome={displayedState?.outcome ?? "in-progress"}
              loading={loading}
              error={error}
              pauseBetweenStages={pauseBetweenStages}
              autoRun={autoRun}
              editing={{
                active: true,
                canSave: Object.keys(patch).length > 0 && Object.keys(patchErrors).length === 0,
                onStart: startEdit,
                onSave: saveEdit,
                onCancel: cancelEdit,
              }}
              onStep={() => step("step")}
              onNewSession={reset}
            />
          ) : pendingSave ? (
            <UnsavedResultBanner loading={loading} onRetrySave={retrySave} />
          ) : runningStage ? (
            <RunningStage
              stageName={runningStage}
              onCancel={cancel}
              onPause={autoRun.running ? autoRun.pause : undefined}
            />
          ) : isStageFailure ? (
            <StageFailureBanner
              failureReason={snapshot.state.failureReason}
              loading={loading}
              sessionCapped={error?.error === "session-cap"}
              onRetry={() => step("retry")}
            />
          ) : (
            <ActionToolbar
              next={isViewingHistory ? [] : snapshot.next}
              outcome={snapshot.state.outcome}
              loading={loading}
              error={error}
              pauseBetweenStages={pauseBetweenStages}
              autoRun={autoRun}
              editing={{
                active: false,
                canSave: false,
                onStart: startEdit,
                onSave: saveEdit,
                onCancel: cancelEdit,
              }}
              onStep={() => step("step")}
              onNewSession={reset}
            />
          )}
        </div>
      )}
    </main>
  );
}
