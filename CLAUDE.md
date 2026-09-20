# Recipe Agent — Agent Context

A Next.js/Vercel app: a LangGraph.js agent graph turns an ingredient list into a
recipe, with full time-travel (inspect / branch / edit / replay) over the graph's
state history.

<!-- SPECKIT START -->
Active plan: [specs/006-ui-unification/plan.md](specs/006-ui-unification/plan.md)

- Spec: [specs/006-ui-unification/spec.md](specs/006-ui-unification/spec.md)
- Research: [specs/006-ui-unification/research.md](specs/006-ui-unification/research.md)
- Data model: [specs/006-ui-unification/data-model.md](specs/006-ui-unification/data-model.md)
- UI contracts: [specs/006-ui-unification/contracts/ui-contracts.md](specs/006-ui-unification/contracts/ui-contracts.md)
- Quickstart: [specs/006-ui-unification/quickstart.md](specs/006-ui-unification/quickstart.md)
- Constitution: [.specify/memory/constitution.md](.specify/memory/constitution.md) (v4.0.0 — Principle VI amended by this feature's own plan, see research R8)

Prior features (implemented, deployed): [specs/001-recipe-agent/plan.md](specs/001-recipe-agent/plan.md), [specs/003-direction-selection/plan.md](specs/003-direction-selection/plan.md), [specs/004-about-page-redesign/plan.md](specs/004-about-page-redesign/plan.md), [specs/005-agent-graph-progress/plan.md](specs/005-agent-graph-progress/plan.md), [specs/006-ui-unification/plan.md](specs/006-ui-unification/plan.md). Feature 002 ("About This App" slideshow) has been fully replaced by feature 004 — see spec 004 FR-001.
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

Features 001 (Recipe Agent core), 003 (direction selection stage), 004
(About page redesign), 005 (agent graph progress diagram), and 006 (UI
unification) are implemented; constitution at **v4.0.0** (Principle VI
amended by feature 006's own plan — the three-panel session layout it
described was never actually shipped; replaced with the single-column/
graph/tabs/sticky-action-row layout design/v003/ establishes). Feature 002
("About This App" slideshow) has been fully replaced by feature 004.
Feature 006 delivered: one two-state `AppHeader` (app/about), a rebuilt
two-row `AgentGraphProgress` synced bidirectionally with stage tabs
(`RunTabs`/`Tabs`), a shared `components/ui/` primitives layer (`Button`,
`Card`, `ListRow`, `TextArea`, `Spinner`, `Toggle`, `Tabs`) used across
every screen including the About page, and a new "RA" mark/favicon
(`app/icon.svg`) — per `design/v003/`. `components/StatePanel.tsx` is
deleted. Local work (features 001, 003, 004, 005, 006) is verified
(`tsc`/`vitest`/`build`/`playwright` all green, twice in a row) but not yet
deployed to Vercel.
