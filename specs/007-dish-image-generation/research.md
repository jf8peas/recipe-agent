# Research: Dish Image Generation & Session Thumbnails

Every item below was resolved by reading this repo's actual installed
dependency source (not just its published docs) and, where that was
insufficient, cross-checking OpenRouter's current (2026-09) documentation and
blog. No live OpenRouter call was made — there is no `OPENROUTER_API_KEY`
configured in this environment (`.env` has only `DATABASE_URL`) — so R2's
empirical spike against real dishes is flagged as an explicit, unresolved
pre-implementation step, not silently assumed.

## R1. Calling an OpenRouter image-output model through `@langchain/openai`

**Decision**: Use `ChatOpenAI` exactly as every other node already does —
`createChatModel()`, extended with an optional `modalities` constructor
field — with `modalities: ["image", "text"]`. No new dependency, no raw
`fetch()`, no deviation from the constitution's named mechanism.

**Rationale — verified by reading the installed package, not assumed**:

`@langchain/openai` is pinned at **1.5.13** in this repo (`node_modules/@langchain/openai/package.json`). Its `base.cjs` shows `modalities` is a real,
publicly-typed constructor/request field:

```
// node_modules/@langchain/openai/dist/chat_models/base.d.ts:88
modalities?: Array<OpenAI.Chat.ChatCompletionModality>;
```

and `completions.cjs` confirms it's actually sent on the wire:

```js
// node_modules/@langchain/openai/dist/chat_models/completions.cjs:50
...this.modalities || options?.modalities ? { modalities: this.modalities || options?.modalities } : {},
```

More importantly, the response side has **first-class, OpenRouter-specific
handling already built in** — `node_modules/@langchain/openai/dist/utils/output.cjs`:

```js
/**
 * Handle multi modal response content.
 */
function handleMultiModalOutput(content, messages) {
  /**
   * Handle OpenRouter image responses
   * @see https://openrouter.ai/docs/features/multimodal/image-generation#api-usage
   */
  if (messages && typeof messages === "object" && "images" in messages && Array.isArray(messages.images)) {
    const images = messages.images
      .filter((image) => typeof image?.image_url?.url === "string")
      .map((image) => ({ type: "image", url: image.image_url.url }));
    return [{ type: "text", text: content }, ...images];
  }
  return content;
}
```

This is called from `_convertCompletionsMessageToBaseMessage` with the raw
`choices[0].message` — so when OpenRouter returns `message.images[].image_url.url`
(a base64 data URL), the resulting `AIMessage.content` is **already** an
array: `[{ type: "text", text: "<whatever the model wrote>" }, { type: "image", url: "data:image/png;base64,..." }, ...]`.
No `additional_kwargs`/`response_metadata` digging needed — the officially
supported code path already produces exactly the shape we need.

