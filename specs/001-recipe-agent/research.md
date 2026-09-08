# Phase 0 Research: Recipe Agent

Resolves the technical unknowns for [plan.md](plan.md). Each item: **Decision**,
**Rationale**, **Alternatives considered**. Nothing here reopens a product
decision already settled in [spec.md](spec.md) or the
[constitution](../../.specify/memory/constitution.md).

---

## R1 — LangGraph.js: one stage per request with global interrupts

**Decision**: Build one `StateGraph` compiled with
`checkpointer` + `interruptAfter: [<every node name>]` (an explicit array, not
`"*"`). Advancing one stage = one call:
- **start**: `graph.invoke({ …initialInput }, { configurable: { thread_id } })` runs to the first interrupt (one node).
- **step**: `graph.invoke(null, { configurable: { thread_id } })` resumes from the thread's current checkpoint and runs one more node.
- **step from a past checkpoint**: `graph.invoke(null, { configurable: { thread_id, checkpoint_id } })`.

**Rationale**: With every node interrupted-after, each `invoke` executes exactly
one super-step, matching constitution Principle V and spec FR-006/FR-038. An
explicit node-name array is deterministic and future-proof against `"*"` support
differences between LangGraph.js versions.

**Alternatives considered**: `interruptAfter: "*"` (works in Python, less certain
in JS — rejected for determinism); running the whole graph server-side with a
long `maxDuration` (violates Principle V and risks the 60 s ceiling); LangGraph
Platform server (separate deploy, rejected by Principle I).

---

## R2 — Reading history and reconstructing the branch tree

**Decision**: `/history` calls `graph.getStateHistory({ configurable: { thread_id } })`
and returns, per snapshot: `checkpointId` (`snapshot.config.configurable.checkpoint_id`),
`parentCheckpointId` (`snapshot.parentConfig?.configurable.checkpoint_id ?? null`),
`stage` (`snapshot.metadata.writes` keys, or `snapshot.metadata.source`),
`step` (`snapshot.metadata.step`), `createdAt`, `next` (`snapshot.next`), and a
derived `kind` (see R4). The client builds the tree in `lib/tree.ts` from
`parentCheckpointId` pointers — LangGraph returns a flat list, newest-first, and
forks share a parent (constitution Principle IV, spec FR-019).

**Rationale**: `getStateHistory` is the supported time-travel primitive; every
snapshot already carries `parentConfig`. Tree assembly is a pure function → unit
testable.

**Alternatives considered**: Maintaining our own edge table mirroring the
checkpoints (redundant, drift risk); assuming linear history (wrong — forks
break it).

---

## R3 — Fork + replay, and the "which stage re-runs" problem

**Decision**: `/fork` takes `{ checkpointId, patch }`. It:
1. Validates `patch` against the affected field schemas (spec FR-024).
2. Computes **replay-from stage** = the earliest stage that consumes any changed
   field, via a static `FIELD_CONSUMERS` map:
   `ingredients → parseIngredients`, `constraints → proposeDirections`,
   `directions → draftRecipe`, `recipeDraft → critique`,
   `critiques → refine`, `finalRecipe → finalize`.
3. Calls `graph.updateState(sourceConfig, patch, asNode)` where `sourceConfig`
   targets the checkpoint whose next step is the replay-from stage, and `asNode`
   is that stage's predecessor. Returns the new `checkpointId`.
4. The subsequent **step** runs the replay-from stage fresh against the edited
   state, so its output and its outgoing conditional edge both reflect the edit
   (spec FR-028/FR-029, FR-044).

For the **ingredient-error recovery** case (spec FR-044) the selected checkpoint
is the `ingredientError` output; editing `ingredients` sets replay-from =
`parseIngredients`, so validation re-runs from the top of the branch.

**Rationale**: `updateState` with the right `asNode` is the only way to make
LangGraph re-evaluate a node's edges on resume; attributing the write to the
node itself would skip its execution (it would not re-classify). The
`FIELD_CONSUMERS` map keeps the rule explicit and testable.

**Risk / spike**: exact `updateState` + `asNode` + resume semantics vary
slightly by LangGraph.js version. First implementation task is a throwaway spike
(`scripts/spike-timetravel.ts`) that runs start → step → updateState → resume and
asserts the forked branch re-runs the intended node. If `asNode` cannot target a
predecessor cleanly, fall back to: fork from the *parent* checkpoint of the
replay-from stage (branch visually starts one row higher — acceptable).

