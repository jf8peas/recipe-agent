# Feature Specification: Dish Image Generation & Session Thumbnails

**Feature Directory**: `specs/007-dish-image-generation`
**Created**: 2026-09-24
**Status**: Draft
**Input**: User description: "Feature 007: Dish image generation in the finalize stage, with a cropped thumbnail on the session list.

WHAT
When the agent reaches its final stage (the existing `finalize` node), it should also generate a photo-realistic image of the finished dish, along with the final recipe it already produces. The full image appears on the final recipe tab. The session list on the main page (the "older recipes" list, `SessionList` / `ListRow`) shows a thumbnail for each session that has a finalized recipe. The thumbnail is a crop of that same image, framed on the most appetising part of the dish (for example, the glossy sear on the protein or the garnish at the centre of the bowl, not the edge of the plate or the empty table). The thumbnail is not a separate generated image, and it is not a blind centre crop.

WHY
Past sessions are currently a list of text titles and dates, which makes them hard to scan and gives no sense of the dish. An image makes the final result feel finished and makes the list easy to browse.

HARD CONSTRAINTS (non-negotiable)
1. No new graph node. Image generation (and choosing the crop) happens inside the existing `finalize` stage. `NODE_NAMES`, the graph edges, the agent-graph progress diagram, the stage tabs and the About page's description and diagrams of the graph MUST stay unchanged. From the user's point of view, finalize still happens in one step.
2. Image generation uses a different model from text generation. Add a new model key (for example `MODELS.image`, backed by a `MODEL_IMAGE` env var with a fallback ID) in `lib/agent/models.ts`, per the constitution's model-routing rule. It still goes through OpenRouter; no provider SDKs. Document which key the finalize node now uses for each call and why.
3. Every image-related field added to graph state has a Zod schema and is validated at the node boundary (Principle II). Large binary image data MUST NOT be stored inline in graph state or checkpoints. State holds a reference plus the crop metadata.
4. The finalize step must still fit within the existing 60s function limit and the per-stage timeout.

BEHAVIOUR
- If image generation fails or times out, the recipe is still finalized and shown. The dish just has no image, and the final tab and the list show a neutral placeholder. An image failure alone must never turn into a stage failure or lose the recipe text.
- Retry on the finalize stage produces a new image. A fork that replays a branch's recorded outputs reuses the existing image and does not regenerate it or incur the cost again.
- A session with several branches shows the image from its most recently finalized branch. A session with no finalized branch shows the placeholder.
- The crop is chosen once, when the image is generated, and stored with it (for example as a focal point or crop rectangle within the full image). It is reproducible and is not recomputed on every page view.
- The thumbnail must work in both the localStorage-backed list and the list rebuilt from `GET /api/recipe/mine`, and must keep the device-private ownership rules: no session or image URL that another device could guess or use to reach someone else's session.
- Deleting a session and the 90-day purge cron also delete that session's images.
- Every image has meaningful alt text derived from the recipe title.
- The thumbnail must fit the existing `ListRow` layout and design tokens at phone width, with no layout shift while it loads.
- The e2e fake-model mode (`RECIPE_AGENT_FAKE_MODEL=1`) returns a deterministic fixture image and crop, so the tests never call a real image model.
- An image call counts as part of the finalize stage for the rate limits and daily caps, not as an extra stage.

OUT OF SCOPE
User-uploaded photos, regenerating the image without re-running finalize, editing the crop by hand, image styles or variants, and sharing images.

OPEN QUESTIONS for clarify/plan to resolve
- Where images are stored. Neon (fixed by the constitution) vs an object store such as Vercel Blob, which would be a new dependency and needs a constitution amendment.
- How the "most desirable region" is determined: the image model returns it, or a separate vision-capable call inside finalize picks it. Either way, no new node.
- Whether the crop is applied at display time (CSS object-position on the full image) or baked into a stored thumbnail file."

## Clarifications

### Session 2026-09-24

