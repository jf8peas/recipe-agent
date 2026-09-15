"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useClientId } from "./useClientId";
import type { State, Constraints } from "@/lib/agent/state";
import type { TimelineEntry } from "@/lib/tree";
import type { EditableField } from "@/lib/field-consumers";

const SESSION_ID_KEY = "recipe-agent.currentSessionId";

export interface SessionApiError {
  status: number;
  error: string;
  message: string;
}

export interface SessionSnapshot {
  sessionId: string;
  branchId: string;
  checkpointId: string;
  state: State;
  next: string[];
  kind?: string;
  timeline: TimelineEntry[];
}

export interface BranchInfo {
  threadId: string;
  parentThreadId: string | null;
  forkedFromCheckpointId: string | null;
}

export interface HistoryResponse {
  branches: BranchInfo[];
  timeline: TimelineEntry[];
}

interface StateResponse {
  checkpointId: string;
  state: State;
  next: string[];
  kind: string;
}
interface StartResponse {
  sessionId: string;
  branchId: string;
  checkpointId: string;
  state: State;
  next: string[];
  timeline: TimelineEntry[];
}
export interface StepResponse {
  branchId: string;
  checkpointId: string;
  state: State;
  next: string[];
  kind: string;
  timeline: TimelineEntry[];
}
interface CommitResponse {
  checkpointId: string;
  timeline: TimelineEntry[];
}
interface ForkResponse {
  branchId: string;
  checkpointId: string;
  state: State;
  replayFromStage: string;
  timeline: TimelineEntry[];
}

/** A checkpoint being browsed that isn't necessarily the live tip (spec FR-020/FR-021). */
export interface ViewedCheckpoint {
  branchId: string;
  checkpointId: string;
  state: State;
  next: string[];
  kind?: string;
}

/** A computed-but-unsaved stage result held after a `202` from `/step` or
 * `/step/commit` (spec FR-080–FR-082) — `fromCheckpointId` is the checkpoint
 * the failed attempt advanced from, needed to retry the save. */
export interface PendingSave {
  state: State;
  fromCheckpointId: string;
}

/**
 * Drives one session: restores the active `sessionId` from `localStorage` on
 * mount (spec FR-003b — no per-session URL), and exposes `start`/`step`/
 * `step` `mode:"retry"`/`step/commit`/`fork` mutations plus `/history` and
 * `/state` reads, all scoped by the device-private `clientId`.
 */
