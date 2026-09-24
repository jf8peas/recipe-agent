# Tasks: Dish Image Generation & Session Thumbnails

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/](contracts/) (`finalize-node.md`, `image-route.md`, `mine-response.md`), [research.md](research.md), [quickstart.md](quickstart.md)
**Feature Directory**: `specs/007-dish-image-generation`
**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v4.0.0 — plan.md's Constitution Check: PASS, **no amendment**

Format: `- [ ] [TaskID] [P?] [Story?] Description with exact file path`.
`[P]` = parallelizable (different file, no dependency on an incomplete task).
`[US1]`–`[US5]` = the user story phase (spec.md priorities — US1/US2/US3 are
all P1, US4 is P2, US5 is P3); omitted in Foundational and Polish.

No new npm dependency, no graph node/edge, no change to `NODE_NAMES`,
`AgentGraphProgress`, `RunTabs`'s tab-set logic, `lib/graph-progress.ts`, or
`lib/about-content.ts`/the About page (plan.md Constitution Check; verified,
not assumed, against those exact files during planning). `.env.example`,
`CLAUDE.md`'s SPECKIT block and Model routing section, and `README.md`'s
model-routing note were already updated during `/speckit-plan` — not
repeated as tasks here.

**Before any task below that makes a real OpenRouter call**: research.md's
R1/R2 flagged one unresolved risk — whether `modalities: ["image","text"]`
on `/chat/completions` still returns `message.images` for the chosen model,
and whether its focal points actually clear SC-003's 90% bar. Neither could
be tested during planning (no `OPENROUTER_API_KEY` in that environment).
T010 and T037 are where this gets a real answer for the first time — read
research.md R1's documented fallback before writing T010 if the live
behavior doesn't match what the library source predicted.

---

## Phase 1: Foundational (blocking prerequisite — no user story starts before this)

