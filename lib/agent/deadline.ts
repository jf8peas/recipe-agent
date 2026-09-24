import type { LangGraphRunnableConfig } from "@langchain/langgraph";

/**
 * Matches every route's own `export const maxDuration = 60` (Next.js
 * requires that as a literal at each route module's top level, so it can't
 * be imported from here) — the single Vercel function ceiling every node's
 * own model call budget is computed against.
 */
export const MAX_DURATION_MS = 60_000;

/** Reserved for whatever has to happen after a node's own model call
 * returns. On success that's just the LangGraph checkpoint write (and,
 * for `finalize`'s text call, the image call that follows — research.md
 * R3). On *failure* it's more: `app/api/recipe/[sid]/step/route.ts`'s catch
 * block writes a stage-failure checkpoint, re-reads state, fetches
 * branches, and rebuilds the timeline (another full checkpoint-history
 * scan, same cost as the already-advanced guard's own read) — confirmed in
 * production to need more than 5s on a heavily-retried branch (17+
 * checkpoints): the text call aborted correctly with ~5s left, but the
 * failure-cleanup path itself then ran out of that margin and got
 * hard-killed by Vercel mid-cleanup. 10s gives that path real headroom
 * without meaningfully shrinking any node's own model-call budget. */
export const DEFAULT_RESERVE_MS = 10_000;

/**
 * A per-node model call's own hard deadline, bound to what's actually left
 * of the *request's* 60s budget — not a fresh clock started inside the
 * node. `config.configurable.requestStartedAt` is set once, by
 * `app/api/recipe/[sid]/step/route.ts`, before any of its own DB work
 * (ownership/rate-limit checks, the full checkpoint-history read for the
 * already-advanced guard) — all of which already spends against the same
 * ceiling and grows with a branch's checkpoint count.
 *
 * Every node needs this because `createChatModel()` sets `maxRetries: 2`
 * unconditionally: a slow or flaky model call can otherwise retry up to 3
 * total attempts, each up to `STAGE_TIMEOUT_MS`, with nothing bounding the
 * *sum* — confirmed in production as a Vercel platform-level 60s kill with
 * no application-level error at all (first found in `finalize`'s text call,
 * research.md R3's addenda; then independently in `critique`, which is what
 * generalized this from a `finalize`-only fix into this shared helper).
 *
 * `AbortSignal.timeout(ms)` counts `ms` from *this call*, not from
 * `requestStartedAt` — so the deadline passed to it has to already be
 * shrunk by elapsed time; that's what this function does, computed fresh
 * each time it's called rather than baked into a constant.
 */
export function requestDeadline(
  config: LangGraphRunnableConfig | undefined,
  reserveMs: number = DEFAULT_RESERVE_MS,
): { timeoutMs: number; signal: AbortSignal } {
  const startedAt = (config?.configurable?.requestStartedAt as number | undefined) ?? Date.now();
  const timeoutMs = Math.max(0, MAX_DURATION_MS - (Date.now() - startedAt) - reserveMs);
  const signal = config?.signal
    ? AbortSignal.any([config.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  return { timeoutMs, signal };
}
