// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoRun } from "../../hooks/useAutoRun";
import type { StepResponse } from "../../hooks/useSession";
import { INITIAL_STATE } from "../../lib/agent/state";

function stepResponse(outcome: (typeof INITIAL_STATE)["outcome"] = "in-progress"): StepResponse {
  return {
    branchId: "b1",
    checkpointId: "c1",
    state: { ...INITIAL_STATE, outcome },
    dishImageUrl: null,
    next: outcome === "in-progress" ? ["proposeDirections"] : [],
    kind: outcome === "in-progress" ? "normal" : outcome,
    timeline: [],
  };
}

describe("useAutoRun", () => {
  it("play() loops step() until a stopping outcome (e.g. finalized)", async () => {
    let calls = 0;
    const step = vi.fn(async () => {
      calls += 1;
      return stepResponse(calls >= 3 ? "finalized" : "in-progress");
    });
    const { result } = renderHook(() => useAutoRun({ step }));

    await act(async () => {
      await result.current.play();
    });

    expect(calls).toBe(3);
    expect(result.current.running).toBe(false);
  });

  it("stops when step() returns null (cancelled, error, or a limit rejection)", async () => {
    let calls = 0;
    const step = vi.fn(async () => {
      calls += 1;
      return calls >= 2 ? null : stepResponse("in-progress");
    });
    const { result } = renderHook(() => useAutoRun({ step }));

    await act(async () => {
      await result.current.play();
    });

    expect(calls).toBe(2);
    expect(result.current.running).toBe(false);
  });

  it("pause() during a run halts within one stage (spec SC-012)", async () => {
    let calls = 0;
    let resolveStep: (() => void) | undefined;
    const step = vi.fn(() => {
      calls += 1;
      return new Promise<StepResponse>((resolve) => {
        resolveStep = () => resolve(stepResponse("in-progress"));
      });
    });
    const { result } = renderHook(() => useAutoRun({ step }));

    let playPromise: Promise<void> = Promise.resolve();
    act(() => {
      playPromise = result.current.play();
    });
    expect(result.current.running).toBe(true);

    // Pause before the first (in-flight) step resolves.
    act(() => {
      result.current.pause();
    });
    expect(result.current.running).toBe(false);

    // Let the in-flight step resolve — the loop must NOT start a second one.
    await act(async () => {
      resolveStep?.();
      await playPromise;
    });

    expect(calls).toBe(1);
    expect(result.current.running).toBe(false);
  });
});
