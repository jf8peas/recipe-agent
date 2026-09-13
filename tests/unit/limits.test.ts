import { describe, expect, it } from "vitest";
import {
  checkRateLimit,
  checkDailyClientCap,
  checkGlobalCap,
  checkSessionCap,
} from "../../lib/limits";

describe("checkRateLimit", () => {
  it("allows one below the max", () => {
    expect(checkRateLimit(7, 8, 60)).toBeNull();
  });
  it("rejects at the max", () => {
    const r = checkRateLimit(8, 8, 60);
    expect(r?.error).toBe("rate-limited");
    expect(r?.retryAfterSeconds).toBe(60);
  });
  it("rejects above the max", () => {
    expect(checkRateLimit(9, 8, 60)?.error).toBe("rate-limited");
  });
});

describe("checkDailyClientCap", () => {
  it("allows one below the cap", () => {
    expect(checkDailyClientCap(199, 200)).toBeNull();
  });
  it("rejects at the cap", () => {
    expect(checkDailyClientCap(200, 200)?.error).toBe("daily-cap");
  });
});

describe("checkGlobalCap", () => {
  it("allows one below the cap", () => {
    expect(checkGlobalCap(1999, 2000)).toBeNull();
  });
  it("rejects at the cap", () => {
    expect(checkGlobalCap(2000, 2000)?.error).toBe("global-cap");
  });
});

describe("checkSessionCap", () => {
  it("allows one below the cap", () => {
    expect(checkSessionCap(59, 60)).toBeNull();
  });
  it("rejects at the cap", () => {
    expect(checkSessionCap(60, 60)?.error).toBe("session-cap");
  });
  it("rejects above the cap", () => {
    expect(checkSessionCap(61, 60)?.error).toBe("session-cap");
  });
});
