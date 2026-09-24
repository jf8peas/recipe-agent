# Quickstart: Dish Image Generation & Session Thumbnails

## Setup

Follow [specs/001-recipe-agent/quickstart.md](../001-recipe-agent/quickstart.md)
for initial project setup if you haven't already. This feature adds:

```bash
# .env — new
MODEL_IMAGE=google/gemini-2.5-flash-image   # falls back to this if unset
IMAGE_URL_SECRET=<any long random string>   # signs image URLs — see research.md R4
```

Apply the new migration (idempotent, same as every prior one):

```bash
npm run migrate
```

**Before relying on this in a real environment**: run the R2 spike this
plan's research explicitly deferred — generate 5–10 real dishes with a real
`OPENROUTER_API_KEY` and confirm (a) `modalities: ["image", "text"]` on the
chosen model actually returns `message.images` through `ChatOpenAI` as
expected (research.md R1's one open risk), and (b) the returned focal points
are actually well-framed enough to clear SC-003's 90% bar. Neither was
possible to confirm during planning (no key configured in the planning
environment).

## Run it

```bash
npm run dev
```

## Primary flow (User Story 1 — full image on the final tab)

1. Start a session and step (or Auto-run) all the way to `finalize`.
2. Confirm a photo-realistic dish image appears on the Final recipe tab,
   alongside the title/ingredients/steps/nutrition exactly as before this
   feature.
3. Confirm the agent-graph progress diagram and the stage tabs show the
   same single `finalize` stage as any pre-feature run — no new node, no
   new tab, no extra pause between `critique`/`refine` and the final result.
4. Inspect the image's `alt` attribute — confirm it reads "Photo of `<the
   recipe's actual title>`".

## Session list thumbnails (User Story 2)

1. With at least one finalized session and one session that never reached
   `finalize` (still in progress, or an ingredient error), open the session
   list.
2. Confirm the finalized session's row shows a thumbnail cropped from its
   own dish photo — visibly framed on part of the food, not a generic
   center-of-plate/table crop — and the other row shows the neutral
   placeholder.
3. Throttle the network (DevTools) and reload the list — confirm the row's
   layout doesn't shift between the placeholder state and the loaded
   thumbnail (a fixed-size media slot is reserved up front).
4. Clear `localStorage` (or open in a private window with the session's id
   never locally known) and let the list rebuild from `GET /api/recipe/mine`
   — confirm the same thumbnail appears, unchanged.

## Resilience (User Story 3 — image failure never costs the recipe)

Using the fake-model e2e harness (`RECIPE_AGENT_FAKE_MODEL=1`,
`scripts/e2e-server.ts`), start a session whose ingredients include the
`e2e-trigger-image-failure` fixture sentinel (`lib/agent/fake-model.ts`) and
run to `finalize`.

1. Confirm the run still ends with outcome `"finalized"` and the full
   recipe text/steps/nutrition present.
2. Confirm the final tab and the session list both show the neutral
   placeholder, not a broken image or an error state.
3. Confirm nothing about this appears as a stage failure anywhere in the
   history/timeline view.

## Retry, fork, and multi-branch (User Story 4)

1. On an already-finalized branch, click Retry on the `finalize` stage —
   confirm the shown image changes to a newly generated one.
2. Fork from a checkpoint *after* `finalize` (a pure replay) — confirm the
   new branch immediately shows the same image as the source branch, with
   no new image request observed (check the Network tab / server logs for
   no additional image-model call).
3. Fork from a checkpoint *before* `finalize` and let the new branch run
   for real past it — confirm it gets its own, independently generated
   image.
4. With two branches on one session each finalized at different times,
   confirm the session list shows the more-recently-finalized branch's
   image.
5. Browse back to the pre-retry `finalize` checkpoint from step 1 — confirm
   the final tab shows *that* checkpoint's own (now superseded) image, not
   the branch's current one.

## Deletion and purge (User Story 5)

1. Delete a session that has a finalized image — confirm `GET /api/images/[imageId]`
   for that id now 404s.
2. Run the purge cron handler against a session artificially aged past
   `SESSION_PURGE_DAYS` — confirm its image is gone the same way.

## Automated checks

```bash
npx tsc --noEmit
npx vitest run tests/unit/dish-image.test.ts tests/unit/finalize.test.ts
npx vitest run tests/integration/images.test.ts tests/contract/step.test.ts tests/contract/fork.test.ts
npm run build
npx playwright test tests/e2e/us1-happy-path.spec.ts tests/e2e/dish-image.spec.ts
```

Run the full `tsc`/`vitest`/`build`/`playwright` suite green twice in a row
before considering this feature done, matching every prior feature in this
repo.
