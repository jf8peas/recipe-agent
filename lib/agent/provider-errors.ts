const PROVIDER_CAP_STATUSES = new Set([402, 429]);

/**
 * Detects an OpenRouter/OpenAI-compatible error caused by a spending or quota
 * cap on the project's account or key (spec FR-066) — surfaced by
 * `@langchain/openai` as an `APIError`-shaped object with a `status` of 402
 * (insufficient credit) or 429 (provider-side rate/quota limit). Distinct
 * from this app's OWN 429s, which are returned before a model call is ever
 * made, so any 402/429 thrown out of `graph.invoke`/`updateState` here is
 * unambiguously the provider's.
 */
export function isProviderCapError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && PROVIDER_CAP_STATUSES.has(status);
}

export function providerCapEnvelope(): { error: "provider-cap"; message: string } {
  return {
    error: "provider-cap",
    message:
      "This service is temporarily unavailable because a usage limit was reached. Please try again later.",
  };
}
