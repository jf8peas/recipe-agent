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

**Fix**: `finalize.ts` now also gives the text call its own hard deadline,
`TEXT_DEADLINE_MS = MAX_DURATION_MS - SAFETY_MARGIN_MS` (55s) — the same
`AbortSignal.any([config.signal, AbortSignal.timeout(...)])` pattern the
image call already used, applied symmetrically. This doesn't change what a
text-call failure *means* (it's still a real stage failure, unlike an image
failure) — it only guarantees that failure happens with enough time left for
the route's existing stage-failure checkpoint write to actually run, instead
of the whole function being hard-killed by the platform first.

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
