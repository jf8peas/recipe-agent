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
failure. **Redesigned post-deploy** (research.md R6, based on real usage):
the final tab's photo now has its own "Generate photo" button that appears
only when the image is blank (never when a photo already exists), and
clicking it regenerates *just* the image — the existing `finalRecipe` is
reused as-is via `config.configurable.reuseFinalRecipe`, a plain
`graph.invoke(null, config)` on the `finalize` checkpoint (`mode:
"retry-image"` in `app/api/recipe/[sid]/step/route.ts`), never a second LLM
call for text. This replaced an earlier, broader design — a general
"Regenerate" button on `ActionToolbar` that re-ran the whole finalize stage
(text + image together) — which real usage on a slow `MODEL_DEFAULT` showed
starving the image call of whatever time budget the text call didn't
consume, often leaving no photo at all; that button and its `onRetryFinalize`
prop have been removed entirely, not just hidden. Also fixed along the way: a real Postgres `UPDATE ... FROM`
restriction in `updateSessionThumbnail` (a `LEFT JOIN ON` clause can't
reference the update target) caught by a contract test, not by planning; and
`playwright.config.ts`, which had never actually been wired to the local
fake-model e2e server (`scripts/e2e-server.ts`) — `testDir`, `baseURL`, and
`webServer` were all pointed at scaffolding/production defaults from the
initial commit, so every prior feature's "playwright green" claim was
unverified in a fully clean environment until this session fixed it (also
fixed: pglite-under-parallel-workers flakiness, `workers: 1`). Local work
(features 001, 003, 004, 005, 006, 007) is verified (`tsc`/`vitest`/
`playwright` all green, multiple times) — feature 007 is now deployed to
Vercel.

