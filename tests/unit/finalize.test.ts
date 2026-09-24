import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports, so every value they close
// over has to live in a `vi.hoisted()` bag rather than a plain top-level
// `const` (research/tasks.md T015 — the whole point of this file is
// asserting call order and captured timing, both mutated from inside these
// mocks).
const testState = vi.hoisted(() => ({
  callOrder: [] as string[],
  capturedImageTimeoutMs: undefined as number | undefined,
  capturedTextTimeoutMs: undefined as number | undefined,
  elapsedDuringTextCallMs: 0,
  textBehavior: "success" as "success" | "aborted",
  now: 1_000_000,
  // T027 (US3) — every way the image call's own step can go wrong, each of
  // which must still leave `finalize` resolving normally with `dishImage:
  // null`, never a rejected promise.
  imageBehavior: "success" as "success" | "throw" | "aborted" | "invalid-json" | "out-of-range",
  finalRecipe: {
    title: "Spinach Frittata",
    servings: 2,
    ingredients: [],
    steps: [],
    toBuy: [],
    scaledServings: 2,
    nutrition: { calories: 200, protein: 10, carbs: 5, fat: 10, note: "approximate" as const },
  },
}));

vi.mock("../../lib/db/images", () => ({
  insertImage: vi.fn(async () => ({
    id: 1,
    image_id: "img-1",
    thread_id: "t1",
    bytes: Buffer.alloc(0),
    mime: "image/png",
    created_at: new Date(),
  })),
}));

vi.mock("../../lib/agent/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/agent/models")>();
  return {
    ...actual,
    createChatModel: vi.fn((_modelId: string, options?: { timeoutMs?: number; modalities?: unknown }) => {
      if (options?.modalities) {
        // The image call is the only caller that passes `modalities`
        // (research R1) — the text call now also passes `options` (its own
        // `timeoutMs`), so `modalities` is what actually tells them apart.
        testState.capturedImageTimeoutMs = options.timeoutMs;
        return {
          invoke: async (_prompt: string, invokeConfig?: { signal?: AbortSignal }) => {
            testState.callOrder.push("image");
            if (testState.imageBehavior === "throw") {
              throw new Error("simulated image failure");
            }
            if (testState.imageBehavior === "aborted" || invokeConfig?.signal?.aborted) {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              throw err;
            }
            if (testState.imageBehavior === "invalid-json") {
              return {
                content: [
                  { type: "text", text: "not valid json" },
                  { type: "image", url: "data:image/png;base64,AAAA" },
                ],
              };
            }
            if (testState.imageBehavior === "out-of-range") {
              return {
                content: [
                  { type: "text", text: JSON.stringify({ focalX: 1.5, focalY: 0.5 }) },
                  { type: "image", url: "data:image/png;base64,AAAA" },
                ],
              };
            }
            return {
              content: [
                { type: "text", text: JSON.stringify({ focalX: 0.5, focalY: 0.5 }) },
                { type: "image", url: "data:image/png;base64,AAAA" },
              ],
            };
          },
        };
      }
      testState.capturedTextTimeoutMs = options?.timeoutMs;
      return {
        withStructuredOutput: () => ({
          invoke: async (_prompt: string, invokeConfig?: { signal?: AbortSignal }) => {
            testState.callOrder.push("text");
            // Simulates the text call itself consuming wall-clock time —
            // `Date.now()` is spied below, so bumping this here is what
            // "elapsed time" means for the deadline math in finalize.ts.
            testState.now += testState.elapsedDuringTextCallMs;
            if (testState.textBehavior === "aborted" || invokeConfig?.signal?.aborted) {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              throw err;
            }
            return { finalRecipe: testState.finalRecipe };
          },
        }),
      };
    }),
  };
});

import { finalize, SAFETY_MARGIN_MS, MIN_IMAGE_BUDGET_MS, TEXT_DEADLINE_MS } from "../../lib/agent/nodes/finalize";
import { INITIAL_STATE } from "../../lib/agent/state";

const MAX_DURATION_MS = 60_000; // matches every route's own `maxDuration = 60`

