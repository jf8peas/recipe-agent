import { describe, expect, it } from "vitest";
import {
  IngredientSchema,
  ConstraintsSchema,
  DishDirectionSchema,
  RecipeDraftSchema,
  CritiqueSchema,
  FinalRecipeSchema,
  OutcomeSchema,
  StateSchema,
  INITIAL_STATE,
} from "../../lib/agent/state";

describe("IngredientSchema", () => {
  it("accepts a usable ingredient", () => {
    expect(
      IngredientSchema.safeParse({
        raw: "2 eggs",
        name: "egg",
        quantity: "2",
        pantryStaple: false,
        usable: true,
        reason: null,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown reason", () => {
    expect(
      IngredientSchema.safeParse({
        raw: "rocks",
        name: null,
        quantity: null,
        pantryStaple: false,
        usable: false,
        reason: "inedible",
      }).success,
    ).toBe(false);
  });
});

describe("ConstraintsSchema", () => {
  it("accepts all-null/empty constraints", () => {
    expect(
      ConstraintsSchema.safeParse({ cuisine: null, maxMinutes: null, servings: null, diets: [] })
        .success,
    ).toBe(true);
  });

  it("rejects a non-positive maxMinutes", () => {
    expect(
      ConstraintsSchema.safeParse({ cuisine: null, maxMinutes: 0, servings: null, diets: [] })
        .success,
    ).toBe(false);
  });
});

describe("DishDirectionSchema", () => {
  it("rejects a missing field", () => {
    expect(DishDirectionSchema.safeParse({ title: "Frittata", summary: "eggy" }).success).toBe(
      false,
    );
  });
});

describe("RecipeDraftSchema", () => {
  const valid = {
    title: "Spinach Frittata",
    servings: 2,
    ingredients: [{ name: "eggs", quantity: "2" }],
    steps: [{ order: 1, text: "Whisk eggs", minutes: 2, technique: null }],
    toBuy: [],
  };

  it("accepts a valid draft", () => {
    expect(RecipeDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a step with order 0", () => {
    const invalid = { ...valid, steps: [{ ...valid.steps[0], order: 0 }] };
    expect(RecipeDraftSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("CritiqueSchema", () => {
  it("rejects a negative cycle", () => {
    expect(
      CritiqueSchema.safeParse({
        cycle: -1,
        feasibility: "ok",
        flavorBalance: "ok",
        missingOrUnclear: [],
        blocking: false,
      }).success,
    ).toBe(false);
  });
});

describe("FinalRecipeSchema", () => {
  it("rejects a nutrition note other than 'approximate'", () => {
    expect(
      FinalRecipeSchema.safeParse({
        title: "Spinach Frittata",
        servings: 2,
        ingredients: [],
        steps: [],
        toBuy: [],
        scaledServings: 2,
        nutrition: { calories: 100, protein: 10, carbs: 5, fat: 5, note: "exact" },
      }).success,
    ).toBe(false);
  });
});

describe("OutcomeSchema", () => {
  it("rejects an unknown outcome", () => {
    expect(OutcomeSchema.safeParse("archived").success).toBe(false);
  });
});

describe("StateSchema / INITIAL_STATE", () => {
  it("INITIAL_STATE validates against StateSchema", () => {
    expect(StateSchema.safeParse(INITIAL_STATE).success).toBe(true);
  });
});
