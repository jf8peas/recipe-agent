"use client";

import { useCallback, useRef, useState } from "react";
import type { StepResponse } from "./useSession";

export interface AutoRunSession {
  step: (mode?: "step" | "retry") => Promise<StepResponse | null>;
}

const STOPPING_OUTCOMES = new Set(["finalized", "ingredient-error", "stage-failure"]);

/**
 * Client-side loop of single `/step` calls (Auto-run — constitution: never a
 * server-side loop). Stops at finalize, ingredient-error, stage-failure, any
 * error (limits, save-failure, network), Cancel, or Pause (spec FR-035,
 * FR-038). Reads `step`'s own return value each iteration rather than a
 * snapshot prop/ref, so it never acts on a stale render.
 */
export function useAutoRun(session: AutoRunSession) {
  const [running, setRunning] = useState(false);
  const shouldContinueRef = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const pause = useCallback(() => {
    shouldContinueRef.current = false;
    setRunning(false);
  }, []);

  const play = useCallback(async () => {
    if (shouldContinueRef.current) return; // already running
    shouldContinueRef.current = true;
    setRunning(true);

    while (shouldContinueRef.current) {
      const result = await sessionRef.current.step("step");
      if (!shouldContinueRef.current) break; // Paused/cancelled during this step

      // No result (cancelled, network error, or a limit rejection) or a
      // malformed/pendingSave response (no `state`) — stop and hand control
      // back to the user; the underlying error is already on `session`.
      if (!result || !result.state) break;
      if (STOPPING_OUTCOMES.has(result.state.outcome)) break;
    }

    shouldContinueRef.current = false;
    setRunning(false);
  }, []);

  return { running, play, pause };
}
