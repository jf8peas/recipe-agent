# Implementation Plan: Recipe Agent

**Feature Directory**: `specs/001-recipe-agent`
**Created**: 2026-09-02
**Status**: Draft
**Spec**: [spec.md](spec.md)
**Constitution**: [v2.0.1](../../.specify/memory/constitution.md)
**Input**: Technical plan for a Next.js/Vercel app — LangGraph.js agent graph in
Route Handlers, Zod state, Neon + PostgresSaver checkpointing, 3-panel
time-travel UI.

## Summary

A single Next.js (App Router, TypeScript) app deployed to Vercel. A six-node
LangGraph.js graph (`parseIngredients → proposeDirections → draftRecipe →
critique ⇄ refine → finalize`, plus an `ingredientError` terminal) runs inside
Node.js Route Handlers, one super-step per request, with every node
interrupted-after. `PostgresSaver` on Neon is the single source of truth for
state history; forks and replay use `getStateHistory` / `updateState`. The client
is a three-panel view — branch timeline (left, built from `parentConfig`),
per-field state editor (centre), context actions (right) — with a device-private
`clientId` (in `localStorage`) as the only credential; no session identifier ever
appears in the URL and navigation between the session list and a session is
client-side only. All model calls go through OpenRouter via `@langchain/openai`.

## Technical Context