**One real gap**: `OpenAI.Chat.ChatCompletionModality` (from the upstream
`openai` npm package, v7.15.0, also installed) is typed as `'text' | 'audio'`
— `'image'` isn't in that union, because it's an OpenRouter extension, not
part of vanilla OpenAI's own API. Passing `modalities: ["image", "text"]`
needs a narrow `as` cast at the one call site that sets it. This is a
type-level workaround only (the JS runtime doesn't validate the array against
that union — it's just spread into the request body) and doesn't touch any
other node or the shared `createChatModel()` signature's public contract.

**A genuine, unresolved risk** (see R2): OpenRouter's *current* own docs and
blog post ([openrouter.ai/blog/tutorials/image-generation-models](https://openrouter.ai/blog/tutorials/image-generation-models/))
now present a **separate, dedicated Image API** (`POST /api/v1/images`,
OpenAI-compatible but a different REST resource) as the primary/documented
way to generate images as of their "Unified Image API" launch (late June
2026) — and one blog fetch explicitly stated chat completions are now used
only for image *understanding* (vision input), not generation. A search
result (which I cannot re-verify against a primary source without a live
call) also said modalities-on-chat-completions is *still* a supported
generation path alongside the dedicated endpoint. `@langchain/openai`
1.5.13's own source clearly still expects `message.images` on a chat
completion response (the code above wasn't written speculatively — it names
the exact OpenRouter response shape). I could not resolve this
disagreement without a live OpenRouter call, which this environment can't
make.

**Why chat-completions-with-modalities is still the right choice regardless**:
R2 below establishes that the crop's focal point must come back as
free-text/JSON *alongside* the image, in the same call (per Clarification
Q3 — no third model call). The dedicated Image API's own documented response
shape (`{ data: [{ b64_json, media_type }], usage }`) has **no text channel
at all** — it is image-only. Only the chat-completions shape (`message.content`
text plus `message.images`) can carry both in one response. So even if the
dedicated Image API is OpenRouter's newer, more-promoted path, it cannot
satisfy Q3's already-resolved constraint by itself. This is not a case of
picking the older, less-supported option out of inertia — it's the only
option that can do what the spec already requires.

**Action required before implementation starts**: a real smoke-test call
(the R2 spike below, which needs `OPENROUTER_API_KEY`) must confirm
`modalities: ["image", "text"]` on `/chat/completions` still returns
`message.images` for the chosen model. **If it doesn't**, the fallback is
NOT a constitution amendment — it's a raw `fetch()` to OpenRouter's own
`/api/v1/images` (still OpenRouter exclusively, still the existing
`OPENROUTER_API_KEY`, zero new npm dependencies, zero direct provider SDKs)
plus accepting a second, small text-only call for the crop (reopening
Clarification Q3 to its Option B). That fallback is flagged here explicitly
so it's a conscious, documented decision if it's ever needed — not a silent
workaround.

**Model ID chosen for `MODEL_IMAGE`'s fallback**: `google/gemini-2.5-flash-image`.
Rationale: it's a currently-listed OpenRouter image model (per both the
"Unified Image API" blog post and general 2026 coverage), the "Flash" tier is
priced/latency-optimized rather than the largest/slowest tier in its family
(relevant given the 60s function ceiling), and Gemini's multimodal models are
generally strong at *also* following an accompanying text instruction (needed
for R2's focal-point request) rather than being a pure image-diffusion
endpoint with no text-following ability. Output format/size/latency are
recorded as estimates in R5 — none of this is empirically confirmed against a
real call in this environment.

**Alternatives considered**: `openai/gpt-image-1`/`gpt-image-2` (plausible
alternative, likely higher cost/latency per image than a "Flash"-tier model);
`black-forest-labs/flux.2-pro` (strong photorealism reputation, but FLUX
models are typically diffusion-only with no demonstrated strength at
following a *combined* image+text-instruction in one turn, which R2 needs).

## R2. Getting the focal point from the same call (Clarification Q3)

**Decision**: The image call is **not** wrapped in `withStructuredOutput()`.
Instead, the prompt asks the model, in plain instructions, to also emit a
small JSON object as its accompanying text — e.g.
`{"focalX": 0.62, "focalY": 0.41, "zoom": 1.15}` — and the node parses
`content[0].text` (the text block `handleMultiModalOutput` always puts first)
through a plain `DishImageCropSchema.safeParse(JSON.parse(...))` after the
call returns.

**Rationale**: `withStructuredOutput()` in this codebase (every other node)
works via OpenAI-style `response_format`/tool-calling constrained decoding.
There's no confirmed evidence that OpenRouter's image-generation models
support combining that response-shaping mechanism with `modalities: ["image", "text"]`
in the same request — image-generation heads are architecturally distinct
from the function-calling/JSON-schema-constrained decoding path
`withStructuredOutput()` relies on. Rather than assume compatibility I can't
verify without a live call, the safer design treats the crop JSON as
plain, unconstrained text and validates it after the fact — exactly the
posture Hard Constraint 3 and the spec's edge cases already require
("anything invalid or missing counts as an image failure... not a
centre-crop fallback").

**Validation rule**: `focalX`/`focalY` MUST parse as numbers in `[0, 1]`;
`zoom`, if present, MUST be `>= 1`. `JSON.parse` failure, a schema mismatch,
missing fields, or an out-of-range value are **all** treated identically —
as an image failure (FR-003/004), never a silent center-crop substitution
(explicitly ruled out by the spec's first edge case).

**The empirical bar (SC-003) — NOT validated in this planning pass**: the
spec requires ≥90% of generated thumbnails to be judged well-framed by a
human reviewer. Running the "5–10 real dishes" spike this research task asks
for requires a real `OPENROUTER_API_KEY` and real spend; neither is
available in this environment (`.env` has no key configured). **This is
recorded here as an explicit, required first implementation step**, not
something this plan can claim to have already confirmed. If the model's
returned focal points clearly miss the bar once tested for real, the
finding is a reason to revisit — reduce scope to a fixed, non-per-dish
default crop, or add a second call — not something to paper over.

**Alternatives considered**: A separate vision-capable call (inside
`finalize`, still no new node) that looks at the already-generated image and
picks the crop — rejected by Clarification Q3 already, for good reason: it
stacks a *third* sequential model call inside an already time-constrained
stage (see R3), and gives the failure-isolation logic (R3) a second thing to
reconcile if it fails independently of the image itself.

**Constitution note (Principle II)**: "LLM structured output MUST be
constrained by, and validated against, a Zod schema" is satisfied here by
two separate mechanisms rather than one, because this is the first node
where they can't be the same call: the image-generation request can't
confirmedly also carry a `withStructuredOutput()`/`response_format`
constraint (the technical concern documented above), so the crop is
*constrained* only by prompt instruction, then *validated* against
`DishImageSchema` immediately after the call returns and before it's
assembled into the node's output. Nothing unvalidated ever crosses the node
boundary into `State` — the principle's own rationale (safe-to-resume edited
checkpoints) is fully met. If a future OpenRouter/`@langchain/openai`
release confirms combining modalities with structured output, switch to
that and drop this exception.

## R3. Time budget across two sequential calls in one stage

**Current constraints** (`.env.example`, `lib/agent/models.ts`): `maxDuration = 60` (hard Vercel ceiling, every route); `STAGE_TIMEOUT_MS` defaults to `45000` and
is applied as `createChatModel()`'s per-request client timeout — currently
identical for every node, including `finalize`'s one existing call.

**Decision**: One deadline for the whole `finalize` invocation, split
sequentially (Clarification Q1 already fixed the ordering):

1. The text call keeps its **existing, unchanged** behavior — same
   `STAGE_TIMEOUT_MS`, same cancellation via `config.signal`, same
   catch-and-turn-into-stage-failure path every node already has. This
   feature makes zero behavioral change to how `finalize`'s text generation
   works or fails.
2. Once the text call resolves, compute the image call's own budget:
   `imageDeadlineMs = maxDurationMs*1000 - elapsedMs - SAFETY_MARGIN_MS`,
   where `elapsedMs` is measured from the start of the node call and
   `SAFETY_MARGIN_MS` (recommended: `5000`) covers the image DB insert and
   the LangGraph checkpoint write that still have to happen after the image
   call returns.
3. If `imageDeadlineMs` is below a minimum useful threshold (recommended:
   `5000` — not enough time to plausibly get anything back), **skip the
   image call entirely** and finalize with no image. This is a normal,
   expected outcome under FR-003/004, not an error path.
4. Otherwise, make the image call with its own `AbortSignal.timeout(imageDeadlineMs)`,
   combined with the real request signal via `AbortSignal.any([config.signal, AbortSignal.timeout(imageDeadlineMs)])`
   — both are Node/web-standard, built into Node 20+, zero new dependency.
5. `createChatModel()` needs a second optional parameter to accept this
   per-call timeout override (it currently hard-codes `STAGE_TIMEOUT_MS`
   unconditionally); the model instance used for the image call passes
   `timeoutMs: imageDeadlineMs` there instead of relying on the global env
   default.

**Cancellation semantics — the one behavioral decision this stage needs**:

- A cancel that arrives **during the text call**: behaves exactly as every
  other node already does today — the whole `finalize` invocation throws,
  the route's existing `request.signal.aborted` check returns 499, nothing
  is written. **Unchanged.**
- A cancel that arrives **during the image call** (text already fully
  produced): the image call's own `try/catch` swallows *any* failure of that
  call uniformly — a real error, a validation failure (R2), a timeout, or an
  abort from the combined signal — and continues to the normal successful
  return (`finalized`, no image). It deliberately does **not** distinguish
  "the deadline elapsed" from "the user clicked Cancel" — both produce the
  same, already-required outcome (FR-003: image problems never cost the
  recipe). The route handler that receives this success is unaffected by
  whatever state the client's own HTTP connection is in by then — if the
  client already gave up on this exact request, the existing
  already-advanced/409-then-self-heal mechanism (`hooks/useSession.ts`, already
  shipped) is what reconciles the client's view with the now-real, committed
  "finalized" checkpoint. No new client-side mechanism is needed for this;
  it's the same race the app already tolerates and recovers from for every
  other stage.

**Addendum, found during real (non-mocked) production testing, not
planning**: the original design above bounded only the *image* call's
worst-case duration and left the *text* call implicitly bounded by nothing
more than `STAGE_TIMEOUT_MS` per attempt. `createChatModel()` sets
`maxRetries: 2` unconditionally on every model it constructs (pre-existing,
not introduced by this feature) — so a slow or flaky text call could retry
up to 3 total attempts, each up to `STAGE_TIMEOUT_MS` (default 45s), with
nothing capping the *sum*. Observed live: a Vercel platform-level 60s
timeout on `finalize`, with the recipe recovered fine afterward — meaning
the image call's own budget-aware abort worked exactly as designed, but the
text call had no equivalent ceiling and could still (on a bad attempt) push
the whole invocation past the function's hard limit before the route's own
stage-failure handling ever got a chance to run.

**Fix, part 1**: `finalize.ts` now also gives the text call its own hard
deadline, `TEXT_DEADLINE_MS = MAX_DURATION_MS - SAFETY_MARGIN_MS` (55s) — the
same `AbortSignal.any([config.signal, AbortSignal.timeout(...)])` pattern the
image call already used, applied symmetrically. This doesn't change what a
text-call failure *means* (it's still a real stage failure, unlike an image
failure) — it only guarantees that failure happens with enough time left for
the route's existing stage-failure checkpoint write to actually run, instead
of the whole function being hard-killed by the platform first.

**Second addendum, found testing part 1's fix live**: the fix above still
didn't stop a real Vercel timeout on a *retried* `finalize`. Root cause: this
whole budget was measured from `Date.now()` captured *inside the node*, not
from when the HTTP request actually arrived. Everything in
`app/api/recipe/[sid]/step/route.ts` that runs before `graph.invoke()` —
ownership/rate-limit checks, and especially the full per-branch
checkpoint-history read (`siblingHistory`, used for the already-advanced
guard) — already spends against the same 60s ceiling but was invisible to
`finalize`'s own clock. That history read grows every time a branch is
retried (each retry adds sibling checkpoints, including the extra
"in-progress" ghost sibling from the pre-existing LangGraph
plain-`invoke`-on-an-already-childed-checkpoint quirk documented in
`data-model.md`'s `updateSessionThumbnail` correction and in
`tests/e2e/dish-image.spec.ts`'s US4 test) — so the miscount got worse with
every subsequent Regenerate click, exactly matching what was observed live.

A second, independent bug compounded it: `AbortSignal.timeout(ms)` counts
`ms` from the moment it's *called*, not from `startedAt` — so even after
fixing where `startedAt` comes from, the text call's own
`AbortSignal.timeout(TEXT_DEADLINE_MS)` was still using the fixed 55s
constant verbatim, un-shrunk by whatever had already elapsed since the
request began.

**Fix, part 2**: `app/api/recipe/[sid]/step/route.ts` now captures
`requestStartedAt = Date.now()` as its very first statement and threads it
through `config.configurable.requestStartedAt`; `finalize.ts` prefers that
over its own `Date.now()` (falling back to a fresh timestamp for callers
that don't thread it through — direct node tests, fork-replay's own
re-execution past the fork point). The text call's own deadline is now
`Math.max(0, TEXT_DEADLINE_MS - (Date.now() - startedAt))` — shrunk by
elapsed time exactly the way the image call's deadline already was,
computed fresh right before constructing its `AbortSignal.timeout(...)`
rather than baked into a constant passed straight through.

**Third addendum, found live again — this time in a completely different
node**: after part 2 shipped, the exact same "Vercel platform-level 60s
kill, no application error" symptom recurred, but on `critique`, not
`finalize` — confirmed by production logs showing `graph.invoke` called at
~4s elapsed and then nothing until the 60s platform kill, with `critique`
as the pending stage. `critique.ts` (and every other node — `parseIngredients`,
`proposeDirections`, `selectDirection`, `draftRecipe`, `refine`) had never
had any of `finalize`'s deadline work applied — each was still relying
solely on the per-attempt `STAGE_TIMEOUT_MS` × `maxRetries: 2` with nothing
bounding the total, the original class of bug from part 1's addendum, just
never triggered in that particular node until now.

**Fix, part 3 (generalized, out of `finalize.ts` entirely)**: extracted
`requestDeadline(config, reserveMs?)` into a new shared module,
`lib/agent/deadline.ts` — computes `{ timeoutMs, signal }` from
`config.configurable.requestStartedAt` (falling back to `Date.now()`) the
same way `finalize`'s text call already did, reserving `DEFAULT_RESERVE_MS`
(5000ms) by default. Every node now calls this once and passes the
resulting `timeoutMs` into `createChatModel()` and the resulting `signal`
into `.invoke()`, instead of passing `config` through unbounded.
`finalize.ts` itself was refactored to call the shared helper for its text
call (`requestDeadline(config, SAFETY_MARGIN_MS)`) rather than duplicating
the same three lines locally; its image call keeps its own bespoke logic
(the `MIN_IMAGE_BUDGET_MS` skip-threshold doesn't fit the generic helper).
Every node also gained a `console.error` on model-call failure (previously
silent beyond whatever the route's own stage-failure handling logged) —
this class of bug is genuinely hard to diagnose without a timestamped trace,
as both prior addenda here demonstrate.

**Fourth addendum — the margin itself was too thin**: with parts 1–3 live, a
real trace showed the text call correctly aborting right on its own
schedule (49334ms against a 49335ms budget — the mechanism works), but then
the *route's own stage-failure cleanup* — write the failure checkpoint,
re-read state, fetch branches, rebuild the timeline (`buildTimeline`, which
does its own full per-branch checkpoint-history scan, the same cost class as
the already-advanced guard's `siblingHistory` read) — ran out of the ~5s
`DEFAULT_RESERVE_MS` gave it and got hard-killed by Vercel mid-cleanup, on a
branch with 17+ accumulated checkpoints. `DEFAULT_RESERVE_MS` (and
`finalize.ts`'s `SAFETY_MARGIN_MS`, now sourced from it rather than
independently picked) moved from 5000 to 10000 — the failure path is
heavier than the success path the original number was sized for, and that
gap widens as a branch accumulates more checkpoints. `buildTimeline`
duplicating `siblingHistory`'s scan (instead of reusing it) is a real,
identified optimization — deliberately not done here: it touches a shared
utility every route calls, a larger, riskier change than the scope of an
in-production timeout fix warranted.

Separately, unrelated to this codebase: the same trace showed
`MODEL_DEFAULT=deepseek/deepseek-v4-flash` consuming the *entire* ~49s
budget before timing out, never returning at all — worth the operator
checking that model's actual availability/latency on OpenRouter, independent
of anything above.

## R4. Serving images to `<img>` under device-private ownership

**Decision**: An unguessable, randomly-generated `image_id` (never derived
from `session_id`/`thread_id`) plus a short-lived HMAC-signed URL — a new
`GET /api/images/[imageId]` route, no `X-Client-Id` header required, backed
by one new secret env var (`IMAGE_URL_SECRET`), using only Node's built-in
`crypto` module (`createHmac` — zero new dependency).

**Rationale**: `<img src>` genuinely cannot attach `X-Client-Id`, so images
can't reuse the app's normal header-checked ownership model as-is. Two
options were compared, per this option's own framing:

- **(a) Fetch-with-header → blob → object URL.** Works, but for a *list* of
  many rows (the actual use case — `SessionList`), this means one
  authenticated `fetch()` per row, manual object-URL lifecycle management
  (create on load, revoke on unmount, revoke on re-render), and it opts out
  of the browser's native `<img>` lazy-loading/caching/decoding pipeline
  entirely. This is a real complexity and performance cost for exactly the
  screen (many rows) the option's own framing flagged as the thing to weigh
  it against.
- **(b) Unguessable id + signed URL** (chosen). A plain `<img src="/api/images/{imageId}?exp=...&sig=...">`
  works with zero client JS, gets native lazy-loading/caching, and scales to
  any number of rows for free.

**Why signing, not just a bare unguessable id**: this app's existing
security model isn't "unguessable id alone" — a session/checkpoint id is
also effectively unguessable, but reaching its *data* additionally requires
presenting the correct `X-Client-Id`, checked server-side
(`requireOwnedSession`). That's a two-factor-shaped model: knowing an id
isn't sufficient on its own anywhere else in this app. A bare, permanent,
unsigned image id would be a strictly weaker, single-factor model
specific to images only. A signed URL — minted server-side only by code
paths that already did the normal ownership check (`/api/recipe/[sid]/step`,
`/mine`, `/state`, fork/resume) — reintroduces an equivalent of that second
factor: you can't construct a valid URL yourself, only receive one from a
request that already proved ownership. The signature also time-bounds
exposure if a URL is ever captured somewhere unexpected (browser history, a
shared screenshot, a referer header) — a bare permanent id has no such
bound. A generous expiry (recommended: 24 hours) keeps this invisible to
normal use (nobody's session list is open continuously for a full day)
while still being meaningfully bounded.

**No session id in any URL**: `imageId` is a random, opaque identifier from
its own id-space, unrelated to `session_id`/`thread_id`/`checkpoint_id`; the
signed URL is `/api/images/{imageId}?exp={unixSeconds}&sig={hex}` — nothing
about it reveals or requires a session id (satisfies FR-014/SC-006 directly).

**New env var**: `IMAGE_URL_SECRET` — a purely app-level secret, the same
category as the already-existing `CRON_SECRET` (a bearer-style secret
checked by a route, not part of the constitution's fixed-stack list). Adding
it is configuration, not a new dependency, and needs no constitution
amendment.

## R5. Storage size and format

**Not empirically confirmed** (same limitation as R2 — no live call made).
Recorded here as documented estimates, to be corrected against the R2 spike's
real output:

- A single PNG dish photo from a modern image-generation model is commonly
  in the 0.5–2 MB range at typical "social post" resolutions (roughly
  1024×1024 or a similar photographic aspect ratio); JPEG at reasonable
  quality is usually 3–8x smaller for photographic (non-flat-color) content
  than PNG for the same dimensions.
- **Recommendation**: request JPEG output where the model/provider allows
  requesting an `output_format`/similar parameter (per OpenRouter's Image API
  docs, `output_format` is a real parameter on the dedicated endpoint — worth
  checking whether the same or an equivalent knob exists on the
  chat-completions path during the R2 spike). If the model only returns PNG
  regardless, store PNG as given — no image-processing library is being
  added (Hard Constraint: no `sharp`) to re-encode it, so the format is
  whatever the model hands back, unmodified.
- **Storage impact at current caps**: `DAILY_STAGES_GLOBAL` defaults to
  `2000`. Worst case (every stage were a `finalize` producing an image, which
  it structurally can't be — `finalize` is one specific stage among seven),
  2000 × ~1.5 MB ≈ 3 GB/day if every single one succeeded. Realistically,
  `finalize` is a small fraction of total stage calls (one node's-worth out
  of seven, and only reached once per completed run, not per stage-step).
  Neon's storage is billed and expandable, not hard-capped in a way that
  would silently fail a write — this is a cost/monitoring consideration for
  the operator, not a correctness blocker, and doesn't require a schema
  change to address (a future `DAILY_IMAGE_BYTES` cap could be added the same
  way other caps already work, if it becomes a real problem — out of scope
  to pre-build here).

## R6. "Regenerate just the photo" — added post-deploy, from real usage

**Not in the original spec** — this section documents a capability added
after feature 007 shipped, in direct response to production testing: with a
slow `MODEL_DEFAULT`, every "regenerate" retried the *whole* `finalize`
stage (text and image together, per FR-010's original framing), so the slow
text call ran again on every attempt and routinely left little or no budget
for the image call it was supposed to be getting a new image for. The user
asked, directly, for a control that only touches the photo.

**Decision**: `FinalRecipeView`'s old always-visible "Regenerate" button
(full recipe + photo) is removed entirely, replaced with a "Generate photo"
button shown **only** when there's genuinely no photo yet (`!dishImageUrl`).
Clicking it sends `mode: "retry-image"` to `/step`, which:

1. Requires the client to send back the branch's own current `finalRecipe`
   (validated server-side against `FinalRecipeSchema` — Principle II; the
   client already has this in memory, it's what's on screen).
2. Threads it through **`config.configurable.reuseFinalRecipe`** — not as
   `graph.invoke()`'s input. That was the first design tried and it doesn't
   work: passing a non-null value as `invoke()`'s input makes LangGraph
   start a fresh run from `START`, regardless of `checkpoint_id` — confirmed
   the hard way (it re-ran `parseIngredients`, not `finalize`, and the fake
   model's fixture correctly failed since nothing had queued a response for
   that node in this scenario). `configurable` is the channel
   `requestStartedAt`/`thread_id` already use to reach a node without
   disturbing invoke semantics or touching checkpointed state, and it works
   for this too.
3. `finalize.ts` checks `config.configurable.reuseFinalRecipe` first — if
   present, it skips the text call entirely and reuses that recipe verbatim,
   going straight to the image call with (since no text call ran) almost the
   *entire* remaining budget, not whatever a slow text model left over.

**Why this doesn't hit the retry-of-a-branched-checkpoint data-loss bug**:
this is still a plain `graph.invoke(null, config)` — the exact call shape
research already confirmed safe for retry-on-an-already-childed-checkpoint.
Nothing here uses `updateState()` on critique's checkpoint (which already
has multiple `finalize` children from prior retries) — the forbidden
pattern the constitution warns about is specifically `updateState` creating
a second child there, not `invoke`.

**Mode naming**: `"retry"` keeps its original, pre-feature-007 meaning
(redo a *failed* stage — unrelated to images). The bypass of `/step`'s
`already-advanced` guard for "an already-*succeeded* `finalize` can get
another sibling checkpoint" is now keyed specifically to `mode:
"retry-image"`, not `"retry"` — keeping the two modes' semantics from
blurring into each other as more feature work touches this route.

**What this changes about FR-010's original framing**: FR-010 said
"Retrying the finalize stage MUST generate a new image for that attempt,"
written when the only way to retry finalize was the full text+image
re-run. The server-side capability to fully re-run finalize (`mode:
"retry"` targeting a checkpoint whose `next` is `"finalize"`) was
intentionally *removed* along with the old button, once the narrower
image-only path made it redundant for what users actually wanted — there is
now no UI path to regenerate the recipe text alone on an already-finalized
branch (only a brand-new session, or editing an earlier stage and forking,
produce a different recipe).

## R7. Markdown-fenced crop JSON — added post-deploy, from real usage

**What was observed**: with `MODEL_IMAGE=google/gemini-2.5-flash-image` in
production, the image call's accompanying text block reliably came back
wrapped in a markdown code fence — ` ```json\n{"focalX": 0.5, ...}\n``` ` —
even though `dishImagePrompt` never asks for one. The direct
`JSON.parse(textBlock.text)` call this node had always used threw
`SyntaxError: Unexpected token '`', "```json`... is not valid JSON` on the
leading backtick. Per R2/R3, any crop-parse failure is already treated as an
image failure (`dishImage: null`, `outcome: "finalized"` — never a rejected
promise), so this never actually broke a user-visible run; it just meant
every real attempt at generating a photo with this model silently failed.

**Root cause**: this is a generic LLM habit, not specific to this model or
prompt — chat models frequently wrap JSON output in a fenced code block when
producing it alongside other content, independent of whether the prompt
says "reply with JSON" or asks for a fence one way or the other.

**Fix**: `finalize.ts` now runs `stripMarkdownCodeFence()` on the crop text
before `JSON.parse`. It matches an optional ` ```json ` or plain ` ``` `
fence wrapping the whole trimmed string and returns just the inner content;
text that isn't fenced passes through unchanged, so a model that already
emits plain JSON is unaffected. The crop-parse `catch` block also now logs
the raw (untruncated-to-300-chars) text on failure — previously a parse
failure was indistinguishable from any other crop-shape problem in the
logs, which is what made this take a second production report to diagnose
correctly instead of one.

**Test coverage**: `tests/unit/finalize.test.ts` adds two scenarios to the
mocked image call: `"markdown-fenced-json"` (fenced crop JSON plus a valid
image block — asserts `dishImage` is produced with the correct
`focalX`/`focalY`/`zoom`) and `"markdown-fenced-json-no-image"` (fenced crop
text with no image block at all, `response.content` not even an array —
asserts graceful `dishImage: null`, matching every other image-failure
mode).
