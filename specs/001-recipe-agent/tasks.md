# Tasks: Recipe Agent

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [research.md](research.md), [quickstart.md](quickstart.md)
**Feature Directory**: `specs/001-recipe-agent`
**Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v2.0.1

Format: `- [ ] [TaskID] [P?] [Story?] Description with exact file path`.
`[P]` = parallelizable (different file, no dependency on an incomplete task).
`[US1]`/`[US2]`/`[US3]`/`[US4]` = the user story phase (spec.md priorities
P1–P4); omitted in Setup, Foundational, and Polish.

**Applies to every API route task** (constitution Principle III, contracts/api.md
§ Common): each `app/api/**/route.ts` MUST `export const runtime = "nodejs"` and
`export const maxDuration = 60`; the Edge runtime is prohibited for any route
touching `pg` or LangGraph.

---

## Phase 1: Setup

- [X] T001 Initialize the Next.js 15 (App Router, TypeScript) project per the tree in `plan.md` § Project Structure
- [X] T002 [P] Install dependencies: `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `@langchain/openai`, `@langchain/core`, `pg`, `zod`, `react`, `react-dom` in `package.json`
- [X] T003 [P] Install dev dependencies: `vitest`, `@vitest/ui`, `playwright`, `@axe-core/playwright`, `@electric-sql/pglite` (or equivalent test-DB), `typescript`, `eslint`, `prettier`
- [X] T004 [P] Create `.env.example` with every variable from `quickstart.md` (`DATABASE_URL`, `OPENROUTER_API_KEY`, `MODEL_DEFAULT`, `MODEL_CRITIQUE`, `PUBLIC_URL`, `MAX_INGREDIENTS`, `MAX_REFINE_CYCLES`, `MAX_STAGES_PER_SESSION`, `STAGE_TIMEOUT_MS`, `SESSION_PURGE_DAYS`, `RATE_WINDOW_SECONDS`, `RATE_MAX_PER_WINDOW`, `DAILY_STAGES_PER_CLIENT`, `DAILY_STAGES_GLOBAL`, `CRON_SECRET`)
- [X] T005 [P] Create `app/tokens.css` with placeholder design tokens (color, spacing, type scale, radii) per constitution Principle VI
- [X] T006 [P] Configure Vitest (`vitest.config.ts`) with `tests/unit` and `tests/integration` projects
- [X] T007 [P] Configure Playwright (`playwright.config.ts`) with an `axe` fixture for `tests/e2e`
- [X] T008 [P] Create `vercel.json` with a daily cron entry for `/api/cron/purge` (research R13)
- [X] T009 [P] Configure ESLint + Prettier

## Phase 2: Foundational (blocking prerequisites — no user story starts before this phase is done)

**Database, migrations, and the time-travel spike**

- [X] T010 Create `lib/db/pool.ts`: module-scope `pg.Pool` singleton from the pooled `DATABASE_URL`, cached on `globalThis` (research R7)
- [X] T011 [P] Create `lib/db/migrations/0001_sessions.sql` (columns per data-model.md § 3, index on `(client_id, last_activity desc)`)
- [X] T012 [P] Create `lib/db/migrations/0002_usage_events.sql` (columns per data-model.md § 3, index on `client_id, created_at` and `kind, created_at`)
- [X] T012a [P] Create `lib/db/migrations/0003_branches.sql` (`branches` table per data-model.md § 3 — constitution v3.0.0, one LangGraph thread per branch); picked up automatically by the existing `scripts/migrate.ts` migration-directory scan
- [X] T013 [P] Create `lib/db/schema.ts`: Zod row schemas for `sessions`, `branches`, and `usage_events` (data-model.md § 3); `sessions` keyed by app-level `session_id`, not a LangGraph thread id
- [X] T014 Create `scripts/migrate.ts`: runs `checkpointer.setup()` then applies `lib/db/migrations/*.sql` tracked in `_app_migrations`, idempotent (research R8); add `"migrate"` script to `package.json` (depends on T010, T011, T012)
- [X] T015 [P] Write `tests/unit/migrate.test.ts` asserting idempotent re-run is a no-op
- [X] T016 Write and run `scripts/spike-timetravel.ts`: build a 2-node throwaway graph, `start → step → updateState(config, patch, asNode) → resume`, and assert the intended node re-runs with the patched input (research R3). Record the confirmed pattern (or the parent-checkpoint fallback) as a comment for `lib/agent/graph.ts`. **Must pass before Phase 3.** (depends on T010, T014)

**Client identity & ownership**

- [X] T017 [P] Create `hooks/useClientId.ts`: mint-on-first-use 32-byte base64url identifier in `localStorage["recipe-agent.clientId"]`, SSR-safe (research R10)
- [X] T018 Create `lib/api-helpers.ts`: extract `X-Client-Id`, 401 if missing; ownership guard returning 404 on mismatch/unknown thread; shared JSON error envelope (contracts/api.md § Common)
- [X] T019 [P] Write `tests/unit/api-helpers.test.ts` for the auth/ownership guard

**Session store, usage ledger, and limits**

- [X] T020 [P] Create `lib/db/sessions.ts`: `insertSession(sessionId, clientId, rootThreadId)`, `bumpActivity`, `incrementStageCount`, `setCapped`, `getByOwner`, `deleteSession` (cascades to `branches` via FK) — owner + counter queries per data-model.md § 3; every query scoped by `session_id` and `client_id`
- [X] T020a [P] Create `lib/db/branches.ts`: `insertBranch(threadId, sessionId, parentThreadId, forkedFromCheckpointId)`, `getBranchesForSession(sessionId)`, `getBranch(threadId)` (constitution v3.0.0, research R3); every query scoped by `session_id`
- [X] T021 [P] Create `lib/db/usage.ts`: insert a `usage_events` row; aggregate count queries for the four limit windows (data-model.md § 3)
- [X] T022 [P] Create `lib/limits.ts`: pure functions `checkRateLimit`, `checkDailyClientCap`, `checkGlobalCap`, `checkSessionCap` (spec FR-061–FR-066, FR-077)
- [X] T023 [P] Write `tests/unit/limits.test.ts` covering each limit boundary

**Graph state skeleton**

- [X] T024 Create `lib/agent/state.ts`: Zod schemas for every sub-type and `Annotation.Root` for all 9 channels, all plain/last-value-wins (data-model.md § 1; constitution Principle IV)
- [X] T025 [P] Write `tests/unit/state.test.ts` validating each schema (including reject-invalid cases)
- [X] T026 Create `lib/agent/models.ts`: `MODELS.default` / `MODELS.critique` resolved from `MODEL_DEFAULT` / `MODEL_CRITIQUE` env vars (research R5; constitution Principle I)
- [X] T027 [P] Create `lib/field-consumers.ts`: the `FIELD_CONSUMERS` map, and an `EDITABLE_FIELDS` set (the six Recipe State fields) for fork validation (research R3; spec FR-025a)
- [X] T027a Create `lib/fork-replay.ts`: given a source branch's history up to a predecessor checkpoint, seed a **brand-new** LangGraph thread by chaining `updateState(currentTipOfNewThread, recordedValues, recordedStageName)` once per prior stage (each call targets the new thread's own always-childless tip — confirmed safe by the T016 spike), then apply the caller's patch as the final step so the new thread's tip has `next = [replayFromStage]`. No model calls. (constitution v3.0.0, research R3)
- [X] T027b [P] Write `tests/unit/fork-replay.test.ts` (depends on T027a, T024, T043) against a `FakeChatModel` + test DB: replaying a 3-stage prefix onto a fresh thread reproduces the exact recorded values at each step, and the final patched step's `next` is correct; asserts NO model call happens during replay
- [X] T028 [P] Write `tests/unit/field-consumers.test.ts` including "a non-editable channel has no consumer / is not in `EDITABLE_FIELDS`"
- [X] T029 Create `lib/tree.ts`: pure function combining, per branch, a flat `TimelineEntry[]` (parent-linked via `parentCheckpointId` **within that branch only**) with the session's `branches` rows, to build the **unified cross-branch tree** — a branch's root entry's tree-parent is `forkedFromCheckpointId` looked up via its `branches` row, not `parentCheckpointId` (constitution v3.0.0, research R2)
- [X] T030 [P] Write `tests/unit/tree.test.ts` covering: forks within a branch's own history, deep nesting, a single-root case (spec edge case "deeply nested branches"), and **stitching two separate branches** via a `branches` row into one tree

**App shell**

- [X] T031 Create `app/layout.tsx` importing `app/tokens.css` and rendering `components/AppHeader.tsx`
- [X] T032 Create `components/AppHeader.tsx`: title; author link (`https://www.linkedin.com/in/john-fong-04b7a120/`) and feedback link (`https://github.com/jf8peas/recipe-agent/issues`), both `target="_blank" rel="noopener"` (spec FR-046–FR-049); **the "pause between stages" toggle** bound to `localStorage["recipe-agent.pauseBetweenStages"]` (default `true`, spec FR-034/FR-036), exposed to the rest of the app via a small `usePauseBetweenStages` hook

**Checkpoint**: Foundational complete when `scripts/migrate.ts` runs clean against a local Postgres **and** the T016 spike confirms the fork/replay mechanism.

---

## Phase 3: User Story 1 — Build a recipe from ingredients, stage by stage (Priority: P1) 🎯 MVP

**Goal**: A user enters ingredients, steps (or auto-runs) through all six stages, and reaches a finalized recipe — including the ingredient-error path, stage failures + retry, cancel, and every spend/rate limit.
**Independent Test**: Enter a valid ingredient list, advance through all stages, confirm a finalized, scaled, formatted recipe with nutrition estimates is produced and saved (spec User Story 1).

**Nodes & graph**

Every node in this group parses its input and validates its output against the
Zod schema for that channel (data-model.md § 1); model calls use
`withStructuredOutput` (constitution Principle II).

- [X] T033 [P] [US1] Create `lib/agent/prompts.ts` with one exported template per node (parseIngredients, proposeDirections, draftRecipe, critique, refine, finalize)
- [X] T034 [P] [US1] Implement `lib/agent/nodes/parseIngredients.ts`: normalize + classify each ingredient usable/not-usable with a reason (spec FR-011, FR-041)
- [X] T035 [P] [US1] Implement `lib/agent/nodes/ingredientError.ts`: set `outcome: "ingredient-error"`, no model call (spec FR-042/FR-043)
- [X] T036 [P] [US1] Implement `lib/agent/nodes/proposeDirections.ts` (spec FR-012)
- [X] T037 [P] [US1] Implement `lib/agent/nodes/draftRecipe.ts` (spec FR-013)
- [X] T038 [P] [US1] Implement `lib/agent/nodes/critique.ts` using `MODELS.critique`, appends to `critiques` by returning the full array (spec FR-014)
- [X] T039 [P] [US1] Implement `lib/agent/nodes/refine.ts`: revises `recipeDraft`, sets `refineCount: prev + 1` (spec FR-015)
- [X] T040 [P] [US1] Implement `lib/agent/nodes/finalize.ts`: scale, format, nutrition estimate, `outcome: "finalized"` (spec FR-016)
- [X] T041 [US1] Implement `lib/agent/edges.ts`: `parseIngredients → ingredientError | proposeDirections`, `critique → refine | finalize` using `MAX_REFINE_CYCLES` (depends on T034–T040)
- [X] T042 [P] [US1] Write `tests/unit/edges.test.ts` for both conditional edges, including the refine-cycle-exhausted case (spec edge case)
- [X] T043 [US1] Implement `lib/agent/graph.ts`: wire all 7 nodes with `StateGraph`, compile with `interruptAfter: [<every node>]` (depends on T041)
- [X] T044 [US1] Implement `lib/agent/runtime.ts`: `getGraph()` singleton over `lib/agent/graph.ts` + `PostgresSaver`, cached on `globalThis` (depends on T043; research R7)
- [X] T045 [US1] Write `tests/integration/graph.test.ts` (depends on T044): full start→…→finalize run against a `FakeChatModel` and a test Postgres; the ingredient-error short path; a `FakeChatModel` that **fails once then succeeds** — assert a `stage-failure` checkpoint then a successful retry **sibling** (spec FR-050/FR-052); and Auto-run over a fixed path produces the **same checkpoint count** as manual stepping (spec SC-011)

**API routes**

- [X] T046 [US1] Implement `POST /api/recipe/start` in `app/api/recipe/start/route.ts`: `runtime="nodejs"`, `maxDuration=60`; pre-flight FR-039/FR-040; rate/global-cap check; mint a `session_id`, `sessions.insertSession` (owner = header), `branches.insertBranch` for the root branch (`parent_thread_id: null`); run first stage on that branch's `thread_id`; `usage.insert` (contracts/api.md)
- [X] T047 [P] [US1] Write `tests/contract/start.test.ts` (empty list, over-max, happy path, 429)
- [X] T048 [US1] Implement `POST /api/recipe/:sid/step` in `app/api/recipe/[sid]/step/route.ts`: body carries `branchId`; ownership guard verifies BOTH `sessions.client_id` (via `:sid`) and `branches.session_id === :sid` (constitution v3.0.0); all four limit checks, session-cap check; `graph.invoke(null, { thread_id: branchId, checkpoint_id: fromCheckpointId }, { signal })` — plain execution, **never** `updateState`, for both a normal step AND retry (confirmed safe by the T016 spike, research R3); stage-failure checkpoint on node throw via `updateState(asNode = failed stage)` on `branchId` (research R4) — this targets the failed checkpoint's still-childless slot, not a second-child-of-an-already-branched case, so it is safe; save-failure retry-then-`202` (research R12); `sessions.incrementStageCount` / `setCapped`
- [X] T049 [P] [US1] Write `tests/contract/step.test.ts` (normal, ingredient-error, stage-failure, **retry from a stage-failure entry → sibling + continues**, cancelled, 429, 409 stale-parent, session-capped)
- [X] T050 [US1] Implement `POST /api/recipe/:sid/step/commit` in `app/api/recipe/[sid]/step/commit/route.ts`: retries only the checkpoint write, never re-invokes the node (spec FR-080–FR-082)
- [X] T051 [P] [US1] Write `tests/contract/step-commit.test.ts`, including: a commit retry does NOT re-invoke the node and does NOT write an extra `usage_events` row (spec FR-082/SC-026)
- [X] T052 [US1] Implement provider-spend-cap detection in `lib/agent/provider-errors.ts` (map OpenRouter 402/429 payment/quota errors to the `provider-cap` envelope, spec FR-066) and wire into T046/T048

**Client**

- [X] T053 [US1] Build the session view inside `app/page.tsx`: client-side switch between the session list and the active session (no per-session route); read the active `sessionId` from `localStorage["recipe-agent.currentSessionId"]` and restore on reload; on load, resolve the active `branchId` (the root branch until US3 lets the user switch branches) via `/history`; create and render `components/StatePanel.tsx` (read-only stub, dispatches to field editors), `components/ActionToolbar.tsx`, and `components/StageProgress.tsx` — a stepper showing which of the six stages have completed and which runs next, from `state.next` / history (spec FR-003b, FR-009)
- [ ] T054 [P] [US1] Implement `hooks/useSession.ts`: tracks `sessionId` + the active `branchId` + selected `checkpointId`; fetches `/state` and `/history`; `start` / `step` / `step` `mode:"retry"` / `step/commit` / `fork` mutations, all sending `branchId` where the contract requires it
- [ ] T055 [P] [US1] Implement `components/RunningStage.tsx`: indeterminate spinner, elapsed-time counter, current stage name, Cancel button (spec FR-009a)
- [ ] T056 [US1] Wire Cancel through `AbortController` in `useSession` (depends on T054, T055; spec FR-072–FR-075)
- [ ] T057 [P] [US1] Implement `hooks/useAutoRun.ts`: client loop of single `/step` calls; reads the pause-between-stages value (T032); stops at finalize, ingredient-error, stage-failure, save-failure, cancel, any limit, or Pause (spec FR-035, FR-038); unit-test in `tests/unit/use-auto-run.test.ts` that a Pause during a run halts within one stage (spec SC-012)
- [ ] T058 [US1] Implement Step/Play and Pause controls in `components/ActionToolbar.tsx` (the pause-between-stages toggle lives in `AppHeader`, T032) (depends on T054, T057)
- [ ] T059 [P] [US1] Implement `components/UnsavedResultBanner.tsx` + "retry save" action calling `step/commit` (spec FR-081)
- [ ] T060 [P] [US1] Implement `components/StageFailureBanner.tsx`: when the current saved state's kind is `stage-failure`, show `failureReason` and a **Retry** action (calls `useSession` `step` with `mode:"retry"`), plus a hint that Edit & Fork also works; disabled when the session is capped (FR-077) or an advance is in flight; wire into the session view (spec FR-051–FR-052; the timeline's visual distinctness, FR-053, is delivered by `BranchTimeline` in T072)
- [X] T061 [P] [US1] Implement the ingredient + constraints entry form on `app/page.tsx` with client-side pre-flight validation mirroring FR-039/FR-040
- [ ] T062 [P] [US1] Implement a minimal read-only `components/fields/IngredientsEditor.tsx` showing per-item usable/reason (spec FR-043)
- [X] T063 [US1] Implement 429 / session-capped UI messaging (rate-limited, daily cap, global cap, provider cap, session cap → matching banners) in `ActionToolbar.tsx` (depends on T058)

**End-to-end**

- [ ] T064 [US1] Write `tests/e2e/us1-happy-path.spec.ts`: start → step through all stages → finalized recipe; also assert the header author/feedback links open in a new tab and the session is unaffected (spec FR-047/SC-016)
- [ ] T065 [P] [US1] Write `tests/e2e/us1-ingredient-error.spec.ts`: invalid ingredient → error outcome, no recipe content
- [ ] T066 [P] [US1] Write `tests/e2e/us1-cancel.spec.ts`: cancel a running stage writes no checkpoint
- [ ] T067 [P] [US1] Write `tests/e2e/us1-stage-failure.spec.ts`: bogus `MODEL_DEFAULT` → the `StageFailureBanner` with its reason and a **Retry** button appears, and Retry issues a `step` `mode:"retry"` request (spec FR-050/FR-051)

**Checkpoint**: User Story 1 is independently complete and demoable — a user can go from ingredients to a finished recipe, including every failure, retry, and limit path.

---

## Phase 4: User Story 2 — Inspect the history of a session (Priority: P2)

**Goal**: Browse every saved state for a session in a branch-tree timeline and open any of them.
**Independent Test**: After a run, open the timeline, confirm every stage is listed with name/time, select an earlier entry, confirm its full state loads unchanged (spec User Story 2).

- [X] T068 [P] [US2] Implement `GET /api/recipe/:sid/history` in `app/api/recipe/[sid]/history/route.ts`: `branches.getBranchesForSession(sid)`, then `getStateHistory` on EACH branch's `thread_id`, flattened into one `TimelineEntry[]` (each tagged with its `threadId`) plus the `branches` list — response shape per contracts/api.md (constitution v3.0.0)
- [X] T069 [P] [US2] Write `tests/contract/history.test.ts` including a session with 2 branches — asserts entries from both threads appear, each with the right `threadId`
- [X] T070 [P] [US2] Implement `GET /api/recipe/:sid/state` in `app/api/recipe/[sid]/state/route.ts`, taking `branchId` + `checkpointId` query params (spec FR-021)
- [X] T071 [P] [US2] Write `tests/contract/state.test.ts` including the unknown-checkpoint 400 and a `branchId` that belongs to a different session (404)
- [ ] T072 [US2] Implement `components/BranchTimeline.tsx`: render the **unified cross-branch tree** from `lib/tree.ts` (T029), one row per saved state, kind badge (normal / in-progress / ingredient-error / stage-failure) as text + ARIA, not color alone (spec FR-017–FR-019, FR-053, FR-085)
- [ ] T073 [US2] Wire timeline selection to `StatePanel` via `/state` (depends on T072, T053; spec FR-020/FR-021)
- [ ] T074 [P] [US2] Implement read-only `components/fields/ConstraintsEditor.tsx`, `DirectionsEditor.tsx`, `RecipeDraftEditor.tsx`, `CritiquesView.tsx`, `FinalRecipeView.tsx` (spec FR-022)
- [ ] T075 [P] [US2] Handle the "saved state no longer exists" message in `useSession` fetch errors (spec FR-033)
- [ ] T076 [P] [US2] Write `tests/e2e/us2-inspect-history.spec.ts`: browse timeline, open an earlier entry, assert exact match

**Checkpoint**: User Story 2 works standalone against sessions produced by User Story 1.

---

## Phase 5: User Story 3 — Edit a past state and replay from it (Priority: P3)

**Goal**: Edit a field on any saved state, fork, and replay from the affected stage on a new branch.
**Independent Test**: Select a mid-run saved state, edit a field, fork, replay one stage, confirm the new output reflects the edit while the original branch is unchanged (spec User Story 3).

- [ ] T077 [US3] Implement `POST /api/recipe/:sid/fork` in `app/api/recipe/[sid]/fork/route.ts` (body: `branchId`, `checkpointId`, `patch`): reject a patch touching any field not in `EDITABLE_FIELDS` (spec FR-025a); validate each changed field against its schema (FR-024); session-cap check (spec FR-077); compute `replayFromStage` via `FIELD_CONSUMERS`; call `lib/fork-replay.ts` (T027a) to seed a **new** `thread_id` by replaying `branchId`'s history up to `replayFromStage`'s predecessor and applying `patch` as the final step — **never** `updateState` a second child onto `branchId` itself (constitution v3.0.0, research R3); `branches.insertBranch(newThreadId, sid, branchId, checkpointId)` (spec FR-026–FR-029, FR-044, FR-044a)
- [ ] T078 [P] [US3] Write `tests/contract/fork.test.ts` (valid edit creates a NEW `branchId` distinct from the source; forking the SAME source checkpoint twice with different patches produces two independent branches with the correct edited content in each — the regression test for the T016 spike's bug; invalid field shape; patch to a non-editable channel → rejected; editing an array field replaces, does not append — FR-025; over-max ingredients; session-capped)
- [ ] T079 [US3] Make `IngredientsEditor`, `ConstraintsEditor`, `DirectionsEditor`, `RecipeDraftEditor` editable with inline validation messages (depends on T062, T074; spec FR-023/FR-024)
- [ ] T080 [US3] Implement "Edit & Fork" in `ActionToolbar.tsx`: collect the patch, call `/fork`, select the new branch (depends on T077, T079; spec FR-026/FR-027)
- [ ] T081 [US3] Implement "Play from here" honoring the current Step/Auto-run mode (depends on T058, T080; spec FR-028)
- [ ] T082 [P] [US3] Implement branch switching in `BranchTimeline.tsx`: selecting any leaf lets that branch step independently (spec FR-030)
- [ ] T083 [P] [US3] Implement `hooks/useAdvanceLock.ts`: `navigator.locks` exclusive lock keyed by the active `branchId` (LangGraph thread_id) + `BroadcastChannel` for cross-tab state sync (research R11; spec FR-059)
- [ ] T084 [US3] Wire `useAdvanceLock` around Step/Play, Play-from-here, and **Retry** (T060) in `ActionToolbar.tsx` / the session view (depends on T083, T058, T081)
- [ ] T085 [P] [US3] Write `tests/e2e/us3-fork-replay.spec.ts`: edit a field, fork, replay, assert divergence and original branch unchanged; also cover the **ingredient-error recovery** path — fork from an ingredient-error state with a corrected `ingredients` value, replay, assert it proceeds past `parseIngredients` (spec FR-044, SC-015; this is US1 scenario 1c, not demonstrable until this task exists)
- [ ] T086 [P] [US3] Write `tests/e2e/us3-invalid-edit.spec.ts`: invalid edit blocked with the offending field named
- [ ] T087 [P] [US3] Write `tests/e2e/us3-two-tabs.spec.ts`: second tab's advance controls disabled while the first tab's stage runs

**Checkpoint**: User Story 3 works standalone on top of User Stories 1–2.

---

## Phase 6: User Story 4 — Resume a session later, same browser (Priority: P4)

**Goal**: Sessions started earlier are listed and reopen exactly as left, in the same browser; a user can delete a session.
**Independent Test**: Start and step a session, fully close the browser, reopen in the same browser, confirm it is listed and reopens to its full timeline and last-selected state (spec User Story 4).

- [ ] T088 [P] [US4] Implement `GET /api/recipe/mine` in `app/api/recipe/mine/route.ts` using `sessions.getByOwner` (owner-scoped list, spec FR-032/FR-060)
- [ ] T089 [P] [US4] Write `tests/contract/mine.test.ts` (returns only the caller's sessions; never another owner's)
- [ ] T090 [P] [US4] Implement `POST /api/recipe/:sid/delete` in `app/api/recipe/[sid]/delete/route.ts`: for every `branches` row of the session, delete that thread's checkpoints (`checkpointer.deleteThread`), then `sessions.deleteSession` (cascades the `branches` rows via FK), idempotent (spec FR-055/FR-056/FR-058)
- [ ] T091 [P] [US4] Write `tests/contract/delete.test.ts`
- [ ] T092 [US4] Implement the on-device session list (`localStorage["recipe-agent.sessions"]`) with rebuild-from-`/mine` fallback on `app/page.tsx`; selecting a session sets `localStorage["recipe-agent.currentSessionId"]` and switches to the session view (no navigation, no URL change) (spec FR-004/FR-003b/FR-032)
- [ ] T093 [US4] Implement the session list UI (title, last activity, status) with a "Delete" action calling `/delete` (depends on T092, T090; spec SC-018)
- [ ] T094 [P] [US4] Broadcast a `session:deleted` message on the shared `BroadcastChannel` so open tabs show the FR-033 message (depends on T083)
- [ ] T095 [P] [US4] Implement `GET /api/cron/purge` in `app/api/cron/purge/route.ts`, guarded by `CRON_SECRET`: find stale `sessions`, delete each of their `branches`' checkpoints then the session rows (same cascade as T090) (spec FR-057)
- [ ] T096 [P] [US4] Write `tests/e2e/us4-resume.spec.ts`: close/reopen the browser, confirm the session list and exact resume
- [ ] T097 [P] [US4] Write `tests/e2e/us4-delete.spec.ts`: delete a session, confirm it is gone from the session list and the `/mine` result

**Checkpoint**: User Story 4 works standalone on top of User Stories 1–3.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T098 [P] Keyboard navigation + focus management for `BranchTimeline.tsx` (spec FR-085)
- [ ] T099 [P] ARIA live-region announcements for stage status, errors, limit messages, and unsaved/failed results across `RunningStage.tsx` / `ActionToolbar.tsx` / `StageFailureBanner.tsx` / `UnsavedResultBanner.tsx` (spec FR-084)
- [ ] T100 [P] Add `@axe-core/playwright` assertions to every `tests/e2e/*.spec.ts` flow and fix violations (spec SC-027)
- [ ] T101 [P] Manual keyboard + screen-reader pass on all primary flows (start, step, inspect, edit & fork, retry, delete); log and fix findings
- [ ] T102 Translate the Claude Design artboards into `app/tokens.css` and component styling, checked against screenshots of the working app (RECOMMENDATION.md §6–7)
- [ ] T103 [P] Write `README.md` linking to `quickstart.md` and covering local setup + deploy
- [ ] T104 Create the Neon project + Vercel integration, set all env vars from `.env.example`, confirm `vercel.json` cron, run `scripts/migrate.ts` as a pre-deploy step
- [ ] T105 Smoke-test the full primary flow (start → step → fork → resume → delete) on a Vercel preview deployment, and record the observed first-stage latency against SC-002 (≤ 30 s)

---

## Dependencies

- **Phase 1 → Phase 2 → Phase 3 (US1)**: strictly sequential; nothing in a user
  story phase starts before Foundational is done and the **T016 spike passes**.
- Within Foundational, T016 (spike) only needs T010 + T012a/T014 — it does not
  wait on T017–T032; run it as soon as migrations work. **T016 is what
  discovered the one-thread-per-branch requirement** now baked into T012a,
  T020a, T027a/T027b, T029, T046, T048, T068, T077, T090, T095 (constitution
  v3.0.0) — those tasks are written to the confirmed-safe patterns, not the
  original single-thread design.
- **US1 (P1)** has no dependency on US2–US4 and is the MVP.
- **US2 (P2)** depends only on Foundational + the `sessions`/checkpoints US1
  produces to browse; most easily demoed after US1's client shell (T053).
- **US3 (P3)** depends on US1 (graph, `/step`, `StageFailureBanner`) and US2
  (`BranchTimeline`, `StatePanel`, field-view components).
- **US4 (P4)** depends on US1 (sessions exist) and reuses US3's
  `useAdvanceLock`/`BroadcastChannel` (T083) for the delete broadcast.
- **Polish** depends on all four user stories.

## Parallel Execution Examples

- **Foundational**: T011–T013, T012a (db files), T015, T017, T019–T023, T020a (identity/usage/limits/branches),
  T025–T030, T027b (state/tree/field-consumers tests) are independent files — run together.
- **US1 nodes**: T033–T040 (prompts + 7 node files) touch disjoint files — run
  together, then T041 (edges) integrates them.
- **US1 client**: T055, T057, T059, T060, T061, T062 are independent components/hooks —
  run together before the wiring tasks (T056, T058, T063).
- **US2**: T068–T071 (two routes + two contract tests) in parallel; T074
  (5 field-view components) in parallel.
- **US3**: T078 (contract test) parallel with T079 (editors); T082/T083 parallel.
- **US4**: T088–T091 (two routes + two contract tests) in parallel; T096/T097 (e2e) in parallel.
- **Polish**: T098–T101, T103 are independent — run together.

## Implementation Strategy

**MVP = User Story 1 only** (Phases 1–3, T001–T067). A complete, demoable product:
build a recipe end-to-end with validation, execution modes, cancel, **stage-failure
+ retry**, and every spend/rate guard — no history browsing or editing yet. The
full branch-tree with kind badges (FR-053's timeline representation) arrives with
`BranchTimeline` in US2; in the MVP a stage failure surfaces via
`StageFailureBanner` (T060). US1 acceptance scenario 1c (recover from an
ingredient-error state by editing, forking, and replaying) needs the fork route
and only becomes demonstrable once US3 (T077, T085) ships — the MVP's
Independent Test does not require it.

**Incremental delivery**:
1. Ship Phases 1–3 (US1) → usable single-path recipe builder.
2. Add Phase 4 (US2) → users can see how a recipe evolved.
3. Add Phase 5 (US3) → the differentiating time-travel edit/fork/replay.
4. Add Phase 6 (US4) → sessions persist and are manageable across visits.
5. Polish phase → accessibility conformance, design pass, deploy.

Each checkpoint above is independently testable and shippable; stopping after any
phase leaves a working (if smaller-scoped) product.
