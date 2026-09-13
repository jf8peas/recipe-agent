import { describe, expect, it } from "vitest";
import { FIELD_CONSUMERS, EDITABLE_FIELDS } from "../../lib/field-consumers";

describe("FIELD_CONSUMERS", () => {
  it("maps every editable channel to its consumer node", () => {
    expect(FIELD_CONSUMERS).toEqual({
      ingredients: "parseIngredients",
      constraints: "proposeDirections",
      directions: "draftRecipe",
      recipeDraft: "critique",
      critiques: "refine",
      finalRecipe: "finalize",
    });
  });
});

describe("EDITABLE_FIELDS", () => {
  it("contains exactly the six editable Recipe State fields", () => {
    expect([...EDITABLE_FIELDS].sort()).toEqual(
      ["constraints", "critiques", "directions", "finalRecipe", "ingredients", "recipeDraft"].sort(),
    );
  });

  it("does not include a non-editable channel", () => {
    expect(EDITABLE_FIELDS.has("refineCount" as never)).toBe(false);
    expect(EDITABLE_FIELDS.has("outcome" as never)).toBe(false);
    expect(EDITABLE_FIELDS.has("failureReason" as never)).toBe(false);
  });
});