- Q: Should `finalize` generate the recipe text and the dish image sequentially or concurrently? → A: Sequentially — the recipe text is generated first and fully completed, then the image is attempted with whatever time budget remains; a slow or failed image call can never affect the already-produced text.
- Q: Where does the full image live — a new object store, or the existing Postgres database? → A: Neon Postgres, in a new table (binary column) — stays within the fixed stack, no new dependency, no constitution amendment. Images are served back through an existing-style API route, not a CDN.
- Q: Does the image-generation call itself return the crop's focal point, or does a separate vision call inside `finalize` determine it afterward? → A: A single call — the image-generation call returns both the photo and the focal point/crop together, in one response. No third model call is added to the stage.
- Q: When browsing back to an earlier `finalize` checkpoint on a branch that was later retried, does the final tab show that checkpoint's own recorded image, or always the branch's newest one? → A: Checkpoint-scoped — it shows that specific checkpoint's own recorded image, consistent with how every other editable field already behaves when browsing history.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a photo of the finished dish (Priority: P1)

Someone who has just finalized a recipe sees a photo-realistic picture of the dish alongside the recipe text, on the same final-recipe tab they already land on today — without any extra step, wait screen, or button.

**Why this priority**: This is the core deliverable. Nothing else in this feature (thumbnails, retries, cropping) has value without a real image existing at the end of a run. It also fully exercises the highest-risk part of the feature: adding a second model call inside an existing stage without changing that stage's shape from the user's point of view.

**Independent Test**: Run a session all the way to a finalized recipe and confirm a dish photo appears on the final tab, the recipe text/steps/nutrition are exactly as complete as before this feature, and the agent-graph diagram and stage tabs still show exactly one `finalize` stage — no new node, no new tab, no extra pause.

**Acceptance Scenarios**:

1. **Given** a recipe has just been finalized, **When** the user views the final recipe tab, **Then** a photo-realistic image of the dish is shown alongside the existing title, ingredients, steps, and nutrition estimate.
2. **Given** the same finalized recipe, **When** the user looks at the running session's progress diagram and stage tabs, **Then** they see the same single `finalize` stage as before this feature — no additional node, edge, or tab has appeared.
3. **Given** a finalized recipe's image, **When** the image is rendered anywhere in the app, **Then** it has descriptive alt text built from the dish's title (e.g. "Photo of Spinach Frittata").

---

### User Story 2 - Recognize past dishes at a glance in the session list (Priority: P1)

Someone with several past sessions opens the app and sees a thumbnail image next to each session that reached a finalized recipe, instead of only a title and a date, so they can recognize and pick out a past dish visually rather than by reading every row.

**Why this priority**: This is the feature's stated reason for existing (WHY) — it's the payoff the whole feature is built to deliver, and it's independently verifiable against a pre-finalized fixture session without needing to also test image generation itself.

**Independent Test**: Seed or produce one session with a finalized recipe (and its image) and one session with no finalized recipe, open the session list, and confirm the finalized one shows a thumbnail cropped from its dish photo while the other shows the neutral placeholder — with no shift in the row layout as the thumbnail loads.

**Acceptance Scenarios**:

1. **Given** a session that reached a finalized recipe with an image, **When** the session list is shown, **Then** that session's row displays a thumbnail cropped from that same image, framed on a meaningful part of the dish rather than an arbitrary center crop of the plate or table.
2. **Given** a session that never reached a finalized recipe (still in progress, ended in an ingredient error, or a stage failure), **When** the session list is shown, **Then** that session's row shows the same neutral placeholder used for a finalized session whose image failed to generate.
3. **Given** the session list is loading thumbnails, **When** a thumbnail image finishes loading, **Then** the row's layout does not shift — the space for the thumbnail is already reserved before the image arrives.
4. **Given** the on-device session list was cleared or never populated, **When** the list is rebuilt from the server, **Then** thumbnails still appear for every finalized session exactly as they would from the on-device list.

---

### User Story 3 - The recipe never gets lost because of the image (Priority: P1)

Someone finalizing a recipe still gets their complete recipe even when the image never comes back — the image model errors, times out, or returns something unusable — because the recipe and the image are not one all-or-nothing outcome.

**Why this priority**: A second model call inside an existing stage is a new failure mode the app didn't have before. Without this guarantee, adding images could make finalize *less* reliable than it is today, which would be a regression on the app's most important terminal state.

