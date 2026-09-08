# Recipe Agent — Agent Context

A Next.js/Vercel app: a LangGraph.js agent graph turns an ingredient list into a
recipe, with full time-travel (inspect / branch / edit / replay) over the graph's
state history.

<!-- SPECKIT START -->
Active plan: [specs/001-recipe-agent/plan.md](specs/001-recipe-agent/plan.md)

- Spec: [specs/001-recipe-agent/spec.md](specs/001-recipe-agent/spec.md)
- Research: [specs/001-recipe-agent/research.md](specs/001-recipe-agent/research.md)
- Data model: [specs/001-recipe-agent/data-model.md](specs/001-recipe-agent/data-model.md)
- API contracts: [specs/001-recipe-agent/contracts/api.md](specs/001-recipe-agent/contracts/api.md)
- Quickstart: [specs/001-recipe-agent/quickstart.md](specs/001-recipe-agent/quickstart.md)
- Tasks: [specs/001-recipe-agent/tasks.md](specs/001-recipe-agent/tasks.md)
- Constitution: [.specify/memory/constitution.md](.specify/memory/constitution.md) (v2.0.1)
<!-- SPECKIT END -->

## Non-negotiables (from the constitution)

- **Stack is fixed**: Next.js App Router on Vercel · `@langchain/langgraph` in
  Route Handlers · **all model calls through OpenRouter via `@langchain/openai`**
  (never `@langchain/anthropic` or a provider SDK) · Neon + `checkpoint-postgres`
  · Zod.
- **Every API route**: `export const runtime = "nodejs"` and
  `export const maxDuration = 60`. Edge runtime is banned for anything touching
  `pg` or LangGraph.
- **Singletons**: one `pg.Pool` (pooled Neon string) and one compiled graph,
  cached in module / `globalThis` scope. Never create a pool or compile the graph
  in a request handler. `PostgresSaver.setup()` runs only in `scripts/migrate.ts`.
- **Graph state**: every channel has a Zod schema; every node validates its I/O;
  editable channels are plain last-value-wins Annotations (no append reducers).
- **Execution**: `interruptAfter` every node; one super-step per request; Auto-run
  is a client-side loop of single-step requests.
- **Model IDs** resolve only in `lib/agent/models.ts` (`MODELS.default` /
  `MODELS.critique`). Design tokens live only in `app/tokens.css`.
- **Device-private sessions**: an anonymous `clientId` in `localStorage` is the
  only credential (`X-Client-Id` header, ownership-checked server-side). No
  session identifier ever appears in a page URL; the app is a single `/` route
  that switches between the session list and a session client-side. No sharing,
  no cross-device.

## Model routing

`MODELS.default` → `MODEL_DEFAULT` env (general nodes); `MODELS.critique` →
`MODEL_CRITIQUE` env (a stronger model, Opus-class). Both are OpenRouter model
IDs.

## Current status

Spec, plan, tasks, and analyze complete; constitution at v2.0.1. Next:
`/speckit-implement`. Implementation order starts with
`scripts/spike-timetravel.ts` (de-risk the `updateState`/`asNode` fork mechanism
— research R3), which only needs `lib/db/pool.ts` + `scripts/migrate.ts` first.
