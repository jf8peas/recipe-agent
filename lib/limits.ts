export type LimitRejection = {
  error: "rate-limited" | "daily-cap" | "global-cap" | "session-cap";
  message: string;
  retryAfterSeconds?: number;
};

/**
 * Pure limit checks (spec FR-061–FR-066, FR-077). Each takes counts already
 * fetched by the caller (`lib/db/usage.ts`, `sessions.stage_count`) so these
 * stay unit-testable without a database. Returns `null` when under the limit.
 */

export function checkRateLimit(
  countInWindow: number,
  maxPerWindow: number,
  windowSeconds: number,
): LimitRejection | null {
  if (countInWindow < maxPerWindow) return null;
  return {
    error: "rate-limited",
    message: "You're creating sessions too quickly. Please wait a moment and try again.",
    retryAfterSeconds: windowSeconds,
  };
}

export function checkDailyClientCap(
  countInDay: number,
  dailyStagesPerClient: number,
): LimitRejection | null {
  if (countInDay < dailyStagesPerClient) return null;
  return {
    error: "daily-cap",
    message: "You've reached today's usage limit. Please try again tomorrow.",
  };
}

export function checkGlobalCap(
  globalCountInDay: number,
  dailyStagesGlobal: number,
): LimitRejection | null {
  if (globalCountInDay < dailyStagesGlobal) return null;
  return {
    error: "global-cap",
    message: "This app has reached its usage limit for today. Please try again tomorrow.",
  };
}

export function checkSessionCap(
  stageCount: number,
  maxStagesPerSession: number,
): LimitRejection | null {
  if (stageCount < maxStagesPerSession) return null;
  return {
    error: "session-cap",
    message: "This session has reached its maximum number of steps. Start a new session to continue.",
  };
}
