import { describe, expect, it } from "vitest";
import { bestAvailableTitle, titleForStage } from "../../lib/session-title";
import type { State } from "../../lib/agent/state";

const baseState: State = {
  ingredients: [],
  constraints: { cuisine: null, maxMinutes: null, servings: null, diets: [] },
  directions: [],
  directionSelection: null,
  recipeDraft: null,
  critiques: [],
  finalRecipe: null,
  dishImage: null,
  refineCount: 0,
  outcome: "in-progress",
  failureReason: null,
};

describe("titleForStage", () => {
  it("returns the chosen direction's title after selectDirection", () => {
    const state: State = {
      ...baseState,
      directions: [
        { title: "Spinach Frittata", summary: "s", whyItFits: "w" },
        { title: "Egg Salad", summary: "s", whyItFits: "w" },
      ],
      directionSelection: { selectedIndex: 1, explanation: "e", clearFavorite: true },
    };
    expect(titleForStage("selectDirection", state)).toBe("Egg Salad");
  });

  it("returns null for selectDirection if no selection has been made yet", () => {
    expect(titleForStage("selectDirection", baseState)).toBeNull();
  });

  it("returns the draft's own title after draftRecipe", () => {
    const state: State = {
      ...baseState,
      recipeDraft: { title: "Spinach & Feta Frittata", servings: 2, ingredients: [], steps: [], toBuy: [] },
    };
    expect(titleForStage("draftRecipe", state)).toBe("Spinach & Feta Frittata");
  });

  it("returns the final recipe's own title after finalize", () => {
    const state: State = {
      ...baseState,
      finalRecipe: {
        title: "Spinach & Feta Frittata (serves 4)",
        servings: 4,
        ingredients: [],
        steps: [],
        toBuy: [],
        scaledServings: 4,
        nutrition: { calories: 300, protein: 20, carbs: 10, fat: 15, note: "approximate" },
      },
    };
    expect(titleForStage("finalize", state)).toBe("Spinach & Feta Frittata (serves 4)");
  });

  it("returns null for a stage with no title of its own", () => {
    expect(titleForStage("parseIngredients", baseState)).toBeNull();
    expect(titleForStage("proposeDirections", baseState)).toBeNull();
    expect(titleForStage("critique", baseState)).toBeNull();
    expect(titleForStage("refine", baseState)).toBeNull();
  });
});

describe("bestAvailableTitle", () => {
  const direction: State["directions"][number] = {
    title: "Direction title",
    summary: "s",
    whyItFits: "w",
  };
  const directionSelection: State["directionSelection"] = {
    selectedIndex: 0,
    explanation: "e",
    clearFavorite: true,
  };
  const draft: NonNullable<State["recipeDraft"]> = {
    title: "Draft title",
    servings: 2,
    ingredients: [],
    steps: [],
    toBuy: [],
  };
  const finalRecipe: NonNullable<State["finalRecipe"]> = {
    ...draft,
    title: "Final title",
    scaledServings: 2,
    nutrition: { calories: 1, protein: 1, carbs: 1, fat: 1, note: "approximate" },
  };

  it("prefers the finalized recipe's title over an earlier draft's or direction's", () => {
    const state: State = {
      ...baseState,
      directions: [direction],
      directionSelection,
      recipeDraft: draft,
      finalRecipe,
    };
    expect(bestAvailableTitle(state)).toBe("Final title");
  });

  it("falls back to the draft's title when there's no final recipe yet", () => {
    const state: State = { ...baseState, directions: [direction], directionSelection, recipeDraft: draft };
    expect(bestAvailableTitle(state)).toBe("Draft title");
  });

  it("falls back to the chosen direction's title when nothing has been drafted yet", () => {
    const state: State = { ...baseState, directions: [direction], directionSelection };
    expect(bestAvailableTitle(state)).toBe("Direction title");
  });

  it("returns null when nothing title-worthy exists yet", () => {
    expect(bestAvailableTitle(baseState)).toBeNull();
  });
});
