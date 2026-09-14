import { describe, expect, it } from "vitest";
import { isProviderCapError, providerCapEnvelope } from "../../lib/agent/provider-errors";

describe("isProviderCapError", () => {
  it("detects a 402 (insufficient credit)", () => {
    expect(isProviderCapError({ status: 402 })).toBe(true);
  });

  it("detects a 429 (provider quota)", () => {
    expect(isProviderCapError({ status: 429 })).toBe(true);
  });

  it("does not flag an unrelated status", () => {
    expect(isProviderCapError({ status: 500 })).toBe(false);
  });

  it("does not flag a plain Error with no status", () => {
    expect(isProviderCapError(new Error("boom"))).toBe(false);
  });

  it("does not flag non-object values", () => {
    expect(isProviderCapError("boom")).toBe(false);
    expect(isProviderCapError(null)).toBe(false);
    expect(isProviderCapError(undefined)).toBe(false);
  });
});

describe("providerCapEnvelope", () => {
  it("returns the provider-cap error shape", () => {
    expect(providerCapEnvelope().error).toBe("provider-cap");
  });
});