- [X] T001 [P] Create `lib/db/migrations/0004_dish_images.sql`: `images` table (`id bigserial PRIMARY KEY`, `image_id text UNIQUE NOT NULL`, `thread_id text NOT NULL REFERENCES branches(thread_id) ON DELETE CASCADE`, `bytes bytea NOT NULL`, `mime text NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`), an index on `thread_id`, and `ALTER TABLE sessions ADD COLUMN` for `thumbnail_image_id text NULL REFERENCES images(image_id) ON DELETE SET NULL`, `thumbnail_focal_x real NULL`, `thumbnail_focal_y real NULL`, `thumbnail_zoom real NULL`, `thumbnail_alt text NULL` (data-model.md §3)
- [X] T002 [P] Create `lib/db/images.ts`: `insertImage({ imageId, threadId, bytes, mime }, pool)` and `getImageById(imageId, pool)`, following the existing `Pool = getPool()` default-param convention already used in `lib/db/sessions.ts`/`lib/db/branches.ts`
- [X] T003 [P] In `lib/db/sessions.ts`, add `updateSessionThumbnail(sessionId, image: DishImage, pool)`: the single atomic `UPDATE sessions ... FROM images new_img LEFT JOIN images cur_img ... WHERE ... AND (cur_img.id IS NULL OR new_img.id > cur_img.id)` statement from data-model.md §5 — race-safe "most recently finalized wins" with no read-then-write
- [X] T004 [P] Create `lib/image-url.ts`: `signImageUrl(imageId, ttlSeconds = 86_400)` and `verifyImageUrl(imageId, exp, sig)` using Node's built-in `crypto` (`createHmac`, `timingSafeEqual`) and a required `IMAGE_URL_SECRET` env var that throws a clear error if unset (contracts/image-route.md, research R4)
- [X] T005 [P] In `lib/agent/state.ts`, add `DishImageSchema` (`imageId: string`, `focalX`/`focalY: number().min(0).max(1)`, `zoom: number().min(1).nullable()`, `alt: string`), add `dishImage: DishImageSchema.nullable()` to `StateSchema`, and add `dishImage: null` to `INITIAL_STATE` (data-model.md §1) — do **not** add `dishImage` to anything in `lib/field-consumers.ts`
- [X] T006 In `lib/agent/graph.ts`, add `dishImage: Annotation<DishImage | null>()` to the `Annotation.Root` — `NODE_NAMES` and every edge stay untouched (depends on T005)
- [X] T007 [P] In `lib/agent/models.ts`, add `MODELS.image` (getter resolving `process.env.MODEL_IMAGE` with fallback `"google/gemini-2.5-flash-image"`, research R1) and extend `createChatModel(modelId, options?: { modalities?: string[]; timeoutMs?: number })` so a caller can override the per-call `modalities` (with the `as` cast research R1 documents for OpenRouter's `"image"` value) and `timeout` independently of `STAGE_TIMEOUT_MS`
- [X] T008 [P] In `lib/agent/prompts.ts`, add the image-generation prompt: asks for a photo-realistic image of the finished dish (from `finalRecipe.title`/steps) plus a small JSON object as accompanying text — `{"focalX": <0-1>, "focalY": <0-1>, "zoom": <>=1, optional>}` — framed on the most appetizing part of the dish (spec FR-007's own examples), not the plate edge or table
- [X] T009 [P] In `lib/agent/fake-model.ts`, add a fixture response for `finalize`'s image call: a small committed fixture image (a few hundred bytes, checked into a test-fixtures path) and a fixed focal point, plus a new `e2e-trigger-image-failure` sentinel (mirroring the existing `e2e-trigger-failure-<node>-<nonce>`/`e2e-trigger-blocking-critique` pattern already in this file) that makes the fixture's image step fail on purpose

## Phase 2: User Story 1 - See a photo of the finished dish (Priority: P1)

**Goal**: A photo-realistic dish image appears on the final recipe tab, produced inside the existing one-step `finalize` stage, with no visible change to the graph/tabs.
**Independent Test**: Run a session to a finalized recipe; confirm the image appears on the final tab with correct alt text, the recipe text is exactly as complete as before this feature, and the agent-graph diagram/stage tabs show only the one, unchanged `finalize` stage.

- [X] T010 [US1] Rewrite `lib/agent/nodes/finalize.ts` per contracts/finalize-node.md: define `SAFETY_MARGIN_MS = 5000` and `MIN_IMAGE_BUDGET_MS = 5000` as exported constants in this file (research R3 — not re-derived or re-guessed elsewhere); run the existing text call to completion unchanged; compute the image call's remaining budget (`maxDurationMs - elapsedMs - SAFETY_MARGIN_MS`, skip the image call entirely below `MIN_IMAGE_BUDGET_MS`); call `createChatModel(MODELS.image, { modalities: ["image","text"], timeoutMs })` (T007) with an `AbortSignal.any([config.signal, AbortSignal.timeout(imageDeadlineMs)])`; parse `content[0].text` as the crop JSON and validate with `DishImageSchema`'s crop fields (T005) — any failure (network, timeout, invalid/missing JSON, out-of-range focal values) is caught uniformly and yields `dishImage: null`, never a thrown error past this node; on success, insert the image row via `insertImage()` (T002) using `config.configurable.thread_id`; return `{ finalRecipe, dishImage, outcome: "finalized" }` (depends on T002, T004, T005, T006, T007, T008, T009)
- [X] T011 [US1] In `app/api/recipe/[sid]/step/route.ts`, after a successful `finalize` step or retry, call `updateSessionThumbnail(sid, state.dishImage, pool)` (T003) when `state.dishImage` is non-null — mirroring the existing `updateSessionTitle` call immediately above it (depends on T003, T010)
- [X] T012 [US1] In `components/fields/FinalRecipeView.tsx`, render the full dish image (via a signed URL, T004) when `dishImage` is present, or the neutral placeholder otherwise, with `alt="Photo of <finalRecipe.title>"` (FR-002, FR-004, FR-012) (depends on T010)
- [X] T013 [P] [US1] In `app/tokens.css`, add the placeholder visual tokens (background/icon treatment for "no photo") reused by both the final tab and the session list thumbnail (FR-004)
- [X] T014 [P] [US1] Create `tests/unit/dish-image.test.ts`: `DishImageSchema` accepts valid focal points, rejects `focalX`/`focalY` outside `[0,1]` and `zoom < 1` (depends on T005)
- [X] T015 [US1] Create `tests/unit/finalize.test.ts`: mocked-timers test proving the text call always completes before the image call starts (never concurrently), and the image call's computed deadline shrinks correctly as simulated elapsed time grows (depends on T010)
- [X] T016 [P] [US1] Create `tests/integration/images.test.ts` (pglite): `insertImage`/`getImageById` round-trip real bytes correctly; also assert exactly one `images` row exists per successful `finalize` call (FR-006 — the thumbnail is never a second generation) (depends on T001, T002)
- [X] T017 [US1] Extend `tests/contract/step.test.ts`: a successful `finalize` step's response includes a `dishImage` object shaped per `DishImageSchema` when the fixture image succeeds; also assert `usage_events`'s row count for this stage is identical whether the image call succeeds or fails (FR-017 — no extra usage unit for the image call) (depends on T011)
- [X] T018 [US1] Create `tests/e2e/dish-image.spec.ts` (part 1): step a session to `finalize`, confirm the image and its alt text appear on the final tab, and confirm the agent-graph progress diagram and stage tabs are pixel-for-pixel the same node/tab set as a pre-feature run — no new node, tab, or pause (FR-020) (depends on T009, T010, T012)

## Phase 3: User Story 2 - Recognize past dishes at a glance in the session list (Priority: P1)

**Goal**: Every finalized session shows a thumbnail cropped from its own dish photo in the session list; every other session shows the neutral placeholder; no layout shift while loading.
**Independent Test**: With one finalized session (with an image) and one non-finalized session, open the session list — confirm the finalized row shows a meaningfully-framed thumbnail, the other shows the placeholder, and the row layout doesn't shift as the thumbnail loads.

- [X] T019 [US2] Create `app/api/images/[imageId]/route.ts`: `GET`, `runtime = "nodejs"`, `maxDuration = 60`; verifies `exp`/`sig` via `verifyImageUrl()` (T004) — `403 invalid-signature` on failure, `404 not-found` if no matching `images` row, else `200` with `Content-Type: <mime>` and the raw bytes, `Cache-Control: private, max-age=86400` (contracts/image-route.md) (depends on T002, T004)
- [X] T020 [US2] In `app/api/recipe/mine/route.ts`, add a `thumbnail` field per session (`null` if no finalized branch or no usable image) built from `sessions.thumbnail_*` plus a freshly-signed `url` from `signImageUrl()` (T004) (contracts/mine-response.md) (depends on T004, T003)
- [X] T021 [US2] In `hooks/useSessionList.ts`, add an optional `thumbnail` field to `LocalSessionEntry`, extend `touch()` to accept and persist it, and map `/mine`'s new `thumbnail` field through `refreshFromServer()` (depends on T020)
- [X] T022 [US2] In `app/page.tsx`, pass the live `snapshot.state.dishImage` (via a signed URL) into the existing `sessionList.touch(sessionId, title)` effect as its new third argument, so the on-device path never needs an extra round trip for a session just finalized in this tab (depends on T021, T010)
- [X] T023 [US2] In `components/ui/ListRow.tsx`, add an optional `thumbnail: { src: string | null; alt: string } | undefined` prop rendered in a fixed-size media slot (`app/tokens.css`, T013) that reserves its space whether or not `src` is set yet — the placeholder and the loaded image occupy the identical box (FR-013)
- [X] T024 [US2] In `components/SessionList.tsx`, map each session's `thumbnail` (imageId/url/focalX/focalY/zoom/alt) into `ListRow`'s `thumbnail` prop, computing `object-position` as `"${focalX*100}% ${focalY*100}%"` and an optional `transform: scale(zoom)` (depends on T021, T023)
- [X] T025 [US2] Extend `tests/integration/images.test.ts`: `GET /api/images/[imageId]` rejects a tampered/expired signature (`403`), 404s for an unknown id, and 200s with the right bytes/mime for a valid signed URL (depends on T019)
- [X] T026 [US2] Extend `tests/e2e/dish-image.spec.ts` (part 2): the session list shows a thumbnail for a finalized session and the placeholder for a non-finalized one, from **both** the on-device list and a list rebuilt from `/mine` (clear `localStorage` first); assert no bounding-box shift on the row between the placeholder and loaded states; run `expectNoA11yViolations` and confirm the thumbnail's alt text is discoverable (depends on T022, T024)

## Phase 4: User Story 3 - The recipe never gets lost because of the image (Priority: P1)

**Goal**: An image failure, timeout, or invalid result never prevents `finalize` from completing with the full recipe text, and never appears as a stage failure.
**Independent Test**: Force the image step to fail while the text call succeeds; confirm the run still ends "finalized" with full text, and both the final tab and the session list show the placeholder — no error, no stuck stage.

- [X] T027 [US3] Extend `tests/unit/finalize.test.ts`: three explicit scenarios — the image call throws, the image call's `AbortSignal` fires (deadline/cancel), and the returned text parses as invalid/out-of-range JSON — each asserts the node still returns `{ finalRecipe: <complete>, dishImage: null, outcome: "finalized" }`, never a rejected promise (depends on T010, T009)
- [X] T028 [US3] Extend `tests/e2e/dish-image.spec.ts` (part 3): start a session including the `e2e-trigger-image-failure` fixture (T009), run to `finalize`, confirm outcome is "finalized" with full recipe content, the final tab and session list both show the placeholder, and no entry in the History/timeline view reads as a stage failure (depends on T009, T018, T026)

## Phase 5: User Story 4 - The right image follows retries, forks, and branches (Priority: P2)

**Goal**: Retry generates a fresh image; a fork that replays a recorded `finalize` output reuses its image for free; a session with multiple finalized branches shows the most recently finalized one; browsing history shows each checkpoint's own recorded image.
**Independent Test**: Retry a finalized branch (new image); fork past a recorded `finalize` (same image, no new call); finalize two branches at different times (list shows the newer one); browse back to a pre-retry checkpoint (shows its own older image).

- [X] T029 [US4] In `app/api/recipe/[sid]/fork/route.ts`, after `forkReplay()` returns, call `updateSessionThumbnail(sid, replay.state.dishImage, pool)` (T003) when `replay.state.outcome === "finalized"` and `replay.state.dishImage` is non-null — mirroring the existing `bestAvailableTitle(replay.state)` call immediately above it (depends on T003, T010)
- [X] T030 [US4] Extend `tests/integration/images.test.ts`: forking from a checkpoint *after* a recorded `finalize` reuses that checkpoint's `dishImage.imageId` verbatim with no new row inserted into `images` (depends on T029)
- [X] T031 [P] [US4] Extend `tests/contract/step.test.ts`: retrying an already-finalized checkpoint produces a **new** `imageId`, while the pre-retry checkpoint (fetched via its own checkpoint id) still reports its original `dishImage` unchanged (depends on T011)
- [X] T032 [P] [US4] Extend `tests/integration/images.test.ts`: two branches of one session finalized with different `images.id` ordinals both call `updateSessionThumbnail` — confirm `sessions.thumbnail_image_id` ends up pointing at whichever has the higher `id` regardless of call order (depends on T003)
- [X] T033 [US4] Extend `tests/e2e/us2-inspect-history.spec.ts` (or add to `dish-image.spec.ts`, part 4): after retrying a finalized branch, browse back to the pre-retry `finalize` checkpoint via the History view and confirm the final tab shows *that* checkpoint's own (superseded) image, not the branch's current one (FR-009a) (depends on T010, T012)

## Phase 6: User Story 5 - Deleted or expired sessions leave no images behind (Priority: P3)

**Goal**: Deleting a session, or the scheduled 90-day purge, removes that session's images the same way it removes everything else.
**Independent Test**: Delete a session with a finalized image; confirm its image is no longer retrievable. Separately, purge a session aged past the retention window; confirm the same.

- [X] T034 [P] [US5] Extend `tests/integration/images.test.ts`: calling the existing session-delete flow (`deleteSession` after each branch's checkpoints are deleted, matching `app/api/recipe/[sid]/delete/route.ts`) leaves no `images` row for that session's threads — verifying the `ON DELETE CASCADE` chain from data-model.md §3 actually fires, not just asserting it by inspection (depends on T001, T002)
- [X] T035 [P] [US5] Extend `tests/integration/images.test.ts`: the same, via the cron-purge flow (`findStaleSessionIds` + `deleteSession`, matching `app/api/cron/purge/route.ts`) against a session artificially aged past `SESSION_PURGE_DAYS` (depends on T001, T002)
- [X] T036 [US5] Extend `tests/e2e/dish-image.spec.ts` (part 5) or `tests/contract`: after deleting a session via its real API route, `GET /api/images/[imageId]` for that session's former image now 404s (depends on T019, T034)

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T037 Run the live pre-implementation spike research.md R1/R2 flagged as blocked during planning: with a real `OPENROUTER_API_KEY`, generate 5–10 real dishes through the chosen model and `modalities: ["image","text"]`; confirm `message.images` still comes back through `ChatOpenAI` as research R1 predicted from source, and that the returned focal points meet SC-003's 90%-well-framed bar. Separately, run SC-004's own check: show a reviewer only the 10 generated thumbnails (no titles), then reveal the titles, and confirm they correctly match at least 8 of 10 back to the real dish. If either bar isn't met, apply research.md R1's documented fallback (raw `fetch()` to OpenRouter's own `/api/v1/images`, still no constitution amendment) or R2's (accept a second call for the crop, reopening Clarification Q3) — do not silently ship a worse result than what was actually tested
- [X] T038 [P] Audit `.env.example`, `CLAUDE.md`, and `README.md` (already updated once during `/speckit-plan`) against what was *actually* built — fix any drift (e.g. if T037 changed the fallback model id or the integration approach)
- [X] T039 [P] Run the token-discipline grep from quickstart.md/prior features' precedent across every file this feature touched (T012, T013, T023, T024); fix any hard-coded color/spacing/radius value found outside necessary raw geometry
- [X] T040 Run the full verification pass — `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npx playwright test` (full suite, confirming no existing spec's behavior changed) — twice in a row, matching every prior feature in this repo (depends on T014–T036, T039)

---

## Dependencies

```
T001 [P] ─┬───────────────────────────────────────────────────────────┐
T002 [P] ─┼───────────────────────────────────────────────────────────┤
T003 [P] ─┼───────────────────────────────────────────────────────────┤
T004 [P] ─┼───────────────────────────────────────────────────────────┤   Phase 1
T005 [P] ─┼───────────────────────────────────────────────────────────┤ Foundational
T006 [P] ─┼───────────────────────────────────────────────────────────┤ (all block
T007 [P] ─┼───────────────────────────────────────────────────────────┤  Phase 2+)
T008 [P] ─┼───────────────────────────────────────────────────────────┤
T009 [P] ─┴───────────────────────────────────────────────────────────┘
              │
              ▼
   T010 (US1 node rewrite) ──┬──> T011 (step route) ──┬──> T017, T031
                              │                         │
                              ├──> T012 (FinalRecipeView) ──> T013, T033
                              │
                              ├──> T015, T027 (unit tests)
                              │
                              └──> T018 (e2e part 1) ──> T026, T028 (e2e parts 2–3)
                                        │
   T019 (image route) ───────┬─────────┤
   T020 (/mine) ─────────────┤         │
   T021 (useSessionList) ────┤         │
   T022 (page.tsx touch) ────┤         │
   T023 (ListRow) ───────────┤         │
   T024 (SessionList) ───────┴─────────┘
                                        │
   T029 (fork route) ───────> T030, T032, T033
                                        │
   T034, T035 (delete/purge tests) ──> T036
                                        │
                                        ▼
                              T037 ──> T038 ──> T039 ──> T040
```

- **Phase 1 (Foundational)** has no internal dependencies among T001–T009 —
  all nine can run in parallel (different files, `state.ts`/`graph.ts` pair
  excepted: T006 reads the type T005 defines, so T006 follows T005).
- **US1, US2, US3** (all P1) can be built in any relative order **except**
  that US1's T010 (the node rewrite) is a hard prerequisite for essentially
  everything downstream — US2's list can be built and its route/DB/UI wiring
  tested against fixture data independent of T010, but its *end-to-end*
  independent test needs a real `finalize` run to have actually produced a
  `dishImage`, i.e. needs T010. US3 is almost entirely additional tests
  against the same T010 code path.
- **US4** needs T010 (a real `dishImage` to retry/fork/branch) and T003
  (the thumbnail tie-break it verifies).
- **US5** needs only Phase 1 (T001/T002) — it can be verified as soon as the
  table and cascade exist, independent of `finalize` actually working yet.

## Parallel Execution Examples

**Phase 1** (all nine, one sitting):
```
T001, T002, T003, T004, T005, T006, T007, T008, T009
```

**Within US1**, after T010 lands:
```
T013 [P], T014 [P], T016 [P]   (tokens, schema unit test, DB round-trip test — independent of each other)
```

**Within US2**, after its five implementation tasks (T019–T024) land:
```
T025 [P]   (image-route signature tests — independent of the e2e task)
```

**Within US4**, after T029 lands:
```
T030 [P], T031 [P], T032 [P]   (three independent integration/contract test extensions)
```

**Within US5**, entirely independent of every other story once Phase 1 is done:
```
T034 [P], T035 [P]
```

## Implementation Strategy

**MVP = User Story 1 alone** (T001–T018, skipping the test-only tasks if
truly time-boxed): a finalized recipe gets a real photo on its own tab. This
is independently shippable and already delivers the "feels finished" half of
the spec's WHY — but not yet its stated primary payoff (the session list).

**Recommended real delivery order**, matching spec.md's own priority order
and this feature's natural dependency chain: **US1 → US2 → US3 → US4 → US5**.
US1 unlocks everything else (a `dishImage` has to exist before there's
anything to thumbnail, fail gracefully, retry, or delete). US2 is where the
spec's actual "why" (an easy-to-scan session list) is delivered — do not
stop at US1 alone for anything beyond a narrow MVP demo. US3 is cheap once
US1 exists (mostly tests against the failure branch T010 already
implements). US4 and US5 round out correctness and hygiene and can slip to
a follow-up pass without blocking a real release, per their own P2/P3
priority.

**Do not skip T037.** Every other task in this list was designed around
what research.md could verify by reading source code; T037 is the one place
this plan's single biggest open assumption (R1) gets checked against
reality for the first time. If it fails, treat that as new information
requiring a design update, not something to route around silently.
