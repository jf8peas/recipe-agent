# Recipe Agent — Agent Context

A Next.js/Vercel app: a LangGraph.js agent graph turns an ingredient list into a
recipe, with full time-travel (inspect / branch / edit / replay) over the graph's
state history.

<!-- SPECKIT START -->
Active plan: [specs/007-dish-image-generation/plan.md](specs/007-dish-image-generation/plan.md)

- Spec: [specs/007-dish-image-generation/spec.md](specs/007-dish-image-generation/spec.md)
- Research: [specs/007-dish-image-generation/research.md](specs/007-dish-image-generation/research.md) — flags one still-unresolved risk (R1/R2): which OpenRouter image-generation surface is authoritative needs a live smoke test (tasks.md T037) that no environment so far has had an `OPENROUTER_API_KEY` to run — required before trusting this in production, not before shipping the code itself.
- Data model: [specs/007-dish-image-generation/data-model.md](specs/007-dish-image-generation/data-model.md)
- Contracts: [specs/007-dish-image-generation/contracts/](specs/007-dish-image-generation/contracts/) (`finalize-node.md`, `image-route.md`, `mine-response.md`)
- Quickstart: [specs/007-dish-image-generation/quickstart.md](specs/007-dish-image-generation/quickstart.md)
- Constitution: [.specify/memory/constitution.md](.specify/memory/constitution.md) (v4.0.0 — this plan requires **no amendment**; images stay in the existing Neon database, not a new object store)

Prior features (implemented, deployed): [specs/001-recipe-agent/plan.md](specs/001-recipe-agent/plan.md), [specs/003-direction-selection/plan.md](specs/003-direction-selection/plan.md), [specs/004-about-page-redesign/plan.md](specs/004-about-page-redesign/plan.md), [specs/005-agent-graph-progress/plan.md](specs/005-agent-graph-progress/plan.md), [specs/006-ui-unification/plan.md](specs/006-ui-unification/plan.md). Feature 002 ("About This App" slideshow) has been fully replaced by feature 004 — see spec 004 FR-001. Feature 007 (dish images) is implemented (all 36 non-blocked tasks in [tasks.md](specs/007-dish-image-generation/tasks.md) complete, `tsc`/`vitest`/`playwright` green) but not yet deployed; T037 (the live OpenRouter smoke test) is still blocked on a real `OPENROUTER_API_KEY`.
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
`MODEL_CRITIQUE` env (a stronger model, Opus-class). `MODELS.image` (feature
007) → `MODEL_IMAGE` env, an image-generation-capable OpenRouter
model — used only by `finalize`'s second, image-generating call, never for
text. All three are OpenRouter model IDs, resolved only in
`lib/agent/models.ts`.

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
deleted. Feature 007 delivered: `finalize`'s second call (`MODELS.image`)
generates a dish photo + crop, stored in a new `images` table (never inline
in graph state/checkpoints — `dishImage` holds only a reference plus crop
metadata) and served via a new signed-URL route
(`GET /api/images/[imageId]`, `lib/image-url.ts`); the final recipe tab and
the session list (`components/ui/DishImage.tsx`, shared by both) show the
photo or a neutral placeholder; an image failure never becomes a stage
failure. Also added, discovered as a genuine prerequisite gap during
implementation and confirmed with the user before building it: Retry now
works on an already-*finalized* `finalize` too (previously Retry only ever
reached a stage that had just failed) — `ActionToolbar`'s "Regenerate"
button, `useSession`'s `retryFromCheckpointId` extended, and the `/step`
route's `already-advanced` guard now has a narrow, finalize-only bypass for
`mode: "retry"`. Also fixed along the way: a real Postgres `UPDATE ... FROM`
restriction in `updateSessionThumbnail` (a `LEFT JOIN ON` clause can't
reference the update target) caught by a contract test, not by planning; and
`playwright.config.ts`, which had never actually been wired to the local
fake-model e2e server (`scripts/e2e-server.ts`) — `testDir`, `baseURL`, and
`webServer` were all pointed at scaffolding/production defaults from the
initial commit, so every prior feature's "playwright green" claim was
unverified in a fully clean environment until this session fixed it (also
fixed: pglite-under-parallel-workers flakiness, `workers: 1`). Local work
(features 001, 003, 004, 005, 006, 007) is verified (`tsc`/`vitest`/
`playwright` all green, twice in a row) but not yet deployed to Vercel;
feature 007's `npm run build` and a final third full verification pass are
still pending, and T037 (live OpenRouter smoke test) needs a real
`OPENROUTER_API_KEY` this environment doesn't have.
