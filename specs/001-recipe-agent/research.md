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

## R2 — Reading history and reconstructing the branch tree — **REVISED after the T016 spike**

**Superseded**: the original decision below assumed one thread = the whole
branch tree. The spike (R3) proved that's unsafe. Kept for context; see the
"CONFIRMED via spike" decision that follows.

~~**Decision**: `/history` calls `graph.getStateHistory({ configurable: { thread_id } })`
and returns, per snapshot: ... The client builds the tree in `lib/tree.ts` from
`parentCheckpointId` pointers — LangGraph returns a flat list, newest-first, and
forks share a parent.~~

**Decision (confirmed)**: One LangGraph `thread_id` = one branch = a strictly
linear checkpoint chain (no forking ever happens within a thread — see R3). Its
own history is still `graph.getStateHistory({ configurable: { thread_id } })`,
mapped the same way (`checkpointId`, `parentCheckpointId`, `stage`, `step`,
`createdAt`, `next`, derived `kind` — R4). The **cross-branch tree** is built by:
1. `lib/db/branches.ts` returns every branch row for the session:
   `(thread_id, parent_thread_id, forked_from_checkpoint_id)`.
2. For each branch, fetch its own linear history (step 1 above).
3. `lib/tree.ts` stitches them: a branch's first checkpoint's parent pointer
   *within the unified tree* is `forked_from_checkpoint_id` on its OWN
   `parent_thread_id`'s chain, not a LangGraph `parentConfig` (that field is
   `null` for a fresh thread's genesis checkpoint — it has no LangGraph-level
   parent, only an app-level one).

**Rationale**: `getStateHistory` remains the right primitive for a single
branch's own history (LangGraph still owns that). The tree ACROSS branches is
inherently app-level information now, since branches are physically separate
LangGraph threads.

**Alternatives considered**: Maintaining our own edge table mirroring every
checkpoint (redundant, drift risk, and still doesn't fix R3's bug); assuming one
thread's history spans the whole tree (proven wrong by the spike).

---

## R3 — Fork + replay, and the "which stage re-runs" problem — **REVISED after the T016 spike**

**Spike finding (CONFIRMED, blocking)**: `scripts/spike-timetravel.ts` (task
T016) ran the fork mechanism against a real Postgres wire protocol (PGlite) with
`@langchain/langgraph@1.4.15` and every published
`@langchain/langgraph-checkpoint-postgres` 1.0.x (1.0.0–1.0.5):

- `updateState(config, values, asNode)` only applies `values` when `asNode` is
  one of the names in that checkpoint's own `next` array; it never re-invokes a
  node's real logic (no model call) — it always means "asNode just returned
  `values`," advancing `next` along the graph's edges from `asNode`.
- **Bug**: calling `updateState` on a checkpoint that ALREADY has a child in the
  same thread (creating a second, edited child — i.e. an ordinary fork) silently
  drops the edit; the resulting checkpoint reflects the *existing* sibling's
  content instead. Root cause shape: a channel-version collision in that
  package's blob storage. Confirmed **absent** from `MemorySaver` on the
  identical scenario — the bug is specific to
  `@langchain/langgraph-checkpoint-postgres`, not LangGraph core.
- **Safe**: plain `invoke(null, { configurable: { thread_id, checkpoint_id } })`
  (real execution, no `updateState`) targeting a historical checkpoint correctly
  creates a proper sibling (`metadata.source === "fork"`) — no collision. Safe
  for **retry** (same input, no edits).
  **safe**: `updateState(freshThreadGenesisConfig, values, START)` on a
  brand-new, never-invoked `thread_id` — always correct, since nothing has ever
  branched from it.

**Decision**: each branch is realized as its **own LangGraph `thread_id`**
(constitution Principle IV). `/fork` (`{ branchId, checkpointId, patch }`):
1. Validates `patch` against the affected field schemas (spec FR-024), rejecting
   edits to non-editable channels (FR-025a).
2. Computes **replay-from stage** = the earliest stage that consumes any changed
   field, via the static `FIELD_CONSUMERS` map (unchanged):
   `ingredients → parseIngredients`, `constraints → proposeDirections`,
   `directions → draftRecipe`, `recipeDraft → critique`,
   `critiques → refine`, `finalRecipe → finalize`.
3. Reads the parent branch's own linear history up to and including the
   checkpoint that is replay-from-stage's immediate predecessor.
4. Creates a new `thread_id`; **replays** that prefix onto it with a chain of
   `updateState(currentTipOfNewThread, recordedValues, recordedStageName)`
   calls — one per prior stage, each targeting the new thread's own (always
   childless) tip, so every call is safe per the finding above. No model calls
   happen during replay.
5. Applies the user's `patch` as the LAST replay step, attributed to
   replay-from-stage's predecessor, so the new thread's tip has `next =
   [replayFromStage]`.
6. Inserts a `branches` row: `(thread_id, session_id, parent_thread_id,
   forked_from_checkpoint_id)`.
7. The subsequent **step** call runs replay-from-stage for real (genuine model
   call) against the edited state.

