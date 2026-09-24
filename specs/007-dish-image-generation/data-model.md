# Data Model: Dish Image Generation & Session Thumbnails

## 1. Graph state addition

One new field on `State` (`lib/agent/state.ts`), one new last-value-wins
`Annotation` entry (`lib/agent/graph.ts`) — no new channel semantics beyond
what every other editable-shaped field already has, except this one is
**deliberately not** added to `FIELD_CONSUMERS`/`FIELD_SCHEMAS`
(`lib/field-consumers.ts`), so it stays non-editable by construction (see
§4).

```ts
// lib/agent/state.ts
export const DishImageSchema = z.object({
  imageId: z.string(),       // opaque, unguessable — the images table's own id, never session_id/thread_id
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  zoom: z.number().min(1).nullable(), // null = no zoom applied (equivalent to 1)
  alt: z.string(),           // "Photo of <recipe title>" (FR-012)
});
export type DishImage = z.infer<typeof DishImageSchema>;
```

```ts
// StateSchema addition
dishImage: DishImageSchema.nullable(),
```

```ts
// INITIAL_STATE addition
dishImage: null,
```

**Why one nullable object, not a separate "status" field**: `null` already
fully captures every "no photo" cause the spec treats identically — never
attempted, failed, timed out, or predates this feature (FR-004, edge cases).
There is no user-visible or code-visible distinction between those cases
that anything needs to branch on, so a separate `status: "ok" | "failed" | ...`
enum would be state nothing reads. `dishImage: DishImage | null` is the
whole model.

**Backward compatibility with pre-feature checkpoints**: confirmed by
reading the codebase that `StateSchema` (the combined object schema) is
**never actually invoked at runtime anywhere** — it exists purely for
`z.infer`-derived typing. Every real read of graph state (`fork-replay.ts`,
`lib/history.ts`, the API routes) does `snapshot.values as State`, a type
cast, not a parse. An old checkpoint's stored JSON simply won't have a
`dishImage` key at all; at runtime that's `undefined`, and every consumer
already needs to treat "no image" as the common case regardless of cause, so
`state.dishImage ?? null` (or plain optional-chaining) at each read site is
sufficient — no backfill migration, no schema-level `.default()` trick
required for correctness (though the schema still declares `.nullable()`
for when the field *is* explicitly present).

**`Annotation.Root` entry** (`lib/agent/graph.ts`, alongside the existing
ones):

```ts
dishImage: Annotation<DishImage | null>(),
```

**Checkpoint-scoping and fork-replay (FR-009a, FR-011) — falls out for
free**: confirmed by reading `lib/fork-replay.ts` — every replayed step calls
`app.updateState(tip, history[i].values, stageName)` with the **entire**
recorded `values` object for that historical checkpoint, not a
field-by-field reconstruction. Whatever `dishImage` value a recorded
`finalize` checkpoint held is replayed verbatim, with zero changes needed to
`fork-replay.ts` itself. This is exactly what makes both of these true
simultaneously without special-casing:

- Browsing to an *earlier* `finalize` checkpoint on a branch that was later
  retried shows *that checkpoint's own* `dishImage` (FR-009a) — because
  `snapshot.values` for that specific checkpoint always held its own value,
  never overwritten by a later retry's sibling checkpoint.
- A fork whose replay range includes a recorded `finalize` output reuses its
  `dishImage` with **no new image call** (FR-011, first half) — because
  replay is a `updateState` copy, not a re-execution of the node.
- A fork whose new branch genuinely re-executes `finalize` (fork point at or
  before it) generates a new `dishImage` the same as any real run (FR-011,
  second half) — because past the replay range, the graph runs for real.

## 2. Node output shape (finalize)

The **LLM's own structured-output schema is unchanged** by this feature —
`z.object({ finalRecipe: FinalRecipeSchema })`, exactly as today. `dishImage`
is never something the text-generation call produces or is asked about; it's
assembled by the node function itself from the *separate* image call's
result (R1/R2), then validated on its own:

```ts
// lib/agent/nodes/finalize.ts — shape, not final code
const textResult = await textModel.invoke(finalizePrompt(...), config);          // unchanged
const { finalRecipe } = OutputSchema.parse(textResult);

let dishImage: DishImage | null = null;
try {
  const imageResult = await runImageCall(finalRecipe, config);                    // R1–R3
  dishImage = DishImageSchema.parse(imageResult);                                 // Principle II boundary
} catch {
  dishImage = null; // any failure — network, timeout, invalid crop JSON — is uniform (FR-003/004)
}

return { finalRecipe, dishImage, outcome: "finalized" };
```