**Independent Test**: Force the image step to fail (or simply omit it) while everything else about finalize succeeds, and confirm the run still ends in a finalized recipe with full text content, and both the final tab and the session list show the neutral placeholder instead of an image — not an error, not a stuck stage, not a missing recipe.

**Acceptance Scenarios**:

1. **Given** the image-generation call fails or times out during finalize, **When** finalize completes, **Then** the run's outcome is still "finalized" with the complete recipe text, exactly as it would be if image generation had never been attempted.
2. **Given** a finalized recipe with no usable image, **When** the user views the final tab or the session list, **Then** they see a clearly neutral placeholder in place of a photo, not a broken image icon or blank space.
3. **Given** an image failure occurred, **When** the user or support staff looks at how the run ended, **Then** nothing about the outcome is recorded as a stage failure — it is a normal, complete "finalized" result.

---

### User Story 4 - The right image follows retries, forks, and branches (Priority: P2)

Someone who retries a finalize, edits an earlier step and forks a new branch, or has several branches on one session, always sees the image that actually matches what really happened on that branch — a retry gets a freshly generated photo, a fork that only replays already-recorded stages reuses the recorded photo for free, and a session with multiple finalized branches shows the photo from whichever branch finished most recently.

**Why this priority**: This preserves the correctness guarantees the rest of the app already has for time-travel (replay is free, retry is real, the tree is navigable) — extending them incorrectly to images would either silently reuse the wrong photo or needlessly regenerate (and re-pay for) one that was already produced.

**Independent Test**: On a already-finalized branch, trigger a Retry and confirm a new image is generated; separately, fork from a checkpoint before finalize whose replay range includes a recorded finalize output and confirm the existing image is reused with no new image call; separately, finalize two branches of one session and confirm the session list shows the more recently finalized branch's image.

**Acceptance Scenarios**:

1. **Given** a finalized branch, **When** the user retries the finalize stage, **Then** a new image is generated for that retry and it replaces the one shown for that branch.
2. **Given** a fork whose replay reuses an already-recorded `finalize` output rather than re-running it, **When** the new branch is created, **Then** it shows that recorded image without a new image-generation call being made.
3. **Given** a fork point at or before `finalize` such that the new branch genuinely re-executes `finalize` rather than replaying a recorded output, **When** that branch finalizes, **Then** a new image is generated for it, the same as any other real run of `finalize`.
4. **Given** a session with two branches that have each been finalized at different times, **When** the session list is shown, **Then** it displays the image from whichever of those branches was finalized most recently.
5. **Given** a branch whose `finalize` stage was retried at least once, **When** the user browses back to view the earlier (pre-retry) `finalize` checkpoint specifically, **Then** the final tab shows that earlier checkpoint's own recorded image, not the branch's newest one.

---

### User Story 5 - Deleted or expired sessions leave no images behind (Priority: P3)

Someone who deletes a session, or whose session ages past the existing retention window, has that session's image(s) removed along with everything else about the session — nothing about their dish photo lingers after the session itself is gone.

**Why this priority**: This is a data-hygiene and privacy guarantee consistent with how the app already treats every other piece of session data; it's lower priority than the feature actually working, but it's a hard requirement of the brief, not a nice-to-have.

**Independent Test**: Delete a session that has a finalized image and confirm no trace of that image remains reachable afterward; separately, run the existing retention purge against a session older than the retention window and confirm its image is removed the same way its other data is.

**Acceptance Scenarios**:

1. **Given** a session with a finalized recipe and image, **When** the user deletes that session, **Then** the image is no longer retrievable by any request, the same as the rest of that session's data.
2. **Given** a session older than the retention window, **When** the scheduled purge runs, **Then** that session's image is removed along with the rest of its purged data.

---

### Edge Cases

