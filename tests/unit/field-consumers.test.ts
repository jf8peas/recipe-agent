import { describe, expect, it } from "vitest";
import {
  FIELD_CONSUMERS,
  EDITABLE_FIELDS,
  FIELD_SCHEMAS,
  earliestReplayStage,
} from "../../lib/field-consumers";

describe("FIELD_CONSUMERS", () => {
  it("maps every editable channel to its consumer node", () => {
    expect(FIELD_CONSUMERS).toEqual({
      ingredients: "parseIngredients",
      constraints: "proposeDirections",
      directions: "selectDirection",
      directionSelection: "draftRecipe",
      recipeDraft: "critique",
      critiques: "refine",
      finalRecipe: "finalize",
    });
  });
});

describe("EDITABLE_FIELDS", () => {
  it("contains exactly the seven editable Recipe State fields", () => {
    expect([...EDITABLE_FIELDS].sort()).toEqual(
      [
        "constraints",
        "critiques",
        "directions",
        "directionSelection",
        "finalRecipe",
        "ingredients",
        "recipeDraft",
      ].sort(),
    );
  });

  it("does not include a non-editable channel", () => {
    expect(EDITABLE_FIELDS.has("refineCount" as never)).toBe(false);
    expect(EDITABLE_FIELDS.has("outcome" as never)).toBe(false);
    expect(EDITABLE_FIELDS.has("failureReason" as never)).toBe(false);
  });
});

describe("FIELD_SCHEMAS", () => {
  it("validates a full array-shaped edit, not a single element", () => {
    expect(
      FIELD_SCHEMAS.ingredients.safeParse([
        {
          raw: "egg",
          name: "egg",
          quantity: null,
          pantryStaple: false,
          usable: true,
          reason: null,
        },
      ]).success,
    ).toBe(true);
    expect(
      FIELD_SCHEMAS.ingredients.safeParse({
        raw: "egg",
        name: "egg",
        quantity: null,
        pantryStaple: false,
        usable: true,
        reason: null,
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid constraints edit", () => {
    expect(
      FIELD_SCHEMAS.constraints.safeParse({
        cuisine: null,
        maxMinutes: -1,
        servings: null,
        diets: [],
      }).success,
    ).toBe(false);
  });

  it("rejects an edit that would leave zero candidate directions (spec FR-015, research R4)", () => {
    expect(FIELD_SCHEMAS.directions.safeParse([]).success).toBe(false);
    expect(
      FIELD_SCHEMAS.directions.safeParse([
        { title: "Frittata", summary: "eggy bake", whyItFits: "uses the eggs" },
      ]).success,
    ).toBe(true);
  });

  it("validates a direction-selection edit", () => {
    expect(
      FIELD_SCHEMAS.directionSelection.safeParse({
        selectedIndex: 0,
        explanation: "Best fit for the ingredients.",
        clearFavorite: true,
      }).success,
    ).toBe(true);
    expect(FIELD_SCHEMAS.directionSelection.safeParse({ selectedIndex: -1 }).success).toBe(false);
  });
});

describe("earliestReplayStage", () => {
  it("picks the single field's consumer stage", () => {
    expect(earliestReplayStage(["recipeDraft"])).toBe("critique");
  });

  it("picks the earliest stage among several changed fields", () => {
    expect(earliestReplayStage(["finalRecipe", "ingredients", "critiques"])).toBe(
      "parseIngredients",
    );
  });

  it("is order-independent", () => {
    expect(earliestReplayStage(["directions", "constraints"])).toBe("proposeDirections");
  });
});