**Alternatives considered**: Re-running the whole graph from START on every fork
(wasteful, extra model spend); a custom "replay controller" outside LangGraph
(reinvents the checkpointer).

---

## R4 — Outcome / entry `kind` derivation

**Decision**: A plain `outcome` channel (`Annotation<"in-progress" | "finalized"
| "ingredient-error" | "stage-failure">`, default `"in-progress"`, last-value-
wins). `ingredientError` node sets `"ingredient-error"`, `finalize` sets
`"finalized"`. `stage-failure` is **not** written by a node — the step route
writes a stage-failure checkpoint via `graph.updateState(config, { outcome:
"stage-failure", failureReason }, asNode: <failed stage>)` when a node throws
(spec FR-050). The timeline entry `kind` = `outcome` for terminal/failure rows,
else `in-progress` / `normal`.

**Rationale**: Keeps node code pure; the route owns error handling and is the
only place that knows the request failed. Attributing the failure checkpoint to
the failed node keeps it a sibling in the tree (spec FR-052).

**Alternatives considered**: try/catch inside each node writing its own failure
state (couples every node to persistence, and a node that throws can't reliably
write); a separate `failures` table (splits history across two stores).

---

## R5 — OpenRouter via `@langchain/openai`

**Decision**: All node model calls use `ChatOpenAI` from `@langchain/openai`
pointed at OpenRouter:

```ts
new ChatOpenAI({
  model: MODELS[key],                       // e.g. "openai/gpt-4.1-mini", "anthropic/claude-opus-4.1"
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": process.env.PUBLIC_URL, "X-Title": "Recipe Agent" },
  },
  timeout: Number(process.env.STAGE_TIMEOUT_MS ?? 45000),
  maxRetries: 2,
})
```

Structured output: `model.withStructuredOutput(NodeOutputSchema, { name })` per
node (constitution Principle II). `MODELS` lives in `lib/agent/models.ts`:
`{ default: process.env.MODEL_DEFAULT, critique: process.env.MODEL_CRITIQUE }`
with sane fallback IDs; `critique` resolves to a stronger model.

**Rationale**: Constitution Principle I mandates OpenRouter as the sole
model integration point. `ChatOpenAI` speaks the OpenAI-compatible API OpenRouter
exposes. One env-driven map = model swaps are a one-file / one-config change
(constitution "Model routing").

**Deviation note**: The planning request named `claude-opus-5` directly for
`critique`. We comply with Principle I by routing through OpenRouter and letting
`MODEL_CRITIQUE` resolve to a strong model (an Anthropic Opus-class model ID on
OpenRouter is a valid value). No direct `@langchain/anthropic` dependency.

**Alternatives considered**: `@langchain/anthropic` + OpenAI SDK directly
(forbidden by Principle I); OpenRouter's own SDK (not needed — OpenAI-compatible).

---

## R6 — Cancel: abort propagation

**Decision**: The `/step` route creates an `AbortController`; its `signal` is
passed to `graph.invoke(..., { signal })` and flows through LangChain to the
`fetch` call to OpenRouter. The client's Cancel button aborts the in-flight
`fetch` to `/step`; the route detects `request.signal.aborted` (Next.js exposes
it) and aborts the model call. A cancelled stage writes nothing (spec
FR-072–FR-074).