- Image generation "succeeds" but returns a result that fails validation (malformed reference, missing or out-of-bounds crop data) — this is treated exactly like an outright failure: placeholder shown, no stage failure, recipe unaffected.
- Two branches of the same session are finalized within the same instant (e.g. right after a fork) — the session list's "most recently finalized" choice must still resolve to exactly one image, deterministically.
- A session is deleted or purged while its image is still being generated — no orphaned image is left behind once the operation settles.
- A session was finalized before this feature existed and has no image at all — it is treated the same as a finalized session whose image failed, not as an error state.
- The generated photo does not perfectly match every detail of the recipe (a known limitation of image generation) — acceptable as long as it plausibly depicts a dish of that general kind; pixel-level accuracy to the recipe's ingredients is not a requirement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST generate a photo-realistic image of the finished dish as part of the existing `finalize` stage, without introducing any additional user-visible stage, node, tab, or pause.
- **FR-001a**: `finalize` MUST generate the recipe text to completion first, and only then attempt the image, using whatever time remains within the stage's existing timeout — never the other way around, and never concurrently — so that the image call cannot affect text that has already been produced.
- **FR-002**: The system MUST display the generated image on the final recipe tab alongside the existing recipe content once `finalize` completes successfully.
- **FR-003**: If image generation fails, times out, or returns an unusable result, the system MUST still complete `finalize` with the full recipe text and mark the outcome "finalized" — an image problem MUST NOT produce a stage failure or withhold the recipe.
- **FR-004**: When no usable image exists for a finalized recipe (generation failed, was never attempted, or predates this feature), the system MUST show a clearly neutral placeholder wherever the image would otherwise appear.
- **FR-005**: The system MUST show a thumbnail on every session-list row whose session has at least one finalized branch, and the neutral placeholder on every other row (in progress, ingredient error, stage failure, or a finalized branch with no usable image).
- **FR-006**: The thumbnail MUST be a crop of the same image shown on the final recipe tab — the system MUST NOT generate a second, separate image for the thumbnail.
- **FR-007**: The crop MUST be framed on a meaningfully chosen focal point of the dish (e.g. the food itself, a garnish, a glossy highlight) and MUST NOT be an unconditional, fixed center-crop of the full image (the acceptance bar for this is SC-003).
- **FR-008**: The crop/focal point MUST be determined once, as part of the same image-generation call that produces the photo (not a separate follow-up call), and stored so that every later view of that image reproduces the same crop without recomputing it.
- **FR-009**: When a session has more than one finalized branch, the session list MUST show the image belonging to whichever branch was finalized most recently.
- **FR-009a**: When a user browses history to view a specific, earlier `finalize` checkpoint on a branch (one that a later Retry has since superseded), the final tab MUST show that checkpoint's own recorded image, not the branch's newest one — consistent with how every other editable field already behaves when viewing historical state.
- **FR-010**: When a finalized recipe has no usable image (FR-004's placeholder case), the user MUST be able to request a new image-generation attempt for that same, unchanged recipe, without re-running the text portion of `finalize`. This control MUST only be offered while there's genuinely no usable image — once a usable image exists, the recipe text and its image are not independently regenerable from the final tab (a materially different recipe requires editing an earlier stage and forking, or starting a new session). **Revised post-launch** (see research.md R6): originally specified as "retrying `finalize` regenerates the whole stage, text and image together"; changed after real usage on a slow `MODEL_DEFAULT` showed that design left the image with whatever budget a slow text call didn't consume, often none.
- **FR-011**: A fork that replays a branch's already-recorded `finalize` output MUST reuse that output's existing image and MUST NOT trigger a new image-generation call. A fork whose new branch genuinely re-executes `finalize` (rather than replaying a recorded output) MUST generate a new image the same as any other real run of `finalize`.
- **FR-012**: Every rendered image (full-size or thumbnail) MUST have alt text describing the dish, derived from the recipe's title.
- **FR-013**: The session-list thumbnail MUST render within the existing row layout and design tokens, including at phone width, and MUST reserve its space so that the row does not shift when the thumbnail image finishes loading.
- **FR-014**: The thumbnail MUST appear correctly whether the session list was built from the on-device (localStorage) list or rebuilt from the server, using only requests the owning device is authorized to make — no session's image is reachable by a request another device could construct or guess.
- **FR-015**: Deleting a session MUST remove that session's image(s) such that they are no longer retrievable.
- **FR-016**: The scheduled retention purge MUST remove a purged session's image(s) along with the rest of its data.
- **FR-017**: An image-generation attempt during `finalize` MUST be counted, for rate-limit and daily-cap purposes, as part of that one `finalize` stage — not as an additional stage or an extra unit of usage.
- **FR-018**: The system MUST support a deterministic, fixture-based image-and-crop result when running in the existing automated test mode, so tests never depend on a real image-generation service.
- **FR-019**: Every new piece of state this feature adds MUST be validated at the point it enters or leaves `finalize`, and MUST NOT hold raw binary image data directly — only a reference to the image plus its crop metadata.
- **FR-020**: This feature MUST NOT change the graph's node list, its edges, the agent-graph progress diagram, the running session's stage tabs, or the About page's description of the graph — a user watching a run MUST see exactly the same one-step `finalize` behavior as before.

### Key Entities

- **Dish Image**: The photo-realistic image produced for one `finalize` attempt on one branch. Key attributes: which branch/checkpoint produced it, a reference usable to retrieve the full image, the chosen crop/focal-point metadata used to derive the thumbnail, and whether generation succeeded or is standing in for a failure (placeholder). Relates to exactly one `finalize` attempt; a branch that has been retried has one Dish Image per attempt, with the most recent one being the one currently shown.
- **Session Thumbnail**: The list-row representation derived from a session's current-best Dish Image (its most recently finalized branch's image) — not a stored artifact distinct from the Dish Image's own crop metadata, but the entity described here for clarity of what the session list actually renders.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of runs that reach the "finalized" outcome show either a dish photo or the neutral placeholder on the final tab — never a broken image, a missing recipe, or a stalled finalize step.
- **SC-002**: An image-generation failure or timeout never reduces a user's chance of receiving their finished recipe text — the finalized-recipe success rate is unaffected by whether the image succeeded.
- **SC-003**: Reviewing a sample of generated thumbnails, at least 90% are judged (by a person comparing thumbnail to full image) to be framed on a recognizable, appetizing part of the dish rather than an empty or incidental area of the photo.
- **SC-004**: Shown only the thumbnails (no titles) for 10 different finalized sessions, a person can correctly match at least 8 of them back to their real dish once titles are revealed — evidence the thumbnails are visually distinctive enough to browse by.
- **SC-005**: The session list's row layout does not visibly shift, at any tested device width, between a thumbnail's placeholder state and its loaded state.
- **SC-006**: No image or thumbnail belonging to one device's session is ever retrievable using only information available to a different device.
- **SC-007**: After a session is deleted, or after it ages past the existing retention window and the scheduled purge runs, no request can retrieve an image for that session.