`runImageCall` is the one place that does the DB side effect (§3) — it needs
`config?.configurable?.thread_id` (already how every node accesses its own
thread id) to know which branch the image row belongs to, and derives
`session_id` by looking the thread up in `branches` (the same relationship
`getBranchesForSession` already reads elsewhere).

## 3. Persistence — `images` table (migration `0004_dish_images.sql`)

```sql
CREATE TABLE IF NOT EXISTS images (
  id          bigserial PRIMARY KEY,      -- internal ordinal, used only for deterministic "most recent" tie-breaks
  image_id    text UNIQUE NOT NULL,       -- opaque, unguessable, external-facing (URLs, State.dishImage.imageId)
  thread_id   text NOT NULL REFERENCES branches(thread_id) ON DELETE CASCADE,
  bytes       bytea NOT NULL,
  mime        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS images_thread_id_idx ON images (thread_id);

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS thumbnail_image_id text NULL REFERENCES images(image_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_focal_x   real NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_focal_y   real NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_zoom      real NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_alt       text NULL;
```

**Why a `bigserial` id in addition to the opaque `image_id`**: `id` is never
exposed externally — it exists purely to give "which image is newer"
(FR-009, and the near-simultaneous-finalize edge case) a fully deterministic
answer that doesn't depend on `timestamptz` precision or clock behavior.
`usage_events` already uses exactly this `bigserial`-PK-plus-natural-key
shape for the same reason.

**Deletion and purge (FR-015/016) — falls out of the existing cascade,
verified against the real routes, zero code changes needed**:

- `images.thread_id → branches(thread_id) ON DELETE CASCADE`
- `branches.session_id → sessions(session_id) ON DELETE CASCADE` (already
  existed, migration `0003_branches.sql`)
- Both `app/api/recipe/[sid]/delete/route.ts` and `app/api/cron/purge/route.ts`
  already end in a plain `DELETE FROM sessions WHERE session_id = $1`
  (`deleteSession()`, `lib/db/sessions.ts`) after deleting each branch's
  LangGraph checkpoints. That one statement's cascade now also removes every
  image row belonging to any of that session's branches. `sessions.thumbnail_image_id`'s
  own `ON DELETE SET NULL` (rather than `CASCADE`) exists only for the
  unrelated case of an image row disappearing while its session survives —
  moot for the delete/purge flow itself, since the session row is removed in
  the same statement.

**Orphan tolerance**: if `finalize`'s image-row insert succeeds but the
LangGraph checkpoint write that should reference it never completes (a crash,
an aborted request after the node returned but before the checkpoint
persisted), the row is a harmless orphan — unreachable (nothing's
`dishImage.imageId` points to it, and the signed-URL scheme (R4) never hands
out a URL for an id nobody's state holds), and it's cleaned up automatically
whenever that branch's session is eventually deleted or purged, via the same
cascade above. No separate sweep job is introduced for this — the failure
mode is wasted storage only, not a correctness or security issue, and is
self-resolving on the existing timeline (90-day purge, at worst).

## 4. Non-editability (verified, not just asserted)

`lib/field-consumers.ts`'s `FIELD_CONSUMERS`/`FIELD_SCHEMAS`/`EDITABLE_FIELDS`
are an explicit allow-list (`as const satisfies Partial<Record<keyof State, string>>`).
`dishImage` is simply never added to it. Every consumer of that allow-list —
the `/fork` route's patch validation, `RunTabs`'s per-tab field editors, the
"Edit this stage" mechanism — iterates the allow-list itself, not `State`'s
full key set, so a field absent from it is unreachable by any edit/fork UI
by construction. `lib/graph-progress.ts` was checked and doesn't reference
any specific state field at all (it works purely off outcomes/`next`/critique
counts), so it needs zero changes.

## 5. Session list denormalization (FR-009)

`sessions.thumbnail_*` columns are the session's **current** thumbnail —
updated, not recomputed per request, whenever a `finalize` attempt (real
execution *or* replay-into-a-new-branch via fork) produces a state whose
`outcome` is `"finalized"`:

```ts
// lib/db/sessions.ts — new function, alongside updateSessionTitle
export async function updateSessionThumbnail(
  sessionId: string,
  image: DishImage,
  pool: Pool = getPool(),
): Promise<void> {
  await pool.query(
    `UPDATE sessions s
     SET thumbnail_image_id = $2, thumbnail_focal_x = $3, thumbnail_focal_y = $4,
         thumbnail_zoom = $5, thumbnail_alt = $6
     FROM images new_img
     WHERE s.session_id = $1
       AND new_img.image_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM images cur_img
         WHERE cur_img.image_id = s.thumbnail_image_id
           AND cur_img.id >= new_img.id
       )`,
    [sessionId, image.imageId, image.focalX, image.focalY, image.zoom, image.alt],
  );
}
```