**Rationale**: `AbortSignal` is the standard chain; LangChain's `ChatOpenAI`
forwards `signal` to the HTTP layer. Aborting a streaming request stops token
billing; for non-streaming, it stops the wait (spec FR-073 "where the provider
supports it").

**Alternatives considered**: A server-side "cancel token" table polled by the
route (adds latency and DB load); no cancel (rejected by spec Q1/FR-072).

---

## R7 — Neon pool + compiled-graph singletons on Vercel

**Decision**: `lib/db/pool.ts` exports a module-scope `pg.Pool` built from
`DATABASE_URL` (Neon **pooled** `-pooler` string), `max: 3`, created once per
lambda instance. `lib/agent/runtime.ts` exports a memoised
`getGraph()` that builds the `PostgresSaver` (reusing the pool) and compiles the
graph once, caching the instance on `globalThis` to survive HMR in dev
(constitution Principle III).

```ts
const g = globalThis as any;
export function getGraph() {
  if (!g.__recipeGraph) g.__recipeGraph = buildAndCompile(getPool());
  return g.__recipeGraph as CompiledGraph;
}
```

All API routes: `export const runtime = "nodejs"`, `export const maxDuration = 60`.

**Rationale**: Cold starts create a fresh module scope; a per-request pool or
recompile exhausts Neon connections and wastes CPU. `globalThis` caching is the
documented Next.js pattern for dev HMR.

**Alternatives considered**: `PostgresSaver.fromConnString` creating its own pool
per call (connection storms); Edge runtime (impossible — `pg` needs Node).

---

## R8 — Migrations

**Decision**: `scripts/migrate.ts` (run via `npm run migrate`, and as a Vercel
**pre-deploy**/build step) does, in order:
1. `await checkpointer.setup()` — creates LangGraph checkpoint tables.
2. Applies `lib/db/migrations/*.sql` for app tables (`sessions`, `usage_events`)
   tracked in a `_app_migrations` table.

Never called from a request handler (constitution Principle III).

**Rationale**: Deterministic, idempotent, outside the request path. `setup()` is
idempotent per LangGraph docs.

**Alternatives considered**: An ORM migration tool (Prisma/Drizzle) — extra
load-bearing dependency; adopt later only if schema churn justifies it.

---

## R9 — App tables: ownership, counters, usage ledger

**Decision**: Two app tables alongside the checkpoint tables:

- `sessions(thread_id PK, client_id, title, created_at, last_activity, stage_count, status)`
  — `status` ∈ `active | capped`. `stage_count` increments on every completed
  stage execution; at `MAX_STAGES_PER_SESSION` → `capped` (spec FR-077).
- `usage_events(id, client_id, thread_id, kind, created_at)` — one row per stage
  execution (and per rejected-for-limit attempt, flagged). Rate/cap checks are
  aggregate queries with time windows (spec FR-061/FR-062).

**Rationale**: One ledger answers all four limits (per-client short window,
per-client 24 h, global 24 h, per-session) with `COUNT(*) … WHERE created_at > …`.
Postgres is already the datastore — no new dependency (constitution Principle I).

**Alternatives considered**: Upstash Redis / Vercel KV rate-limit (new
load-bearing dependency → constitution amendment); in-memory counters (lost on
cold start, wrong across lambda instances).

---

## R10 — Client identifier

**Decision**: 32 random bytes → base64url (~256 bits, exceeds the ≥128-bit
requirement, spec FR-003) via `crypto.getRandomValues`, stored at
`localStorage["recipe-agent.clientId"]`, sent as `X-Client-Id` on every request.
A tiny `useClientId()` hook mints-on-first-use and is SSR-safe (returns null
until mounted).

**Rationale**: `crypto.randomUUID()` is only 122 bits; explicit 32-byte draw
clears the bar and is still one line. Header (not cookie) keeps it out of
same-site navigation and makes the "device-private" model explicit.

**Alternatives considered**: `randomUUID()` (just under the bar); a cookie
(sent on every request automatically, but muddies the "not an account" framing
and risks CSRF-shaped thinking).

---

## R11 — Cross-tab advance lock

**Decision**: `useAdvanceLock()` wraps every advance in
`navigator.locks.request(\`advance:${threadId}\`, { mode: "exclusive",
ifAvailable: true }, …)`. If the lock is unavailable → the advance controls are
disabled and a "running in another tab" note shows. A `BroadcastChannel
("recipe-agent")` publishes `advance:start|end|done` and `session:deleted` so
other tabs disable controls and refetch `/history` (spec FR-059, SC-019). No
server-side concurrency guard (spec Q3).

**Rationale**: Web Locks is the native cross-tab mutex, auto-released on tab
close. Support: Chrome/Edge 69+, Firefox 96+, Safari 15.4+ — within target range;
older/absent → the button-`disabled`-on-click guard still covers the common
double-click.

**Alternatives considered**: `SharedWorker` (poor Safari story); a `localStorage`
lock record with TTL (fiddly stale-lock handling); server-side unique constraint
(explicitly ruled out by the device-private clarification).

---

## R12 — Save-after-run failure

**Decision**: The `/step` route runs the node, gets `newState`, then persists
(the `invoke` itself writes the checkpoint; if `invoke` resolves the checkpoint
is written). If the checkpoint write throws, retry up to 3× with backoff inside
the route. On continued failure the route returns `202` with the computed state
and a `pendingSave: true` flag; the client holds it, shows an "unsaved" badge,
and offers "retry save" which re-POSTs to `/step/commit` with the held state.
The node is never re-invoked (spec FR-080–FR-083).

**Rationale**: LangGraph's `invoke` couples execution and checkpoint write; the
retry/hold logic must live in the route, which is the only place that has both
the result and the failure. `/step/commit` replays only the persistence via
`graph.updateState`.

**Risk**: If `invoke` writes the checkpoint atomically and only the *post-write*
bookkeeping (our `sessions.stage_count` update) fails, that's a simpler retry.
The spike (R3) also measures where the write boundary is.

**Alternatives considered**: Treat as stage-failure and re-run (re-bills the
user — rejected by spec Q4); write the result to `localStorage` and reconcile
later (spec chose option B, not C).

---

## R13 — Purge job

**Decision**: `vercel.json` cron (`0 3 * * *`) → `GET /api/cron/purge` (guarded
by `CRON_SECRET`) deletes `sessions` with
`last_activity < now() - SESSION_PURGE_DAYS` and their checkpoint rows
(`checkpointer.deleteThread(threadId)` or explicit `DELETE`s in a txn). Also
covers sessions orphaned by a lost client identifier (spec FR-032/FR-057).

**Rationale**: Vercel Cron is a platform feature of the existing deploy target,
not a new dependency. Nightly is fine for a 90-day window.

**Alternatives considered**: External scheduler (new dependency); purge-on-read
(unpredictable, and orphaned sessions are never read).

---

## R14 — Testing stack

**Decision**: **Vitest** (unit + integration), **Playwright** + **@axe-core/playwright**
(E2E + WCAG 2.2 AA, spec FR-084/SC-027), **PGlite** or a disposable Neon branch
for integration DB. Node model calls in tests use a `FakeChatModel` returning
schema-valid fixtures; one optional live smoke test behind an env flag.

**Rationale**: Vitest is the standard for Vite/Next TS projects; Playwright+axe
is the standard automated a11y gate. Deterministic fake model keeps CI free and
fast.

**Alternatives considered**: Jest (slower ESM story); real model calls in CI
(cost, flakiness, rate limits).

---

## R15 — Design tokens / Claude Design handoff

**Decision**: A single `app/tokens.css` (CSS custom properties: color, space,
radius, type scale, z-index) consumed by all components (constitution Principle
VI). Claude Design artboards are translated into these tokens once the working
vertical slice exists (per RECOMMENDATION.md §6). Tailwind optional, configured
to read the same tokens if used.

**Rationale**: One source of truth for visual values; matches the constitution's
"design tokens live in a single shared source" and the RECOMMENDATION build
order (design after the data slice).

**Alternatives considered**: Per-component styling (drift, violates Principle VI);
committing to full visual design now (RECOMMENDATION §7 says wait).

---

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| One-stage-per-request mechanics | R1 — explicit `interruptAfter` array, `invoke(null, config)` |
| Tree reconstruction | R2 — `getStateHistory` + `parentConfig`, pure builder |
| Fork/replay + re-run-which-stage | R3 — `FIELD_CONSUMERS` map + `updateState`/`asNode`; spike first |
| Stage-failure checkpoint | R4 — route writes it via `updateState`, `asNode` = failed stage |
| Model integration | R5 — `ChatOpenAI` → OpenRouter, env-driven `MODELS` map |
| Cancel | R6 — `AbortSignal` end to end |
| Singletons on serverless | R7 — module + `globalThis` cache, `nodejs` runtime |
| Migrations | R8 — `scripts/migrate.ts`, `setup()` + SQL files |
| Ownership / limits storage | R9 — `sessions` + `usage_events` in Postgres |
| Client identifier | R10 — 32-byte base64url, `X-Client-Id` header |
| Cross-tab lock | R11 — Web Locks + BroadcastChannel |
| Save-failure recovery | R12 — route retry, `202` + hold, `/step/commit` |
| Purge | R13 — Vercel cron → guarded route |
| Testing | R14 — Vitest + Playwright + axe, fake model |
| Design tokens | R15 — single `tokens.css`, Claude Design after slice |

No open **NEEDS CLARIFICATION** remain.