## Assumptions

- One generated image per `finalize` attempt is sufficient — the feature does not offer multiple candidate photos to choose from.
- A standard photographic aspect ratio for the full image (chosen during planning) is acceptable without further product input; no specific dimensions were mandated by the request.
- Sessions finalized before this feature ships simply have no image and permanently show the neutral placeholder for that branch — there is no retroactive backfill.
- "Framed on the most appetising part" is a best-effort quality bar, not a guarantee that every generated crop will be ideal for every dish photo.
- Two of the three questions the request explicitly flagged as open are resolved above under Clarifications (storage location; focal-point determination). The remaining one is still intentionally left for `/speckit-plan`, since it doesn't change user-facing scope or behavior:
  1. Whether the crop is applied at display time (e.g. CSS `object-position` on the full image) or baked into a separately stored thumbnail artifact — Hard Constraint 3's "state holds a reference plus crop metadata" (not a second stored file) already points toward a display-time approach, but the exact mechanism is a planning detail.

## Dependencies

- The existing `finalize` node and the recipe graph it belongs to (feature 001).
- Continued availability, via OpenRouter, of at least one model capable of image generation, reachable the same way every other node's model is (per the constitution's model-routing rule) — no direct provider SDK.
- Generated images are stored in the existing Neon Postgres database (no new storage dependency, no constitution amendment) and served back through an API route reachable only under the app's existing device-private ownership rules (constitution Principle VI).
- The existing session deletion and 90-day retention purge mechanisms, extended to also cover image data.

## Out of Scope

- Letting a user upload their own photo of the dish.
- Regenerating an image without re-running the `finalize` stage.
- Letting a user manually adjust or override the chosen crop.
- Offering a choice of image styles or multiple image variants.
- Sharing or exporting a dish image outside the app.
