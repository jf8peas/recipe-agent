# Implementation Plan: Dish Image Generation & Session Thumbnails

**Feature Directory**: `specs/007-dish-image-generation`
**Created**: 2026-09-24
**Status**: Draft
**Spec**: [spec.md](spec.md)
**Input**: Plan feature 007 within the existing fixed stack, with no
constitution amendment unless research finds one truly unavoidable (in which
case: stop and flag it, don't work around it).

## Summary

`finalize` gains a second, sequential model call (a distinct `MODELS.image`
key) that produces a photo-realistic dish image and its crop focal point
together, in one response, via `ChatOpenAI`'s already-supported
`modalities: ["image", "text"]` request shape (research R1). The image bytes
are stored in a new `images` table in the existing Neon database (never in
graph state or a checkpoint); state holds only a small reference + crop
object (`DishImage`). The session list gets a denormalized, atomically
updated "current best thumbnail" per session, served to `<img>` tags via
short-lived HMAC-signed URLs so device-private ownership holds without
needing `X-Client-Id` on an `<img src>`. No graph node, edge, diagram, tab,
or About-page content changes. One open risk is flagged, not resolved: which
exact OpenRouter surface (chat-completions-with-modalities vs. the newer
dedicated Image API) is authoritative for the chosen model needs a live
smoke-test this planning environment couldn't run (no API key configured).

## Technical Context

**Language / Runtime**: TypeScript, Node.js (Next.js App Router route handlers)
**Framework**: Next.js App Router, unchanged
**Primary Dependencies**: `@langchain/openai` (already installed, 1.5.13 — confirmed by source inspection to support the request/response shape this feature needs, research R1), `@langchain/langgraph`, `pg`, `zod` — **no new npm dependency** (Hard Constraint: no `sharp`, no Vercel Blob, no image-processing library)
**Storage**: Neon Postgres — one new table (`images`), five new nullable columns on `sessions` (research/data-model)
**External Services**: OpenRouter, via the existing `OPENROUTER_API_KEY` and `ChatOpenAI` — one new model key, `MODELS.image` / `MODEL_IMAGE`
**Testing**: Vitest (unit + pglite integration, existing pattern), Playwright against `scripts/e2e-server.ts`'s fake-model harness (existing pattern) — extended with a deterministic fixture image/crop and a new failure-fixture sentinel
**Target Platform**: Vercel (unchanged)
**Performance Goals**: `finalize` still completes within `maxDuration = 60`; an image call that can't fit its remaining share of that budget is skipped, not attempted and left to fail slowly (research R3)
**Constraints**: No new graph node/edge; no change to `NODE_NAMES`, `AgentGraphProgress`, `RunTabs`/stage tabs, `lib/about-content.ts`, or the About page; no image-processing dependency; image bytes never in graph state/checkpoints (Hard Constraints 1–4)
**Scale/Scope**: One new node-internal model call, one new DB table, five new nullable columns, one new API route (`GET /api/images/[imageId]`), additive-only changes to three existing routes (`/step`, `/fork`, `/mine`) and two existing UI components (`ListRow`, `FinalRecipeView`)

**NEEDS CLARIFICATION carried into research, all resolved except one flagged
risk** (see [research.md](research.md)):
- R1: resolved — `ChatOpenAI` + `modalities` already does this, confirmed by
  reading the installed library's source. **One residual, unresolved risk**:
  OpenRouter's own current docs/blog emphasize a separate dedicated Image API
  over chat-completions-with-modalities for generation; a real smoke test
  (blocked here — no API key in this environment) is required before
  implementation proceeds past this node. If that test shows
  chat-completions-with-modalities no longer returns `message.images` for
  the chosen model, the documented fallback (still no constitution
  amendment — raw `fetch()` to OpenRouter's own `/api/v1/images`, same host,
  same key, zero new dependencies) is recorded in R1, not invented ad hoc
  later.
- R2: resolved — crop JSON parsed from plain text, not `withStructuredOutput()`; the SC-003 quality bar itself is **not yet empirically checked** (same missing-API-key limitation) and is called out as a required pre-implementation step.
- R3: resolved — sequential budget split, `AbortSignal.any`, cancel-during-image degrades to "finalized, no image."
- R4: resolved — unguessable id + HMAC-signed URL, one new secret env var, no new dependency.
- R5: resolved as documented estimates (same limitation) — format/size decision doesn't block the design; no image-processing dependency is added regardless of what R2's spike finds.

## Constitution Check

*Gate: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I. Fixed Technology Stack | PASS | Every model call still goes through `ChatOpenAI` pointed at OpenRouter (research R1) — no provider SDK, no new dependency. Images are stored in the *existing* Neon database (Clarification Q2), not a new object store — the one architecture question in the original brief that could have forced an amendment is resolved without one. `MODELS.image`/`MODEL_IMAGE` follows the exact existing model-routing convention. |
| II. Schema-Validated Graph State | PASS, with a documented exception | `DishImageSchema` validates the node's output before it's assembled into `State` — no unvalidated/`any` data ever enters it. One clause needs explicit note: "LLM structured output MUST be constrained by... a Zod schema" is met by prompt-level constraint + post-hoc validation as two separate steps, not one `withStructuredOutput()` call, because combining that mechanism with image-output modality isn't confirmed to work (research R2). See research.md R2's constitution note. |
| III. Node.js Serverless Runtime Discipline | PASS | The new `GET /api/images/[imageId]` route sets `runtime = "nodejs"`/`maxDuration = 60` like every other route (it touches `pg`). No new pool, no graph recompilation — reuses the existing singletons. The new migration runs via `scripts/migrate.ts` only, never lazily. |
| IV. Time-Travel State Integrity | PASS | `dishImage` is a plain last-value-wins `Annotation`, no reducer — verified (not assumed) that `fork-replay.ts`'s existing whole-value replay mechanism carries it forward for free (data-model.md §1), satisfying FR-009a/FR-011 with zero changes to that file. |
| V. Client-Driven Step Execution | PASS | Still one `finalize` invocation per request; the image call is *inside* that same single step, bounded to fit the existing per-request time budget (research R3) rather than becoming a second interrupt point. |
| VI. Session & UI Boundaries | PASS | Device-private ownership is preserved for images specifically because `<img src>` can't carry `X-Client-Id` — via a signed-URL scheme minted only by already-ownership-checked routes (research R4), not by weakening the model. No session id appears in any image URL. The running-session layout, design-token source, and stage-tab/graph structure are all unchanged (Hard Constraint 1; verified `lib/graph-progress.ts` and `lib/about-content.ts` need no edits). |

**Result**: PASS. No amendment. One documented exception (Principle II,
above) — a reasoned interpretation, not a silent gap — and one open item
(R1's OpenRouter-surface risk) that's a **pre-implementation validation
task**, not a constitutional question: either outcome of that test stays
within Principle I as already reasoned in research.md.

## Project Structure

```
lib/agent/
  models.ts                 # + MODELS.image / MODEL_IMAGE, createChatModel() gains optional {modalities, timeoutMs}
  state.ts                  # + DishImageSchema, State.dishImage
  graph.ts                  # + Annotation<DishImage | null> entry only — NODE_NAMES/edges untouched
  nodes/finalize.ts         # + sequential image call, image-row insert, uniform failure→null handling
  prompts.ts                # + the image-generation prompt (asks for the photo + the focal-point JSON)
  fake-model.ts             # + fixture image/crop; + e2e-trigger-image-failure sentinel

lib/db/
  migrations/0004_dish_images.sql   # new: images table + sessions.thumbnail_* columns
  images.ts                 # new: insertImage, getImageById
  sessions.ts               # + updateSessionThumbnail (mirrors updateSessionTitle)

lib/
  image-url.ts               # new: signImageUrl / verifyImageUrl (Node crypto only)

app/api/
  images/[imageId]/route.ts  # new: GET, signature-gated, serves raw bytes
  recipe/[sid]/step/route.ts       # + updateSessionThumbnail call after a successful finalize/retry
  recipe/[sid]/fork/route.ts       # + updateSessionThumbnail call after a replay that lands on "finalized"
  recipe/mine/route.ts             # + thumbnail field (with signed url) per session

hooks/useSessionList.ts     # + LocalSessionEntry.thumbnail, touch() gains a thumbnail argument
app/page.tsx                # + pass current dishImage into sessionList.touch()

components/ui/ListRow.tsx           # + optional thumbnail slot (fixed-size, reserved space)
components/SessionList.tsx          # + maps session thumbnail → ListRow's thumbnail prop, computes object-position
components/fields/FinalRecipeView.tsx  # + full image or placeholder, alt text

app/tokens.css               # + thumbnail size/placeholder tokens

.env.example                 # + MODEL_IMAGE, IMAGE_URL_SECRET
CLAUDE.md                    # SPECKIT block → this plan; Model routing section + MODELS.image
README.md                    # env/model section updated to match .env.example
```

No changes anywhere in `components/AgentGraphProgress.tsx`,
`components/RunTabs.tsx`'s tab-set logic, `lib/graph-progress.ts`,
`lib/about-content.ts`, or `components/about/*` — verified during research,
not assumed (data-model.md §4).

## Phase 0: Research

See [research.md](research.md). R1–R5 all resolved as design decisions; one
residual empirical risk (R1/R2, both blocked on a real `OPENROUTER_API_KEY`
this environment doesn't have) is explicitly flagged as a required
pre-implementation step rather than silently assumed.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — `DishImage` state shape, `images` table +
  `sessions` denormalization, non-editability (verified against
  `lib/field-consumers.ts`), fork-replay compatibility (verified against
  `lib/fork-replay.ts`).
- [contracts/finalize-node.md](contracts/finalize-node.md) — the node's
  updated I/O contract, model routing table, execution order, fake-model
  fixture behavior.
- [contracts/image-route.md](contracts/image-route.md) — the new
  `GET /api/images/[imageId]` route and its signing scheme.
- [contracts/mine-response.md](contracts/mine-response.md) — the additive
  `/mine` response shape.
- [quickstart.md](quickstart.md) — local setup, the required pre-implementation
  live spike, and a manual walkthrough per user story.

## Constitution Check (post-design)

Re-evaluated against the completed data model and contracts above — no
change to the pre-design table. Every new piece of state, storage, and
routing was verified against the actual files it touches (not just the
spec's intent): `fork-replay.ts` replays the new field for free;
`field-consumers.ts` keeps it non-editable by omission; `graph-progress.ts`
and `about-content.ts` need no edits; both delete/purge routes already
cascade the new table with no code change. **Result: PASS, unchanged.**

## Complexity Tracking

*Empty — no deviation from the constitution or from the simplest workable
design was needed anywhere in this plan.* The one place complexity was
deliberately added beyond the bare minimum (HMAC-signed image URLs, research
R4) was weighed against a simpler bare-unguessable-id alternative and kept
because it preserves this app's existing two-factor-shaped security
posture rather than introducing a weaker, image-specific exception to it —
not complexity for its own sake.

## Progress Tracking

- [x] Technical Context filled
- [x] Constitution Check (pre-design) passed
- [x] Phase 0 research complete
- [x] Phase 1 data-model complete
- [x] Phase 1 contracts complete
- [x] Phase 1 quickstart complete
- [x] Constitution Check (post-design) passed
- [x] Agent context file updated (CLAUDE.md)
