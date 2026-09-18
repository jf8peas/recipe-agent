# Recipe Agent — Agent Context

A Next.js/Vercel app: a LangGraph.js agent graph turns an ingredient list into a
recipe, with full time-travel (inspect / branch / edit / replay) over the graph's
state history.

<!-- SPECKIT START -->
Active plan: [specs/004-about-page-redesign/plan.md](specs/004-about-page-redesign/plan.md)

- Spec: [specs/004-about-page-redesign/spec.md](specs/004-about-page-redesign/spec.md)
- Research: [specs/004-about-page-redesign/research.md](specs/004-about-page-redesign/research.md)
- Data model: [specs/004-about-page-redesign/data-model.md](specs/004-about-page-redesign/data-model.md)
- UI contract: [specs/004-about-page-redesign/contracts/about-page-ui.md](specs/004-about-page-redesign/contracts/about-page-ui.md)
- Quickstart: [specs/004-about-page-redesign/quickstart.md](specs/004-about-page-redesign/quickstart.md)
- Constitution: [.specify/memory/constitution.md](.specify/memory/constitution.md) (v3.0.0)

Prior features (implemented, deployed): [specs/001-recipe-agent/plan.md](specs/001-recipe-agent/plan.md), [specs/003-direction-selection/plan.md](specs/003-direction-selection/plan.md). Feature 002 ("About This App" slideshow) has been fully replaced by feature 004 — see spec 004 FR-001.
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
- **One LangGraph thread per branch (v3.0.0).** A session can have many
  branches; each is its OWN LangGraph `thread_id`, linked by the app's
  `branches` table. **Never** create a second child of an already-branched-from
  checkpoint within one thread via `updateState` — confirmed data-loss bug in
  `@langchain/langgraph-checkpoint-postgres` (1.0.0–1.0.5, research R3, T016
  spike). Fork = seed a brand-new thread by replaying the parent branch's
  recorded outputs, then diverge with the edit. Retry = plain `invoke` on a
  historical checkpoint in the SAME thread (confirmed safe).

## Model routing

`MODELS.default` → `MODEL_DEFAULT` env (general nodes); `MODELS.critique` →
`MODEL_CRITIQUE` env (a stronger model, Opus-class). Both are OpenRouter model
IDs.

## Current status

Features 001 (Recipe Agent core), 003 (direction selection stage), and 004
(About page redesign) are implemented; constitution at v3.0.0. Feature 002
("About This App" slideshow) has been fully replaced by feature 004 — a
single full-scrolling reference page with a sticky topic nav, matching
`design/v002/about.html` — `components/AboutSlideshow.tsx` and its 5-slide
content model are deleted; `components/about/` and a rewritten
`lib/about-content.ts` replace them. Local work (features 001, 003, 004) is
verified (`tsc`/`vitest`/`build`/`playwright` all green) but not yet
deployed to Vercel.