**Production incident found post-deploy, app-wide, not feature-007-specific**:
real (non-mocked) testing on Vercel surfaced repeated
"Task timed out after 60 seconds" platform kills — first on `finalize`
(recipe recovered, only the photo missing — see research.md R3's addenda),
then independently on `critique` (a stage untouched by feature 007). Root
cause: `createChatModel()` sets `maxRetries: 2` unconditionally, and no node
had ever bounded the *total* time across those retries to what's actually
left of the function's 60s budget — each node's own `STAGE_TIMEOUT_MS`
(default 45s) only bounded a single attempt. Fixed app-wide via a new shared
`lib/agent/deadline.ts` (`requestDeadline(config, reserveMs?)`, using
`config.configurable.requestStartedAt` — set once by
`app/api/recipe/[sid]/step/route.ts` as its very first statement, before any
of its own DB work) — every node (`parseIngredients`, `proposeDirections`,
`selectDirection`, `draftRecipe`, `critique`, `refine`, `finalize`'s text
call) now computes its model call's timeout/abort-signal from this shared
helper instead of relying on unbounded per-attempt retries. Every node also
now logs a `console.error` on model-call failure — this class of bug is
genuinely undiagnosable without a timestamped trace (the finding process
here needed several rounds of added logging to actually pinpoint). Confirmed
fixed against a live deploy: a subsequent production log showed `finalize`
completing in ~32s total, well inside the 60s ceiling.

**Further production findings, same post-deploy testing pass**:
- `openai/gpt-image-2` (the originally-configured `MODEL_IMAGE`) 404s on
  OpenRouter's chat/completions endpoint — that family of models requires
  the separate dedicated `/api/v1/images` endpoint, which has no text
  channel and so can't return the crop JSON in the same call (FR-008).
  `MODEL_IMAGE` was switched to `google/gemini-2.5-flash-image` instead
  (env-var-only change, no code change) — see research.md R1/R6.
- `google/gemini-2.5-flash-image` reliably wraps its crop-JSON text in a
  markdown code fence even though `dishImagePrompt` never asks for one — a
  generic LLM habit, not a bug in the model or prompt. Fixed with a
  `stripMarkdownCodeFence()` helper in `finalize.ts` applied before
  `JSON.parse`; see research.md R7.
- Old checkpoints (predating this feature's `ingredients`/`toBuy` fields on
  `FinalRecipe`/`recipeDraft`) crashed the whole page with `Cannot read
  properties of undefined (reading 'length')` in `FinalRecipeView.tsx` and
  `RecipeDraftEditor.tsx` — neither file guarded against a field simply
  being `undefined` on an old checkpoint (Zod schemas are never re-parsed
  against already-checkpointed state, so old JSON just lacks newer keys).
  Fixed with `?.length ?? 0` / `?? []` guards at every render site, not just
  the one that happened to be touched when the field was introduced.
- `pg-connection-string` warned that `sslmode=require` is only a deprecated
  alias for `sslmode=verify-full`. Docs (`.env.example`,
  `specs/001-recipe-agent/quickstart.md`) now recommend `verify-full`
  explicitly, which surfaced a real latent bug: `lib/db/pool.ts` enforced
  `rejectUnauthorized: true` via a literal `"sslmode=require"` substring
  check, which would have silently stopped matching the moment a deployment
  switched values. Fixed to match any `sslmode=` value
  (`/[?&]sslmode=/`).
- The "Generate photo" button had no busy state: clicking it left it fully
  clickable (and looking inert) for the whole `retry-image` round trip, with
  nothing indicating the server was working. Fixed by threading a new
  `regeneratingImage` boolean down `app/page.tsx` → `RunTabs` →
  `FinalRecipeView` (`loading && canRegenerateImage`, both already tracked
  in `app/page.tsx`) — the button disables itself and swaps its label for
  `RunningStage.tsx`'s own spinner + elapsed-seconds treatment
  (`FinalRecipeView.tsx`'s local `useElapsedSeconds` hook mirrors
  `RunningStage`'s ticker exactly) for the duration of the request, then
  reverts once it resolves.
- The header's "RA" mark + "Recipe Agent" title (`AppHeader.tsx`, `mode:
  "app"` only) didn't go anywhere. Added an `onLogoClick` prop, wired at
  both `app/page.tsx` call sites to the existing `handleExitToSessions`
  (the same handler `ActionToolbar`'s "Back to your sessions" already
  uses) — clicking it now returns to the session list from anywhere (a
  running session, mid-edit, the entry form). `aria-label="Recipe Agent
  home"` deliberately avoids the substring "your sessions" so Playwright's
  `getByRole` name matching doesn't collide with the existing "Back to your
  sessions" button elsewhere on screen (a real, caught-by-the-e2e-suite
  ambiguous-locator failure during this change). The "about" mode's own
  header instance is unchanged — it already has "Return to App".
- Deleting a session (`SessionList`/`ListRow`) left its delete button fully
  clickable for the whole server round trip, with no feedback that anything
  was happening — the same class of gap as "Generate photo"'s, on the
  slower `/api/recipe/[sid]/delete` route this time. Fixed the same way: a
  busy state in `app/page.tsx` threaded through `SessionList` → `ListRow` as
  a per-row `deleting` boolean — that row's Open and Delete buttons both
  disable and the Delete button swaps its label for a spinner + "Deleting…"
  (no elapsed-seconds timer this time, since the request settles quickly
  enough that one wasn't asked for). **Caught immediately after by testing
  two deletes at once**: the first version tracked this as a single
  `deletingSessionId: string | null`, which broke under concurrent
  deletes — clicking a second row's Delete overwrote the first row's id, so
  the first row's busy state vanished (re-enabling its buttons while its
  own delete was still in flight) and whichever request's `finally` ran
  first cleared the state for BOTH rows, not just its own. The delete route
  itself was already safe under this (idempotent, scoped per `sid`, see its
  own doc comment) — this was purely a UI-tracking bug. Fixed by making it
  a `Set<string>` (`deletingSessionIds`) instead of a single id, with an
  early-return guard in `handleDeleteSession` against re-firing a delete
  for an id already in the set. Covered by a new e2e test that deletes two
  different rows within the same in-flight window and asserts both show a
  busy state simultaneously.
