import { describe, expect, it } from "vitest";
import { DishImageSchema } from "../../lib/agent/state";

const valid = {
  imageId: "img_abc123",
  focalX: 0.62,
  focalY: 0.41,
  zoom: 1.15,
  alt: "Photo of Spinach Frittata",
};

describe("DishImageSchema", () => {
  it("accepts a valid focal point with a zoom", () => {
    expect(DishImageSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a null zoom (no zoom applied)", () => {
    expect(DishImageSchema.safeParse({ ...valid, zoom: null }).success).toBe(true);
  });

  it.each([
    ["focalX", -0.01],
    ["focalX", 1.01],
    ["focalY", -0.01],
    ["focalY", 1.01],
  ])("rejects an out-of-range %s of %d", (field, value) => {
    expect(DishImageSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });

  it("rejects a zoom below 1", () => {
    expect(DishImageSchema.safeParse({ ...valid, zoom: 0.5 }).success).toBe(false);
  });

  it("rejects a missing imageId", () => {
    const { imageId: _imageId, ...withoutImageId } = valid;
    expect(DishImageSchema.safeParse(withoutImageId).success).toBe(false);
  });
});
