"use client";

import { useCallback, useEffect, useState } from "react";
import { useClientId } from "./useClientId";
import type { State, Constraints } from "@/lib/agent/state";
import type { TimelineEntry } from "@/lib/tree";

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

interface HistoryResponse {
  branches: { threadId: string; parentThreadId: string | null }[];
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
interface StepResponse {
  branchId: string;
  checkpointId: string;
  state: State;
  next: string[];
  kind: string;
  timeline: TimelineEntry[];
}

/**
 * Drives one session: restores the active `sessionId` from `localStorage` on
 * mount (spec FR-003b — no per-session URL), and exposes `start`/`step`
 * against the API routes, all scoped by the device-private `clientId`.
 */
export function useSession() {
  const clientId = useClientId();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SessionApiError | null>(null);
  const [restoring, setRestoring] = useState(true);

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

  const resume = useCallback(
    async (sessionId: string) => {
      const history = await callApi<HistoryResponse>(`/api/recipe/${sessionId}/history`);
      if (!history) return false;
      const rootBranch = history.branches[0];
      if (!rootBranch) return false;
      const leaf = [...history.timeline]
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
        timeline: history.timeline,
      });
      return true;
    },
    [callApi],
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
    },
    [callApi],
  );

  const step = useCallback(
    async (mode: "step" | "retry" = "step") => {
      if (!snapshot) return;
      const res = await callApi<StepResponse>(`/api/recipe/${snapshot.sessionId}/step`, {
        method: "POST",
        body: JSON.stringify({
          branchId: snapshot.branchId,
          fromCheckpointId: snapshot.checkpointId,
          mode,
        }),
      });
      if (!res) return;
      setSnapshot({ sessionId: snapshot.sessionId, ...res });
    },
    [snapshot, callApi],
  );

  const reset = useCallback(() => {
    window.localStorage.removeItem(SESSION_ID_KEY);
    setSnapshot(null);
    setError(null);
  }, []);

  return { clientId, snapshot, loading, error, restoring, start, step, reset };
}
