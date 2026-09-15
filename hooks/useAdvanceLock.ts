"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CHANNEL_NAME = "recipe-agent";

type AdvanceMessage =
  | { type: "advance:start"; branchId: string }
  | { type: "advance:end"; branchId: string }
  | { type: "session:deleted"; sessionId: string };

/**
 * Cross-tab advance mutex (research R11, spec FR-059): wraps an advance
 * action (Step/Play, Play-from-here, Retry) in a Web Locks exclusive lock
 * keyed by the branch's LangGraph `thread_id`, and broadcasts start/end over
 * a `BroadcastChannel` so *other* tabs can disable their own controls while
 * one tab is mid-advance. Best-effort UX guard only — there is deliberately
 * no server-side concurrency guard (spec Q3); the primary defense against a
 * true double-advance is the `/step` route's own `already-advanced` 409.
 */
export function useAdvanceLock(branchId: string | null) {
  const [lockedElsewhere, setLockedElsewhere] = useState(false);
  const [deletedSessionId, setDeletedSessionId] = useState<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    setLockedElsewhere(false);
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    const onMessage = (event: MessageEvent<AdvanceMessage>) => {
      const msg = event.data;
      if (msg.type === "advance:start" && branchId && msg.branchId === branchId) {
        setLockedElsewhere(true);
      } else if (msg.type === "advance:end" && branchId && msg.branchId === branchId) {
        setLockedElsewhere(false);
      } else if (msg.type === "session:deleted") {
        // spec FR-033: another tab deleted this session — surface it here too.
        setDeletedSessionId(msg.sessionId);
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [branchId]);

  const acknowledgeDeletedSession = useCallback(() => setDeletedSessionId(null), []);

  /** Runs `fn` under the branch's exclusive lock. Returns `"locked"` (without
   * calling `fn`) if another tab already holds it; falls back to running
   * unguarded where Web Locks isn't supported. */
  const runLocked = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | "locked"> => {
      if (!branchId || typeof navigator === "undefined" || !("locks" in navigator)) {
        return fn();
      }
      const lockName = `advance:${branchId}`;
      let acquired = false;
      let result: T | undefined;
      await navigator.locks.request(lockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (!lock) return; // another tab holds it
        acquired = true;
        channelRef.current?.postMessage({ type: "advance:start", branchId } satisfies AdvanceMessage);
        try {
          result = await fn();
        } finally {
          channelRef.current?.postMessage({ type: "advance:end", branchId } satisfies AdvanceMessage);
        }
      });
      return acquired ? (result as T) : "locked";
    },
    [branchId],
  );

  const broadcastSessionDeleted = useCallback((sessionId: string) => {
    channelRef.current?.postMessage({ type: "session:deleted", sessionId } satisfies AdvanceMessage);
  }, []);

  return { lockedElsewhere, runLocked, broadcastSessionDeleted, deletedSessionId, acknowledgeDeletedSession };
}