describe("finalize", () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testState.callOrder.length = 0;
    testState.capturedImageTimeoutMs = undefined;
    testState.elapsedDuringTextCallMs = 0;
    testState.now = 1_000_000;
    testState.imageBehavior = "success";
    testState.textBehavior = "success";
    testState.capturedTextTimeoutMs = undefined;
    dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => testState.now);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it("always runs the text call to completion before the image call starts", async () => {
    await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
    expect(testState.callOrder).toEqual(["text", "image"]);
  });

  it("computes the image call's deadline as MAX_DURATION_MS - elapsed - SAFETY_MARGIN_MS", async () => {
    testState.elapsedDuringTextCallMs = 10_000;
    await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
    expect(testState.capturedImageTimeoutMs).toBe(MAX_DURATION_MS - 10_000 - SAFETY_MARGIN_MS);
  });

  it("shrinks the computed deadline further as simulated elapsed time grows", async () => {
    testState.elapsedDuringTextCallMs = 30_000;
    await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
    expect(testState.capturedImageTimeoutMs).toBe(MAX_DURATION_MS - 30_000 - SAFETY_MARGIN_MS);
  });

  it("bounds the text call's own timeout to TEXT_DEADLINE_MS when there's no pre-node overhead", async () => {
    await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
    expect(testState.capturedTextTimeoutMs).toBe(TEXT_DEADLINE_MS);
    expect(TEXT_DEADLINE_MS).toBe(60_000 - SAFETY_MARGIN_MS);
  });

  it("shrinks the text call's own timeout by whatever elapsed before finalize() started (production timeout fix)", async () => {
    // Simulates real overhead before `finalize` ever runs — rate-limit
    // checks, the full checkpoint-history read (app/api/recipe/[sid]/step/
    // route.ts) — by threading a `requestStartedAt` that's already 20s in
    // the past. Measuring from this node's own `Date.now()` instead (the
    // bug actually observed in production) would have missed this entirely.
    const requestStartedAt = testState.now - 20_000;
    await finalize(INITIAL_STATE, {
      configurable: { thread_id: "t1", requestStartedAt },
    });
    expect(testState.capturedTextTimeoutMs).toBe(TEXT_DEADLINE_MS - 20_000);
  });

  it("never passes a negative timeout to AbortSignal.timeout even when pre-node overhead already exceeds the text deadline", async () => {
    const requestStartedAt = testState.now - (TEXT_DEADLINE_MS + 10_000);
    await finalize(INITIAL_STATE, {
      configurable: { thread_id: "t1", requestStartedAt },
    });
    expect(testState.capturedTextTimeoutMs).toBe(0);
  });

  it("a text-call timeout/abort still rejects finalize (unlike an image-call failure) — the stage genuinely failed", async () => {
    testState.textBehavior = "aborted";
    await expect(finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } })).rejects.toThrow();
    expect(testState.callOrder).toEqual(["text"]); // never reached the image call
  });

  describe("retry-image mode (reusing an existing finalRecipe)", () => {
    it("skips the text call entirely when config.configurable.reuseFinalRecipe is set", async () => {
      const reuseFinalRecipe = { ...testState.finalRecipe, title: "Already-Finalized Frittata" };
      const result = await finalize(INITIAL_STATE, {
        configurable: { thread_id: "t1", reuseFinalRecipe },
      });
      expect(testState.callOrder).toEqual(["image"]); // no "text" entry at all
      expect(result.finalRecipe).toEqual(reuseFinalRecipe);
      expect(result.outcome).toBe("finalized");
    });

    it("gives the image call almost the entire budget when the text call is skipped", async () => {
      const reuseFinalRecipe = testState.finalRecipe;
      await finalize(INITIAL_STATE, {
        configurable: { thread_id: "t1", reuseFinalRecipe },
      });
      // No text call ran, so elapsed time is ~0 — the image call gets
      // essentially the full budget minus the safety margin, not whatever
      // scraps a slow text model would otherwise have left behind.
      expect(testState.capturedImageTimeoutMs).toBe(MAX_DURATION_MS - SAFETY_MARGIN_MS);
    });
  });

  it("skips the image call entirely once the remaining budget falls below MIN_IMAGE_BUDGET_MS", async () => {
    testState.elapsedDuringTextCallMs = MAX_DURATION_MS - MIN_IMAGE_BUDGET_MS - SAFETY_MARGIN_MS + 1;
    const result = await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
    expect(testState.callOrder).toEqual(["text"]);
    expect(result.dishImage).toBeNull();
    expect(result.outcome).toBe("finalized");
  });

  // US3 (T027) — every way the image call's own step can fail must still
  // leave `finalize` resolving with the complete `finalRecipe` and
  // `outcome: "finalized"`, never a rejected promise (FR-003/004).
  describe("image-call failure isolation (US3)", () => {
    it("a thrown error from the image call never rejects finalize", async () => {
      testState.imageBehavior = "throw";
      const result = await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
      expect(result.finalRecipe).toEqual(testState.finalRecipe);
      expect(result.dishImage).toBeNull();
      expect(result.outcome).toBe("finalized");
    });

    it("an aborted image-call signal never rejects finalize", async () => {
      testState.imageBehavior = "aborted";
      const result = await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
      expect(result.finalRecipe).toEqual(testState.finalRecipe);
      expect(result.dishImage).toBeNull();
      expect(result.outcome).toBe("finalized");
    });

    it("invalid (non-JSON) crop text never rejects finalize", async () => {
      testState.imageBehavior = "invalid-json";
      const result = await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
      expect(result.finalRecipe).toEqual(testState.finalRecipe);
      expect(result.dishImage).toBeNull();
      expect(result.outcome).toBe("finalized");
    });

    it("an out-of-range crop value never rejects finalize", async () => {
      testState.imageBehavior = "out-of-range";
      const result = await finalize(INITIAL_STATE, { configurable: { thread_id: "t1" } });
      expect(result.finalRecipe).toEqual(testState.finalRecipe);
      expect(result.dishImage).toBeNull();
      expect(result.outcome).toBe("finalized");
    });
  });
});
