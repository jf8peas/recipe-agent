"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession, type StepResponse } from "@/hooks/useSession";
import { useSessionList } from "@/hooks/useSessionList";
import { bestAvailableTitle } from "@/lib/session-title";
import { useAutoRun } from "@/hooks/useAutoRun";
import { useAdvanceLock } from "@/hooks/useAdvanceLock";
import { usePauseBetweenStages } from "@/hooks/usePauseBetweenStages";
import { EntryForm } from "@/components/EntryForm";
import { SessionList } from "@/components/SessionList";
import { AgentGraphProgress } from "@/components/AgentGraphProgress";
import { RunTabs } from "@/components/RunTabs";
import { Tabs } from "@/components/ui/Tabs";
import { ActionToolbar } from "@/components/ActionToolbar";
import { RunningStage } from "@/components/RunningStage";
import { UnsavedResultBanner } from "@/components/UnsavedResultBanner";
import { StageFailureBanner } from "@/components/StageFailureBanner";
import { BranchTimeline } from "@/components/BranchTimeline";
import type { EditableField } from "@/lib/field-consumers";
import { deriveRunPath, type GraphNodeName } from "@/lib/graph-progress";
import type { RecipeDraft } from "@/lib/agent/state";
import {
  STAGE_TO_TAB,
  critiqueCycleOf,
  draftOccurrenceOf,
  draftTabCheckpoints,
  latestTabOfKind,
  stackableTabs,
  tabLabel,
  visibleTabs,
  type TabId,
} from "@/lib/run-tabs";

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
    fetchCheckpointState,
    fork,
    openSession,
    deleteSessionById,
    reset,
  } = useSession();
  const sessionList = useSessionList(clientId);
  const [pauseBetweenStages] = usePauseBetweenStages();
  const advanceLock = useAdvanceLock(snapshot?.branchId ?? null);
  // Explicit, sticky — NOT derived from `entries.length` on every render.
  // Deleting the only session while viewing the list must still show "No
  // sessions yet." from inside the list, not silently fall back to the
  // entry form just because entries dropped to zero.
  const [view, setView] = useState<"list" | "entry">(() =>
    sessionList.entries.length > 0 ? "list" : "entry",
  );
  const [deletedNotice, setDeletedNotice] = useState(false);

  // The local list started empty but got rebuilt from the server (spec
  // FR-032) — switch to the list view too. One-directional: this never
  // downgrades list -> entry.
  useEffect(() => {
    if (view === "entry" && sessionList.entries.length > 0) setView("list");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionList.entries.length]);

  // Keep the on-device session list in sync with whichever session becomes
  // active, and with its title as the recipe progresses — mirrors the
  // server's own progressive titling (lib/session-title.ts) so the list
  // doesn't need a full /mine refetch to pick up a newly-known title.
  const currentTitle = snapshot ? bestAvailableTitle(snapshot.state) : null;
  useEffect(() => {
    if (snapshot?.sessionId) sessionList.touch(snapshot.sessionId, currentTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.sessionId, currentTitle]);

  // Rebuild the list from /mine if localStorage came up empty (spec FR-032) —
  // private browsing, cleared site data, or a first load on this device.
  useEffect(() => {
    if (!clientId || restoring || snapshot) return;
    if (sessionList.entries.length === 0) void sessionList.refreshFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, restoring, snapshot]);

  // Another tab deleted the session we're looking at (spec FR-033/T094).
  useEffect(() => {
    const deletedId = advanceLock.deletedSessionId;
    if (!deletedId) return;
    sessionList.remove(deletedId);
    if (snapshot?.sessionId === deletedId) {
      reset();
      setDeletedNotice(true);
    }
    advanceLock.acknowledgeDeletedSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceLock.deletedSessionId]);

  /** Every advance (Step/Play, Play-from-here, Retry) goes through the
   * cross-tab lock (research R11, spec FR-059) — a locked-out attempt
   * resolves to `null`, same as any other "nothing happened" outcome. */
  const guardedStep = useCallback(
    async (mode?: "step" | "retry"): Promise<StepResponse | null> => {
      const result = await advanceLock.runLocked(() => step(mode));
      return result === "locked" ? null : result;
    },
    [advanceLock, step],
  );
  const autoRun = useAutoRun({ step: guardedStep });

  const [editMode, setEditMode] = useState(false);
  const [patch, setPatch] = useState<Partial<Record<EditableField, unknown>>>({});
  const [patchErrors, setPatchErrors] = useState<Partial<Record<EditableField, string>>>({});

  // The one new piece of interaction state this feature introduces
  // (data-model.md § 4): user selection wins until the next stage
  // completes, at which point the effect below moves it to the newest tab.
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  const isViewingHistory = viewed !== null;
  const displayedState = viewed?.state ?? pendingSave?.state ?? snapshot?.state;
  const displayedNext = viewed?.next ?? snapshot?.next ?? [];

  const path = snapshot
    ? deriveRunPath(
        history?.timeline ?? [],
        (viewed ?? snapshot).branchId,
        displayedNext,
        displayedState?.outcome ?? snapshot.state.outcome,
        (viewed ?? snapshot).checkpointId,
      )
    : null;
  const visible = path ? visibleTabs(path, displayedState?.critiques ?? []) : [];

  // FR-013: the active tab defaults to the most recently *completed* stage
  // — every time a *new* stage completes (the visible set grows), the
  // selection jumps forward to it regardless of where the visitor had
  // navigated; it only stays put while the set is unchanged (a plain
  // re-render) or shrinks without removing the current tab.
  const previousVisibleCount = useRef(0);
  useEffect(() => {
    const grew = visible.length > previousVisibleCount.current;
    if (grew || !activeTab || !visible.includes(activeTab)) {
      setActiveTab(visible[visible.length - 1] ?? null);
    }
    previousVisibleCount.current = visible.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.join(",")]);

  /** Clicking a graph node selects its tab; a no-op if that tab isn't
   * visible yet (data-model.md § 4). Neither `critique` nor
   * `draftRecipe`/`refine` has one single fixed tab (each pass gets its
   * own) — clicking any of them selects whichever tab of that kind is
   * newest, since that's the one it's currently pointing at. */
  function handleSelectNode(node: GraphNodeName) {
    if (node === "critique") {
      const tab = latestTabOfKind(visible, critiqueCycleOf);
      if (tab) setActiveTab(tab);
      return;
    }
    if (node === "draftRecipe" || node === "refine") {
      const tab = latestTabOfKind(visible, draftOccurrenceOf);
      if (tab) setActiveTab(tab);
      return;
    }
    const tab = STAGE_TO_TAB[node];
    if (tab && visible.includes(tab)) setActiveTab(tab);
  }

  /** The inverse direction for `AgentGraphProgress`'s `selectedNode` prop.
   * Any critique-cycle tab always resolves to the `critique` node (there's
   * only ever one on the graph); any draft tab resolves to whichever of
   * `draftRecipe`/`refine` is `current`, else `draftRecipe`. Everything
   * else is the first node mapping to the active tab. */
  const selectedNode: GraphNodeName | null = (() => {
    if (!activeTab || !path) return null;
    if (critiqueCycleOf(activeTab) !== null) return "critique";
    if (draftOccurrenceOf(activeTab) !== null) {
      return path.nodes.refine === "current" ? "refine" : "draftRecipe";
    }
    const candidates = (Object.keys(STAGE_TO_TAB) as GraphNodeName[]).filter(
      (node) => STAGE_TO_TAB[node] === activeTab,
    );
    return candidates.find((node) => path.nodes[node] === "current") ?? candidates[0] ?? null;
  })();

  // A non-latest draft tab's content isn't in `displayedState.recipeDraft`
  // (that only ever holds the current revision) — fetch and cache it by
  // checkpoint id, independent of the singular "viewing history" mode.
  const draftCheckpoints = path ? draftTabCheckpoints(path) : {};
  const latestDraftTab = latestTabOfKind(visible, draftOccurrenceOf);
  const isHistoricalDraftTab = activeTab !== null && draftOccurrenceOf(activeTab) !== null && activeTab !== latestDraftTab;
  const historicalDraftCheckpointId = activeTab && isHistoricalDraftTab ? draftCheckpoints[activeTab] : undefined;
  const [draftCache, setDraftCache] = useState<Record<string, RecipeDraft>>({});
  useEffect(() => {
    if (!historicalDraftCheckpointId || !snapshot || draftCache[historicalDraftCheckpointId]) return;
    const branchId = (viewed ?? snapshot).branchId;
    let cancelled = false;
    void fetchCheckpointState(snapshot.sessionId, branchId, historicalDraftCheckpointId).then((fetchedState) => {
      if (cancelled || !fetchedState?.recipeDraft) return;
      setDraftCache((prev) => ({ ...prev, [historicalDraftCheckpointId]: fetchedState.recipeDraft! }));
    });
    return () => {
      cancelled = true;
    };
  }, [historicalDraftCheckpointId, snapshot, viewed, fetchCheckpointState, draftCache]);

  if (!clientId || restoring) {
    return (
      <main style={{ padding: "var(--space-6)" }}>
        <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </main>
    );
  }

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
    if (!forkBranchId) return;

    // Editing `ingredients` always forks from the branch's genesis checkpoint
    // (research R3, spec FR-044 "ingredient-error recovery") — not wherever
    // the user happens to be looking — so the next real step re-runs
    // `parseIngredients` for real on the correction, rather than skipping
    // straight to `proposeDirections` on an unvalidated edit.
    const forkCheckpointId = patch.ingredients
      ? (history?.timeline.find((e) => e.threadId === forkBranchId && e.isBranchRoot)?.checkpointId ??
        viewed?.checkpointId ??
        snapshot?.checkpointId)
      : (viewed?.checkpointId ?? snapshot?.checkpointId);
    if (!forkCheckpointId) return;

    const result = await fork(forkBranchId, forkCheckpointId, patch);
    if (result) {
      setPatch({});
      setPatchErrors({});
      setEditMode(false);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    const ok = await deleteSessionById(sessionId);
    if (ok) {
      sessionList.remove(sessionId);
      advanceLock.broadcastSessionDeleted(sessionId);
    }
  }

  function handleOpenSession(sessionId: string) {
    setDeletedNotice(false);
    void openSession(sessionId);
  }

  function handleStartNewSession() {
    setDeletedNotice(false);
    setView("entry");
  }

  /** Abandons whatever session is active (still resumable later from the
   * list — `reset()` only clears this device's "current session" pointer,
   * nothing server-side) and lands on the session list, regardless of
   * whether this session was originally opened from there or started fresh
   * from the entry form. */
  function handleExitToSessions() {
    reset();
    setView("list");
  }

  return (
    <main style={{ padding: "var(--space-6)", maxWidth: "720px", margin: "0 auto" }}>
      {!snapshot ? (
        <>
          {deletedNotice && (
            <p role="alert" style={{ marginBottom: "var(--space-3)", color: "var(--color-danger)" }}>
              That session was deleted in another tab.
            </p>
          )}
          {view === "list" ? (
            <>
              <h1 style={{ fontSize: "var(--text-xl)", marginTop: 0 }}>Your sessions</h1>
              <SessionList
                entries={sessionList.entries}
                onOpen={handleOpenSession}
                onDelete={handleDeleteSession}
                onNewSession={handleStartNewSession}
              />
            </>
          ) : (
            <>
              <h1 style={{ fontSize: "var(--text-xl)", marginTop: 0 }}>What&apos;s in your kitchen?</h1>
              <EntryForm onSubmit={(ingredients) => start(ingredients)} disabled={loading} />
              {sessionList.entries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setView("list")}
                  style={{
                    marginTop: "var(--space-3)",
                    font: "inherit",
                    color: "var(--color-accent)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Back to your sessions
                </button>
              )}
            </>
          )}
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

          {/* Full-bleed: undoes <main>'s own horizontal padding just for
              the graph, so it gets the whole viewport width to scale into
              on narrow screens instead of losing 2*var(--space-6) to
              padding it doesn't need (the graph has no text running to the
              edge the way prose would). */}
          <div style={{ marginLeft: "calc(-1 * var(--space-6))", marginRight: "calc(-1 * var(--space-6))", padding: "0 var(--space-2)" }}>
            <AgentGraphProgress
              timeline={history?.timeline ?? []}
              branchId={(viewed ?? snapshot).branchId}
              next={displayedNext}
              outcome={displayedState?.outcome ?? snapshot.state.outcome}
              checkpointId={(viewed ?? snapshot).checkpointId}
              onSelectNode={handleSelectNode}
              selectedNode={selectedNode}
            />
          </div>

          {isViewingHistory && !editMode && (
            <p role="status" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
              Viewing an earlier step ({viewed.state.outcome === "in-progress" ? viewed.next[0] ?? "…" : viewed.state.outcome}). Stepping or editing from here starts a new version.{" "}
              <button
                type="button"
                onClick={clearViewedCheckpoint}
                style={{ font: "inherit", color: "var(--color-accent)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
              >
                Back to current
              </button>
            </p>
          )}

          {displayedState && editMode && visible.length > 0 && (
            // Edit mode shows every produced-so-far stage stacked at once,
            // matching the pre-existing multi-field-patch behavior (`patch`
            // can carry several fields into one `/fork` call) — the tab
            // strip's one-at-a-time view is for browsing only.
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {stackableTabs(visible).map((tab) => (
                <RunTabs
                  key={tab}
                  activeTab={tab}
                  state={displayedState}
                  visible={visible}
                  editable
                  onFieldChange={handleFieldChange}
                  onEditThisStage={startEdit}
                />
              ))}
            </div>
          )}

          {displayedState && !editMode && activeTab && visible.length > 0 && (
            <>
              <Tabs
                tabs={visible.map((id) => ({ id, label: tabLabel(id) }))}
                activeId={activeTab}
                onChange={(id) => setActiveTab(id as TabId)}
              />
              <RunTabs
                activeTab={activeTab}
                state={displayedState}
                visible={visible}
                editable={false}
                onEditThisStage={startEdit}
                historicalDraft={isHistoricalDraftTab ? (historicalDraftCheckpointId ? (draftCache[historicalDraftCheckpointId] ?? null) : null) : undefined}
              />
            </>
          )}

          {advanceLock.lockedElsewhere && (
            <p role="status" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
              This session is running in another tab.
            </p>
          )}

          <div
            style={{
              position: "sticky",
              bottom: 0,
              zIndex: 1,
              padding: "var(--space-3) var(--space-4)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-surface)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {editMode ? (
              <ActionToolbar
                next={displayedNext}
                outcome={displayedState?.outcome ?? "in-progress"}
                loading={loading || advanceLock.lockedElsewhere}
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
                onStep={() => guardedStep("step")}
                onNewSession={reset}
                onExit={handleExitToSessions}
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
                loading={loading || advanceLock.lockedElsewhere}
                sessionCapped={error?.error === "session-cap"}
                onRetry={() => guardedStep("retry")}
                onExit={handleExitToSessions}
              />
            ) : (
              <ActionToolbar
                next={displayedNext}
                outcome={snapshot.state.outcome}
                loading={loading || advanceLock.lockedElsewhere}
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
                onStep={() => guardedStep("step")}
                onNewSession={reset}
                onExit={handleExitToSessions}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