export function useSession() {
  const clientId = useClientId();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [viewed, setViewed] = useState<ViewedCheckpoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SessionApiError | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [runningStage, setRunningStage] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  // The checkpoint a stage-failure was attempted FROM (its parent) — a
  // retry must target this, never the stage-failure checkpoint itself.
  // Attributing the failure checkpoint via `updateState(asNode=failedStage)`
  // (research R4) gives it whatever `next` failedStage's OWN outgoing edge
  // computes (e.g. an unconditional edge to the following stage) — nothing
  // about that reflects the failure, so resuming a plain `invoke` FROM the
  // failure checkpoint would silently skip the failed stage entirely rather
  // than actually retrying it.
  const [retryFromCheckpointId, setRetryFromCheckpointId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /** Raw fetch: returns the HTTP status alongside the parsed body, with none
   * of `callApi`'s "treat non-2xx as `error`" behavior — callers that need to
   * distinguish `200` from `202` (step/commit's save-failure hold) use this
   * directly instead. */
  const postJson = useCallback(
    async <T,>(
      url: string,
      body: unknown,
      signal?: AbortSignal,
    ): Promise<{ status: number; json: T } | null> => {
      if (!clientId) return null;
      try {
        const res = await fetch(url, {
          method: "POST",
          signal,
          headers: { "X-Client-Id": clientId, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        return { status: res.status, json: json as T };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return null;
        setError({
          status: 0,
          error: "network-error",
          message: err instanceof Error ? err.message : "Network error.",
        });
        return null;
      }
    },
    [clientId],
  );

  const callApi = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T | null> => {
      if (!clientId) return null;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, {
          ...init,
          headers: {
            ...(init?.headers ?? {}),
            "X-Client-Id": clientId,
            "content-type": "application/json",
          },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError({
            status: res.status,
            error: json.error ?? "unknown-error",
            message: json.message ?? "Something went wrong.",
          });
          return null;
        }
        return json as T;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Cancelled (spec FR-072–FR-074): not an error — the pre-stage
          // snapshot is left exactly as it was, nothing to surface.
          return null;
        }
        setError({
          status: 0,
          error: "network-error",
          message: err instanceof Error ? err.message : "Network error.",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [clientId],
  );

  const fetchHistory = useCallback(
    async (sessionId: string): Promise<HistoryResponse | null> => {
      const res = await callApi<HistoryResponse>(`/api/recipe/${sessionId}/history`);
      if (res) setHistory(res);
      return res;
    },
    [callApi],
  );

  const resume = useCallback(
    async (sessionId: string) => {
      const historyRes = await fetchHistory(sessionId);
      if (!historyRes) return false;
      const rootBranch = historyRes.branches[0];
      if (!rootBranch) return false;
      const leaf = [...historyRes.timeline]
        .filter((e) => e.threadId === rootBranch.threadId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1);
      if (!leaf) return false;
      const stateRes = await callApi<StateResponse>(
        `/api/recipe/${sessionId}/state?branchId=${rootBranch.threadId}&checkpointId=${leaf.checkpointId}`,
      );
      if (!stateRes) return false;
      setSnapshot({
        sessionId,
        branchId: rootBranch.threadId,
        checkpointId: stateRes.checkpointId,
        state: stateRes.state,
        next: stateRes.next,
        kind: stateRes.kind,
        timeline: historyRes.timeline,
      });
      // Resuming directly into a stage-failure tip — a Retry needs its
      // parent, looked up from the timeline (see the `step` comment above).
      setRetryFromCheckpointId(
        stateRes.kind === "stage-failure" ? (leaf.parentCheckpointId ?? null) : null,
      );
      return true;
    },
    [callApi, fetchHistory],
  );

  useEffect(() => {
    if (!clientId) return;
    const sessionId = window.localStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      setRestoring(false);
      return;
    }
    void resume(sessionId).then((ok) => {
      if (!ok) window.localStorage.removeItem(SESSION_ID_KEY);
      setRestoring(false);
    });
    // Only on first mount / once clientId becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const start = useCallback(
    async (ingredients: string[], constraints?: Partial<Constraints>) => {
      const res = await callApi<StartResponse>("/api/recipe/start", {
        method: "POST",
        body: JSON.stringify({ ingredients, constraints }),
      });
      if (!res) return;
      window.localStorage.setItem(SESSION_ID_KEY, res.sessionId);
      setSnapshot({ ...res, kind: undefined });
      setHistory({ branches: [{ threadId: res.branchId, parentThreadId: null, forkedFromCheckpointId: null }], timeline: res.timeline });
      setViewed(null);
      setPendingSave(null);
      setRetryFromCheckpointId(null);
    },
    [callApi],
  );

  /** Advances one stage from whichever checkpoint is currently being viewed
   * (spec FR-028 "Play from here") — the live tip when nothing else is being
   * viewed. A plain `invoke` from a historical checkpoint safely creates a
   * sibling (research R3), so this needs no special-casing beyond sourcing
   * `branchId`/`fromCheckpointId` from `viewed` when set; the result becomes
   * the new tip either way. */
  const step = useCallback(
    async (mode: "step" | "retry" = "step"): Promise<StepResponse | null> => {
      if (!snapshot) return null;
      const sessionId = snapshot.sessionId;
      const branchId = viewed?.branchId ?? snapshot.branchId;
      const fromCheckpointId =
        mode === "retry" && retryFromCheckpointId
          ? retryFromCheckpointId
          : (viewed?.checkpointId ?? snapshot.checkpointId);
      const sourceNext = viewed?.next ?? snapshot.next;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setRunningStage(sourceNext[0] ?? null);
      setLoading(true);
      setError(null);
      try {
        const result = await postJson<
          StepResponse | { pendingSave: true; state: State; computedCheckpointHint?: string }
        >(
          `/api/recipe/${sessionId}/step`,
          { branchId, fromCheckpointId, mode },
          controller.signal,
        );
        if (!result) return null;

        if (result.status === 202) {
          const body = result.json as { state: State };
          setPendingSave({ state: body.state, fromCheckpointId });
          return null;
        }
        if (result.status < 200 || result.status >= 300) {
          const body = result.json as { error?: string; message?: string };
          setError({
            status: result.status,
            error: body.error ?? "unknown-error",
            message: body.message ?? "Something went wrong.",
          });
          return null;
        }

        const res = result.json as StepResponse;
        setSnapshot({ sessionId, ...res });
        setViewed(null);
        // Remember this attempt's source so a Retry targets the same
        // parent again; clear it once a stage actually succeeds.
        setRetryFromCheckpointId(res.kind === "stage-failure" ? fromCheckpointId : null);
        void fetchHistory(sessionId);
        return res;
      } finally {
        abortControllerRef.current = null;
        setRunningStage(null);
        setLoading(false);
      }
    },
    [snapshot, viewed, retryFromCheckpointId, postJson, fetchHistory],
  );

  /** Cancels the in-flight stage, if any (spec FR-072–FR-075) — writes nothing. */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /** Persists a held state after a `202` from `/step` — retries only the
   * checkpoint write, never re-invokes the node (spec FR-080–FR-082). */
  const commitHeldState = useCallback(
    async (heldState: State, fromCheckpointId: string) => {
      if (!snapshot) return null;
      setLoading(true);
      setError(null);
      try {
        const result = await postJson<CommitResponse | { pendingSave: true }>(
          `/api/recipe/${snapshot.sessionId}/step/commit`,
          { branchId: snapshot.branchId, heldState, fromCheckpointId },
        );
        if (!result) return null;

        if (result.status === 202) {
          setPendingSave({ state: heldState, fromCheckpointId });
          return null;
        }
        if (result.status < 200 || result.status >= 300) {
          const body = result.json as { error?: string; message?: string };
          setError({
            status: result.status,
            error: body.error ?? "unknown-error",
            message: body.message ?? "Something went wrong.",
          });
          return null;
        }

        const res = result.json as CommitResponse;
        setSnapshot({ ...snapshot, checkpointId: res.checkpointId, state: heldState, timeline: res.timeline });
        setViewed(null);
        setPendingSave(null);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [snapshot, postJson],
  );

  /** Retries saving the currently-held unsaved result, if any. */
  const retrySave = useCallback(async () => {
    if (!pendingSave) return;
    await commitHeldState(pendingSave.state, pendingSave.fromCheckpointId);
  }, [pendingSave, commitHeldState]);

  /** Views any saved checkpoint without advancing the agent (spec FR-020/FR-021). */
  const viewCheckpoint = useCallback(
    async (branchId: string, checkpointId: string) => {
      if (!snapshot) return;
      if (branchId === snapshot.branchId && checkpointId === snapshot.checkpointId) {
        setViewed(null);
        return;
      }
      const res = await callApi<StateResponse>(
        `/api/recipe/${snapshot.sessionId}/state?branchId=${branchId}&checkpointId=${checkpointId}`,
      );
      if (!res) return;
      setViewed({ branchId, checkpointId, state: res.state, next: res.next, kind: res.kind });
    },
    [snapshot, callApi],
  );

  const clearViewedCheckpoint = useCallback(() => setViewed(null), []);

  /** Edit & Fork (spec FR-026–FR-029): seeds a new branch, replaying up to `checkpointId` with `patch` applied. */
  const fork = useCallback(
    async (branchId: string, checkpointId: string, patch: Partial<Record<EditableField, unknown>>) => {
      if (!snapshot) return null;
      const res = await callApi<ForkResponse>(`/api/recipe/${snapshot.sessionId}/fork`, {
        method: "POST",
        body: JSON.stringify({ branchId, checkpointId, patch }),
      });
      if (!res) return null;
      setSnapshot({
        sessionId: snapshot.sessionId,
        branchId: res.branchId,
        checkpointId: res.checkpointId,
        state: res.state,
        next: [res.replayFromStage],
        timeline: res.timeline,
      });
      setViewed(null);
      setRetryFromCheckpointId(null);
      // The fork response's `timeline` doesn't carry the updated `branches`
      // list (only `/history` does) — refetch so BranchTimeline picks up
      // the new branch, not just its checkpoints.
      void fetchHistory(snapshot.sessionId);
      return res;
    },
    [snapshot, callApi, fetchHistory],
  );

  const reset = useCallback(() => {
    window.localStorage.removeItem(SESSION_ID_KEY);
    setSnapshot(null);
    setHistory(null);
    setViewed(null);
    setPendingSave(null);
    setRetryFromCheckpointId(null);
    setError(null);
  }, []);

  /** Opens an existing session from the session list (spec FR-004) — the
   * same logic the initial-mount restore uses, exposed for the list UI. */
  const openSession = useCallback(
    async (sessionId: string) => {
      const ok = await resume(sessionId);
      if (ok) window.localStorage.setItem(SESSION_ID_KEY, sessionId);
      return ok;
    },
    [resume],
  );

  /** Permanently deletes a session (spec FR-055/FR-056). If it's the active
   * one, resets to the no-session state. */
  const deleteSessionById = useCallback(
    async (sessionId: string): Promise<boolean> => {
      const res = await callApi<{ deleted: true }>(`/api/recipe/${sessionId}/delete`, { method: "POST" });
      if (!res) return false;
      if (snapshot?.sessionId === sessionId) reset();
      return true;
    },
    [callApi, snapshot, reset],
  );

  return {
    clientId,
    snapshot,
    history,
    viewed,
    loading,
    error,
    restoring,
    runningStage,
    pendingSave,
    start,
    step,
    cancel,
    commitHeldState,
    retrySave,
    viewCheckpoint,
    clearViewedCheckpoint,
    fork,
    openSession,
    deleteSessionById,
    fetchHistory,
    reset,
  };
}
