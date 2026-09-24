# Contract: the `finalize` node (updated)

`lib/agent/nodes/finalize.ts`. Still exactly one node, one entry in
`NODE_NAMES`, one edge in from `critique`'s conditional routing, one edge out
to `END` — **nothing about the graph's shape changes** (Hard Constraint 1,
FR-020). This document covers what changes *inside* the node function.

## Model routing (constitution: every node documents which key it uses and why)

| Call | Model key | Env var | Why a different key |
|---|---|---|---|
| Recipe text (title, servings, ingredients, steps, toBuy, scaled servings, nutrition) | `MODELS.default` | `MODEL_DEFAULT` | Unchanged from today — this is the same structured-output call `finalize` already made before this feature; nothing about it needs a different model. |
| Dish photo + focal point | `MODELS.image` (new) | `MODEL_IMAGE` (new, fallback `google/gemini-2.5-flash-image` — R1) | A text model has no image-output capability at all; this must be a distinct, image-capable model regardless of what `MODELS.default` happens to be pointed at (Hard Constraint 2). |

`MODELS.image` is added to `lib/agent/models.ts` only — the single place
every model key resolves, unchanged pattern from `MODELS.default`/`MODELS.critique`.

## Inputs (unchanged)

`state.recipeDraft`, `state.constraints` — exactly as today. The image call
additionally reads `finalRecipe.title` (from the text call's own result,
once it's available) to build the alt text and the image prompt — it does
not re-read anything from `state` that the text call didn't already need.

## Outputs

```ts
Partial<State> = {
  finalRecipe: FinalRecipe,      // unchanged shape, unchanged validation
  dishImage: DishImage | null,   // new — see data-model.md §1
  outcome: "finalized",          // unchanged
}
```

**The LLM structured-output schema for the text call is unchanged** —
`z.object({ finalRecipe: FinalRecipeSchema })`. `dishImage` is never part of
what the text model is asked to produce or validated against; it's the
node function's own assembly of the *separate* image call's result (see
below), a Principle-II-compliant boundary of its own.

## Execution order (Clarification Q1 — sequential, not concurrent)

```
1. Run the text call to completion (unchanged behavior/timeout/cancellation).
2. Compute the image call's remaining budget (research.md R3).
3. If budget too small → dishImage = null, skip to step 6.
4. Run the image call (modalities: ["image","text"], R1) with that budget.
5. Parse+validate the result (R2); on ANY failure → dishImage = null.
6. Insert the image row (if step 4/5 succeeded) — see below.
7. Return { finalRecipe, dishImage, outcome: "finalized" }.
```

Step 1 failing behaves exactly as it does today (uncaught → the route's
existing stage-failure handling). Steps 3–6 **never** throw past this node —
any failure there is caught internally and normalized to `dishImage = null`
(FR-003/004; this is the one part of `finalize` that is allowed to fail
"successfully").

## The image-row side effect (step 6)

The node itself inserts the `images` row (data-model.md §3) — it needs
`config?.configurable?.thread_id` (the same way every node already reads its
own thread id) to satisfy the table's `thread_id` FK, and generates a fresh
random `image_id` (not derived from `thread_id`/`session_id` — R4). This is
the one place in the graph where a node performs a database write beyond
returning its own state delta; it's necessary because the bytes themselves
cannot live in graph state or a checkpoint (Hard Constraint 3) and must
exist somewhere addressable *before* the node returns a reference to them.

```ts
// shape, not final code
export async function finalize(state: State, config?: LangGraphRunnableConfig): Promise<Partial<State>> {
  const textModel = createChatModel(MODELS.default).withStructuredOutput(OutputSchema, { name: "finalize" });
  const { finalRecipe } = OutputSchema.parse(await textModel.invoke(finalizePrompt(state.recipeDraft, state.constraints), config));

  const dishImage = await tryGenerateDishImage(finalRecipe, config).catch(() => null);

  return { finalRecipe, dishImage, outcome: "finalized" };
}
```

## Fake-model mode (`RECIPE_AGENT_FAKE_MODEL=1`)

`lib/agent/fake-model.ts`'s `finalize` case returns a small, deterministic
fixture: a committed tiny fixture image (a few hundred bytes, checked into
the repo test fixtures, not generated at test time) and a fixed focal point
(e.g. `{ focalX: 0.5, focalY: 0.45, zoom: 1 }`), so e2e specs never call a
real image model and never depend on network access. A second fixture
sentinel (mirroring the existing `e2e-trigger-failure-<node>-<nonce>` and
`e2e-trigger-blocking-critique` conventions already in that file) — e.g.
`e2e-trigger-image-failure` — makes the fixture's image step fail on
purpose, so User Story 3 (recipe survives an image failure) has a
deterministic path to exercise in Playwright.

## Usage/rate-limit accounting (FR-017)

No new `usage_events` row kind is introduced for the image call. The
existing `recordUsageEvent({ clientId, threadId, kind: "stage" }, pool)` call
already made once per successful `/step` invocation (in the route, not the
node) covers the whole `finalize` attempt — text and image together — exactly
as it already covers every other single-model-call stage today. This needed
no code change to confirm: the route's usage-recording call site doesn't
know or care how many model calls happened inside the node it just ran.