**Language / Runtime**: TypeScript, Node.js 20
**Framework**: Next.js 15 (App Router)
**Primary Dependencies**: `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `@langchain/openai`, `@langchain/core`, `pg`, `zod`, `react`
**Storage**: Neon Postgres (pooled) — LangGraph checkpoint tables + app tables `sessions`, `usage_events`
**External Services**: OpenRouter (OpenAI-compatible API) — all node model calls
**Testing**: Vitest (unit + integration), Playwright + `@axe-core/playwright` (E2E + WCAG 2.2 AA), PGlite / Neon branch for integration DB, `FakeChatModel` fixtures
**Target Platform**: Vercel serverless (Node.js runtime), Vercel Cron for purge
**Performance Goals**: first stage output ≤ 30 s (SC-002); a finalized recipe in ≤ 6 advances (SC-001); timeline navigation < 10 s (SC-008)
**Constraints**: `maxDuration = 60` per handler; no Edge runtime for DB/graph routes; one stage per request; no new load-bearing dependency without a constitution amendment
**Scale/Scope**: personal / hobby; single-digit concurrent users; sessions ≤ `MAX_STAGES_PER_SESSION` executions each; 90-day retention

All unknowns resolved in Phase 0 — see [research.md](research.md). No open
**NEEDS CLARIFICATION**.

## Constitution Check (pre-design)

| Principle | Status | Notes |
|---|---|---|
| **I. Fixed Technology Stack** | PASS (1 documented deviation) | Next.js/Vercel ✅; `@langchain/langgraph` in Route Handlers ✅; **OpenRouter via `@langchain/openai`** ✅ (`MODELS` map in `lib/agent/models.ts`); Neon + `checkpoint-postgres` ✅; Zod ✅. Deviation: the request named `claude-opus-5` for critique — we comply by routing through OpenRouter with `MODEL_CRITIQUE` resolving to an Opus-class model; no `@langchain/anthropic`. See Complexity Tracking. |
| **II. Schema-Validated Graph State** | PASS | Zod schema per channel (`lib/agent/state.ts`); every node validates input and output; LLM output via `withStructuredOutput(schema)`; parse failure ⇒ stage-failure. |
| **III. Node.js Serverless Runtime Discipline** | PASS | Every route: `runtime = "nodejs"`, `maxDuration = 60`. Pooled Neon string; `pg.Pool` + compiled graph cached in module / `globalThis` scope (research R7). `checkpointer.setup()` only in `scripts/migrate.ts`. |
| **IV. Time-Travel State Integrity** | PASS | Every editable channel is a plain `Annotation` (last-value-wins); `critiques` grows via the node returning a full array, not a reducer; branch tree built from `parentConfig` in `lib/tree.ts`. The `updateState`/`asNode` replay nuance is a spike (research R3), not a violation. |
| **V. Client-Driven Step Execution** | PASS | `interruptAfter: [<all nodes>]`; one `invoke` per request; Auto-run = client loop of single-step requests (spec FR-038); no open-ended server run. |
| **VI. Session & UI Boundaries** | PASS | 3-panel layout ✅; no auth framework ✅; single `tokens.css` ✅. Session ownership is a device-private `clientId` in `localStorage`; no session identifier appears in the URL; navigation is client-side only — matches Principle VI as amended in **constitution v2.0.1**. |

**Result**: PASS WITH 1 DOCUMENTED DEVIATION (the critique-model note; the
session-identity item was resolved by constitution amendment v2.0.1).

## Project Structure

```
recipe-agent/
├── app/
│   ├── layout.tsx                     # <AppHeader> + <tokens.css>
│   ├── page.tsx                       # the whole app: session list ⇄ 3-panel session view, switched client-side (no per-session route; active threadId in localStorage)
│   ├── tokens.css                     # design tokens (single source, Principle VI)
│   └── api/
│       ├── recipe/
│       │   ├── start/route.ts
│       │   ├── mine/route.ts
│       │   └── [tid]/
│       │       ├── step/route.ts
│       │       ├── step/commit/route.ts
│       │       ├── fork/route.ts
│       │       ├── history/route.ts
│       │       ├── state/route.ts
│       │       └── delete/route.ts
│       └── cron/purge/route.ts
├── lib/
│   ├── agent/
│   │   ├── state.ts                   # Zod schemas + Annotation.Root
│   │   ├── models.ts                  # MODELS map → OpenRouter (Principle I)
│   │   ├── prompts.ts                 # one template per node
│   │   ├── nodes/{parseIngredients,proposeDirections,draftRecipe,critique,refine,finalize,ingredientError}.ts
│   │   ├── edges.ts                   # conditional edge fns (pure, unit-tested)
│   │   ├── provider-errors.ts         # OpenRouter 402/429 → provider-cap envelope (FR-066)
│   │   ├── graph.ts                   # StateGraph wiring + compile opts
│   │   └── runtime.ts                 # getGraph() singleton (Principle III)
│   ├── db/
│   │   ├── pool.ts                    # pg.Pool singleton
│   │   ├── sessions.ts                # owner + counter queries
│   │   ├── usage.ts                   # rate/cap ledger queries
│   │   ├── schema.ts                  # Zod row schemas
│   │   └── migrations/*.sql
│   ├── limits.ts                      # FR-061–FR-066, FR-077 checks
│   ├── tree.ts                        # flat history → branch tree (pure)
│   ├── api-helpers.ts                 # clientId + ownership guards, error envelope
│   └── field-consumers.ts             # FIELD_CONSUMERS map (research R3)
├── components/
│   ├── AppHeader.tsx                  # title, author + feedback links, pause toggle
│   ├── BranchTimeline.tsx             # left panel, keyboard-navigable (FR-085)
│   ├── StatePanel.tsx                 # centre; dispatches per-field editors
│   ├── fields/{IngredientsEditor,ConstraintsEditor,DirectionsEditor,RecipeDraftEditor,CritiquesView,FinalRecipeView}.tsx
│   ├── ActionToolbar.tsx             # right panel, context actions
│   ├── StageProgress.tsx             # completed / next-stage stepper (FR-009)
│   ├── RunningStage.tsx              # spinner + elapsed + Cancel (FR-009a)
│   ├── StageFailureBanner.tsx        # failure reason + Retry (FR-051–FR-053)
│   └── UnsavedResultBanner.tsx       # FR-081
├── hooks/
│   ├── useClientId.ts                # mint/read clientId (research R10)
│   ├── useSession.ts                 # fetch state/history, mutations
│   ├── useAdvanceLock.ts             # Web Locks + BroadcastChannel (research R11)
│   └── useAutoRun.ts                 # client loop of /step calls (FR-038)
├── scripts/
│   ├── migrate.ts                    # setup() + SQL files (research R8)
│   └── spike-timetravel.ts           # R3 spike (throwaway)
├── tests/
│   ├── unit/…                        # schemas, tree, limits, edges
│   ├── integration/graph.test.ts     # start→step→fork→replay against test DB
│   ├── contract/…                    # route request/response shapes
│   └── e2e/…                         # Playwright + axe
├── vercel.json                       # cron: purge
├── .env.example
└── package.json                      # scripts: dev, build, migrate, test, test:e2e
```

## Phase 0: Research

Complete — [research.md](research.md). 15 items (R1–R15), all resolved as
Decision / Rationale / Alternatives. Key risk carried forward: **R3** (exact
`updateState`/`asNode` replay semantics) → an early Foundational task (`tasks.md`
T016, after DB plumbing, before any feature work) is `scripts/spike-timetravel.ts`.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — the `State` object (9 channels, all plain
  Annotations), node I/O contracts, `sessions` / `usage_events` tables, client
  `localStorage` keys, validation rules.
- [contracts/api.md](contracts/api.md) — 9 endpoints, request/response shapes,
  the `X-Client-Id` + ownership + limit conventions, and a route→requirement map.
- [quickstart.md](quickstart.md) — env vars, `npm run migrate`, the primary flow,
  and how to trigger every failure path locally.

### Implementation phasing (for `/speckit-tasks`)

1. **Spike** — `scripts/spike-timetravel.ts`: prove start → step → `updateState` →
   resume re-runs the intended node (research R3). Lock the fork mechanism. Needs
   only `pool.ts` + `scripts/migrate.ts` first — run it before the rest of
   Foundational.
2. **Foundation** — project scaffold, `tokens.css`, `pool.ts`, `runtime.ts`,
   `scripts/migrate.ts`, `sessions` + `usage_events` migrations, `lib/db/sessions.ts`,
   `api-helpers.ts`.
3. **Graph** — `state.ts` (Zod + Annotations), `models.ts`, `prompts.ts`,
   `nodes/*`, `edges.ts`, `graph.ts`. Unit-test edges + schemas; integration-test
   a full run with `FakeChatModel`.
4. **API** — `start`, `step`, `history`, `state`, `fork` (happy path), then
   `step/commit`, `delete`, `mine`, `cron/purge`. Contract tests per route.
5. **Limits & failure** — `limits.ts`; wire rate/daily/global/session caps,
   provider-cap detection, stage-failure checkpoints + `mode:"retry"`, cancel,
   save-retry.
6. **Client core** — `useClientId`, `useSession`, the `app/page.tsx` session
   view (client-side list ⇄ session switch, no per-session route), `StatePanel` +
   field editors, `ActionToolbar`, `RunningStage`, `StageFailureBanner` (Retry).
   `BranchTimeline` (+ `lib/tree.ts`) lands with US2 — in the US1 MVP a stage
   failure surfaces through `StageFailureBanner`, and the timeline kind-badges of
   FR-053 arrive in US2.
7. **Client polish** — `useAdvanceLock`, `useAutoRun`, `UnsavedResultBanner`,
   home page + on-device list + `/mine` rebuild, `AppHeader` links + pause toggle.
8. **Accessibility** — keyboard nav for the timeline, ARIA live regions for
   status, focus management; axe + manual screen-reader pass (FR-084/FR-085,
   SC-027).
9. **Deploy** — Neon + Vercel project, env vars, `vercel.json` cron, migrate as a
   pre-deploy step; smoke test the primary flow on a preview deploy.
10. **Design pass** — translate the Claude Design artboards into `tokens.css` and
    component styling (RECOMMENDATION.md §6–7), against screenshots of the working
    slice.

## Constitution Check (post-design)

Re-evaluated against the Phase 1 artifacts — no change in status:

- **I** — `lib/agent/models.ts` is the only place model IDs resolve; `data-model.md`
  node table cites `MODELS.default` / `MODELS.critique`, never a literal. ✅
- **II** — `data-model.md` gives every channel and every node output a Zod schema;
  contracts require validated bodies. ✅
- **III** — `contracts/api.md` states the runtime pins on every route; project
  structure isolates `setup()` in `scripts/migrate.ts`. ✅
- **IV** — `data-model.md` marks all editable channels last-value-wins and calls
  out the no-reducer `critiques` handling; `lib/tree.ts` is the parentConfig
  builder. ✅
- **V** — contracts show one super-step per `/step`; `useAutoRun` loops requests
  client-side. ✅
- **VI** — 3-panel structure in project layout; `tokens.css` single source;
  device-private `clientId` per contracts; no session id in the URL. Matches
  Principle VI as amended (v2.0.1). ✅

**Result**: PASS WITH 1 DOCUMENTED DEVIATION (critique-model note only).

## Complexity Tracking

| Item | Deviation / cost | Simpler alternative rejected | Justification |
|---|---|---|---|
| Critique model | Request said `claude-opus-5`; plan routes via OpenRouter `MODEL_CRITIQUE` | Direct `@langchain/anthropic` | Constitution Principle I forbids provider SDKs for node calls; OpenRouter can serve an Opus-class model, so no capability is lost |
| Session identity | Device-private `clientId` (in `localStorage`); no session id in the URL; client-side navigation only | Keep threadId-in-URL as a navigable route | Spec clarifications (Q3, Q7) plus the product owner's "not shareable" requirement. **Resolved: constitution amended to v2.0.1 (Principle VI now describes this model); no longer a deviation.** |
| `usage_events` ledger table | One extra table + aggregate queries per request | Vercel KV / Upstash rate-limit | Those are new load-bearing dependencies (Principle I amendment); Postgres is already in the stack and one indexed table covers all four limits |
| R3 spike | A throwaway script before feature work | Assume `updateState` semantics and build UI | Time-travel fork/replay is the core feature; a 1-file spike de-risks the whole plan cheaply |

## Progress Tracking

- [x] Technical Context filled
- [x] Constitution Check (pre-design) passed
- [x] Phase 0 research complete
- [x] Phase 1 data-model complete
- [x] Phase 1 contracts complete
- [x] Phase 1 quickstart complete
- [x] Constitution Check (post-design) passed
- [x] Agent context file updated (`CLAUDE.md`)