**Corrected during `/speckit-implement` (T017's contract test caught it)**:
the first draft of this statement expressed "is there already a newer
thumbnail" as `FROM images new_img LEFT JOIN images cur_img ON
cur_img.image_id = s.thumbnail_image_id`, with the guard in `WHERE`. Real
Postgres rejects that: a `LEFT JOIN ... ON` inside an `UPDATE ... FROM`
cannot reference the update target (`s`) in its `ON` clause
("invalid reference to FROM-clause entry for table \"s\"") — this is a
genuine SQL restriction, not a pglite quirk, caught by
`tests/contract/step.test.ts` driving a real `finalize` through pglite. The
`NOT EXISTS` form above is the standard rewrite: a correlated subquery's own
`WHERE` can reference the outer UPDATE target freely, and "no existing
thumbnail whose `images.id` is already >= the new one's" is exactly
equivalent to the original "`cur_img.id IS NULL OR new_img.id >
cur_img.id`".

This guard is what makes "most recently finalized branch wins" (FR-009)
atomic and race-safe in one statement, using the `images.id` ordinal (§3)
rather than a read-then-write from application code. If `dishImage` is
`null` (image generation failed for this attempt), this function is simply
not called — the session's thumbnail is left exactly as it was (an earlier
successful finalize's image, if any, keeps showing; FR-004/FR-008 already
guarantee a placeholder shows wherever there's truly never been one).

**Call sites** (both mirror the existing `updateSessionTitle` call
immediately after a successful `finalize` result — no new route, no new
condition beyond "did this attempt produce an image"):

- `app/api/recipe/[sid]/step/route.ts` — after a successful step *or* retry
  whose completed stage was `finalize` and whose resulting `state.dishImage`
  is non-null.
- `app/api/recipe/[sid]/fork/route.ts` — after `forkReplay()` returns, if
  `replay.state.outcome === "finalized"` and `replay.state.dishImage` is
  non-null (covers both a replayed reuse and a genuine re-execution past the
  fork point, exactly like the existing `bestAvailableTitle(replay.state)`
  call right above it already does for the title, for the same reason: a
  fork's patch can jump straight past several stages in one call).

## 6. `/mine` response and the on-device list

`GET /api/recipe/mine` (`app/api/recipe/mine/route.ts`) adds the
denormalized columns to its existing per-session mapping:

```ts
sessions: rows.map((row) => ({
  sessionId: row.session_id,
  title: row.title,
  lastActivity: row.last_activity.toISOString(),
  status: row.status,
  thumbnail: row.thumbnail_image_id
    ? { imageId: row.thumbnail_image_id, focalX: row.thumbnail_focal_x!, focalY: row.thumbnail_focal_y!, zoom: row.thumbnail_zoom, alt: row.thumbnail_alt! }
    : null,
})),
```

`hooks/useSessionList.ts`'s `LocalSessionEntry` gains an optional
`thumbnail: DishImage | null` field, populated two ways, matching FR-014's
"works from both sources":

- **On-device path**: `app/page.tsx`'s existing `sessionList.touch(sessionId, title)`
  effect (keyed on `[snapshot?.sessionId, currentTitle]`) gains a third
  argument sourced directly from the live `snapshot.state.dishImage` the
  client already has in memory after `finalize` completes — no extra round
  trip.
- **Server-rebuilt path**: `refreshFromServer()`'s mapping from `/mine`'s
  response carries the new `thumbnail` field straight through, identically
  shaped to the on-device one.

Each thumbnail's actual `<img>` `src` is a **signed URL** (R4). The signature
is computed **inline, server-side**, at the moment any response includes a
`dishImage`/`thumbnail` object — `/step`, `/fork`, `/state`, and `/mine` each
attach a ready-to-use `url` field (e.g. `/api/images/{imageId}?exp=...&sig=...`)
directly in their JSON, using a shared `signImageUrl(imageId)` helper. The
client never computes or requests a signature itself — it just reads `url`
off whatever object it already received and drops it straight into an
`<img src>`. See [contracts/image-route.md](contracts/image-route.md) for
the exact signing/verification mechanism.
