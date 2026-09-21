import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routeAfterParseIngredients, routeAfterCritique, finalizedAtRefineLimit } from "../../lib/agent/edges";
import { INITIAL_STATE, toRawIngredient, type State } from "../../lib/agent/state";

function state(overrides: Partial<State>): State {
  return { ...INITIAL_STATE, ...overrides };
}

describe("routeAfterParseIngredients", () => {
  it("routes to proposeDirections when every ingredient is usable", () => {
    const s = state({
      ingredients: [{ ...toRawIngredient("eggs"), usable: true }],
    });
    expect(routeAfterParseIngredients(s)).toBe("proposeDirections");
  });

  it("routes to ingredientError when any ingredient is unusable", () => {
    const s = state({
      ingredients: [
        { ...toRawIngredient("eggs"), usable: true },
        { ...toRawIngredient("rocks"), usable: false, reason: "not-food" },
      ],
    });
    expect(routeAfterParseIngredients(s)).toBe("ingredientError");
  });
});

describe("routeAfterCritique", () => {
  const originalMax = process.env.MAX_REFINE_CYCLES;
  beforeEach(() => {
    process.env.MAX_REFINE_CYCLES = "2";
  });
  afterEach(() => {
    process.env.MAX_REFINE_CYCLES = originalMax;
  });

  it("routes to finalize when the latest critique is not blocking", () => {
    const s = state({
      critiques: [
        { cycle: 1, feasibility: "ok", flavorBalance: "ok", missingOrUnclear: [], blocking: false },
      ],
    });
    expect(routeAfterCritique(s)).toBe("finalize");
  });

  it("routes to refine when blocking and under the cycle limit", () => {
    const s = state({
      refineCount: 0,
      critiques: [
        { cycle: 1, feasibility: "bad", flavorBalance: "ok", missingOrUnclear: [], blocking: true },
      ],
    });
    expect(routeAfterCritique(s)).toBe("refine");
  });

  it("routes to finalize once the refine-cycle limit is exhausted, even if still blocking", () => {
    const s = state({
      refineCount: 2,
      critiques: [
        { cycle: 3, feasibility: "bad", flavorBalance: "ok", missingOrUnclear: [], blocking: true },
      ],
    });
    expect(routeAfterCritique(s)).toBe("finalize");
  });

  it("routes to finalize when there are no critiques yet", () => {
    expect(routeAfterCritique(state({}))).toBe("finalize");
  });
});

describe("finalizedAtRefineLimit", () => {
  it("is false when not finalized", () => {
    const s = state({
      outcome: "in-progress",
      critiques: [
        { cycle: 1, feasibility: "bad", flavorBalance: "ok", missingOrUnclear: [], blocking: true },
      ],
    });
    expect(finalizedAtRefineLimit(s)).toBe(false);
  });

  it("is false when finalized because the latest critique passed clean", () => {
    const s = state({
      outcome: "finalized",
      critiques: [
        { cycle: 1, feasibility: "ok", flavorBalance: "ok", missingOrUnclear: [], blocking: false },
      ],
    });
    expect(finalizedAtRefineLimit(s)).toBe(false);
  });

  it("is true when finalized while the latest critique was still blocking (cycle cap hit)", () => {
    const s = state({
      outcome: "finalized",
      refineCount: 2,
      critiques: [
        { cycle: 1, feasibility: "bad", flavorBalance: "ok", missingOrUnclear: [], blocking: true },
        { cycle: 2, feasibility: "bad", flavorBalance: "ok", missingOrUnclear: [], blocking: true },
        { cycle: 3, feasibility: "bad", flavorBalance: "ok", missingOrUnclear: [], blocking: true },
      ],
    });
    expect(finalizedAtRefineLimit(s)).toBe(true);
  });

  it("is false when finalized with no critiques at all (shouldn't happen via the graph, but no crash)", () => {
    expect(finalizedAtRefineLimit(state({ outcome: "finalized" }))).toBe(false);
  });
});