For the **ingredient-error recovery** case (spec FR-044), replay-from-stage is
always `parseIngredients` (the graph's first real node), so the replay chain in
step 4 is empty — the fork just seeds a fresh thread directly with the corrected
`ingredients`.

**Retry** (spec FR-051/FR-052, no edits) does **not** create a new thread — it
stays in the failed stage's thread and calls plain `invoke(null, { thread_id,
checkpoint_id: parentOfFailure })`, which safely creates a sibling per the
confirmed-safe path.

**Rationale**: this is the only pattern proven safe against the actual, shipped
checkpointer package. It keeps the constitution's intent (LangGraph checkpointer
as source of truth) for each branch's own history, while sidestepping the
version-collision bug entirely — a fresh thread can never collide with anything.

**Alternatives considered** (see the constitution v3.0.0 Sync Impact Report for
the full discussion): re-running the whole graph from START on every fork
(wasteful, extra model spend, and doesn't fix the bug — replaying via
`updateState` on a single thread still hits it); abandoning the LangGraph
checkpointer for the app's own hand-rolled state-tree table (bigger departure
from "LangGraph is the persistence layer," rejected in favor of the smaller,
targeted one-thread-per-branch fix).

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

## R4 addendum — Production data loss found in the wild (2026-09-25)

**What happened**: a real session's already-finalized recipe (feature 007's
"Generate photo" flow) went blank — the live tip's `finalRecipe` had reverted
to `null` even though `outcome` still read `"finalized"`, with a stale
`failureReason` left over from an unrelated earlier timeout. Diagnosed by
querying the production Neon database directly (read-only) and reconstructing
the checkpoint tree: `finalize` had succeeded **four separate times** from the
same pre-finalize checkpoint (the initial run plus repeated "Generate photo"
retries, each a `graph.invoke()`-created sibling — safe, per R3), then a
**later attempt failed** and this route's stage-failure `graph.updateState`
call (above) targeted that same pre-finalize checkpoint — which by then
already had those four successful children. This is exactly R3's confirmed
bug ("`updateState` on a checkpoint that already has a child... silently
drops the edit; the resulting checkpoint reflects the *existing* sibling's
content instead"), just not recognized as reachable from this code path
before now.

**Why R4's original "still-childless slot — safe" comment was wrong**: it
held for the *original* step/retry flow, where the `alreadyAdvanced` guard
normally blocks a second real advance from the same checkpoint before a
failure could ever land on an already-childed one — **except** two cases
`alreadyAdvanced` was never designed to cover:
1. Two failures in a row from the same checkpoint (no success in between) —
   `alreadyAdvanced` only counts non-failure children, so a checkpoint whose
   *only* child so far is itself a stage-failure still lets a plain "retry"
   through; if that retry *also* fails, this same `updateState` call now
   targets an already-childed checkpoint.
2. Feature 007's `retryingImageOnly` bypass (`app/api/recipe/[sid]/step/
   route.ts`), added long after this decision was written — it deliberately
   allows *repeated successful* children of one checkpoint (multiple
   "Generate photo" clicks), which is exactly the scenario above.

**Scope**: a full scan of every checkpoint in production (every parent with
≥2 children, checking whether any `updateState`-sourced child wasn't the
first) found exactly **one** affected session — not systemic, but a real,
reachable gap, not a one-off fluke either.

**Fix**: `siblingHistory` (already read earlier in the route, for the
`alreadyAdvanced` check) is reused to detect *any* existing child of
`fromCheckpointId` — regardless of that child's outcome — before the
stage-failure `updateState` call. If one exists, the route writes **nothing**
and returns a plain `500 retry-failed-unsafe-to-record` error instead; the
branch's real state (whatever its last real child already left it as) is
left untouched, and retrying is still safe (`invoke`, not `updateState`,
confirmed safe regardless of sibling count per R3). Recorded, not silently
swallowed — same principle as this route's existing "signal aborted" /
"provider cap" branches, which already write nothing on failure.

**A subtlety found while testing the fix**: `graph.invoke(null, {
checkpoint_id })` itself — independent of this route's own `updateState`
call — unconditionally writes an inert bookkeeping checkpoint (LangGraph's
own "fork"-tagged resume marker) the moment it resumes from a checkpoint
that isn't the thread's current tip, *before* the target node even runs.
This means a **second** failed retry still moves the branch's live tip away
from the first failure's checkpoint even with this fix applied — but since
that bookkeeping checkpoint is `invoke`-created (not `updateState`), it's
confirmed-safe per R3 and internally consistent (`outcome: "in-progress"`,
no stray `failureReason`), just an extra harmless entry in the checkpoint
history. The regression test (`tests/contract/step.test.ts`, "a second
consecutive failure...") asserts against the actual failure mode (no
contradictory field combination, like a `"finalized"` outcome with a null
`finalRecipe`) rather than an exact checkpoint match, precisely because of
this.

**Recovery for the one affected session**: the underlying `finalRecipe`
content was never lost — `checkpoint_blobs` still held it at its correct,
already-written version. The corrupted checkpoint's `channel_versions`
pointer for `finalRecipe` (and `dishImage`) had reverted to the pre-finalize
checkpoint's own stale version instead of the version the successful
sibling had already advanced to. Fixed with a single, targeted `UPDATE` on
that one `checkpoints` row's `channel_versions` (repointing `finalRecipe`/
`dishImage` to the correct, already-existing version and `failureReason`
back to its null-default version) — no blob bytes touched, nothing deleted.
Verified via `getGraph().getState()` (the same call the app itself makes)
and a full `StateSchema.safeParse` afterward.

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
