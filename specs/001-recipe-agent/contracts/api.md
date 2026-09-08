# API Contracts: Recipe Agent

All routes are Next.js App Router Route Handlers under `app/api/`.
Every handler: `export const runtime = "nodejs"`, `export const maxDuration = 60`
(constitution Principle III).

## Common

**`:tid` is an XHR path segment, never a page URL.** These endpoints are called
only by the app's own `fetch` code; no browser page URL contains a session
identifier (spec FR-003a/FR-003b). A `:tid` on its own is not a credential —
every request is still gated by the header below and an ownership check.

**Auth**: every request MUST send `X-Client-Id: <clientId>` (spec FR-003/FR-068).
Missing/blank → `401 { error: "missing-client-id" }`.

**Ownership**: for any `:tid` route, the `sessions.client_id` MUST equal the
header. Mismatch or unknown thread → `404 { error: "not-found" }` (spec FR-033,
FR-067 — a mismatch is a 404, never a 403).

**Limit rejections** (spec FR-061–FR-066, FR-077) → `429`:
```
{ error: "rate-limited" | "daily-cap" | "global-cap" | "provider-cap" | "session-cap",
  message: string, retryAfterSeconds?: number }
```
No checkpoint is written for a `429`.

**Stage failure** (spec FR-050) → `200` with a `stage-failure` timeline entry in
the body (not an HTTP error), so the client can render it in the tree.

**Error envelope** for everything else: `{ error: string, message: string }`.

Shared types: `State`, `TimelineEntry`, `Ingredient`, `Constraints`, … from
[data-model.md](../data-model.md).

---

## POST `/api/recipe/start`

Create a session and run the first stage (`parseIngredients`).

**Request**
```jsonc
{
  "ingredients": ["2 eggs", "spinach", "..."],   // required, 1..MAX_INGREDIENTS
  "constraints": {                               // optional
    "cuisine": "italian", "maxMinutes": 30, "servings": 2, "diets": ["vegetarian"]
  }
}
```

**Responses**
- `200`
  ```jsonc
  {
    "threadId": "…",
    "checkpointId": "…",
    "state": { /* State after parseIngredients */ },
    "next": ["proposeDirections"] | ["ingredientError"],
    "timeline": [ /* TimelineEntry[] newest-first */ ]
  }
  ```
- `400 { error: "no-ingredients" | "too-many-ingredients", message, max? }` (spec FR-039/FR-040, SC-013)
- `401`, `429`

**Effects**: inserts `sessions` row (owner = header), one `usage_events`
(`kind:"start"`), runs one super-step.

---

## POST `/api/recipe/:tid/step`

Advance one stage from a checkpoint. Also used for **retry** (same shape, pointing
at a `stage-failure` entry's parent) and **Play from here**.

**Request**
```jsonc
{
  "fromCheckpointId": "…",        // required; the tip (or a past checkpoint) to resume from
  "mode": "step" | "retry"        // default "step"
}
```
Client passes `AbortController.signal` on the fetch; aborting cancels the stage
(spec FR-072).

**Responses**
- `200`
  ```jsonc
  {
    "checkpointId": "…",
    "state": { /* new State */ },
    "next": ["…"] | [],            // [] ⇒ terminal (finalized / ingredient-error)
    "kind": "normal" | "finalized" | "ingredient-error" | "stage-failure",
    "timeline": [ /* refreshed */ ]
  }
  ```
- `202 { pendingSave: true, state, computedCheckpointHint }` — result produced,
  persistence failed after retries; client holds it (spec FR-080–FR-082).
- `409 { error: "already-advanced", message }` — `fromCheckpointId` already has an
  automatic-advance child (best-effort server backstop; primary guard is the
  client lock, spec FR-059).
- `499`-style: if the request is aborted, the handler returns nothing usable;
  client treats an aborted fetch as "cancelled", shows the pre-stage tip (spec
  FR-072–FR-074).
- `401`, `404`, `429`

**Effects on `200`**: `sessions.stage_count++`, `last_activity = now()`,
`status → 'capped'` if at the cap; one `usage_events` (`kind:"stage"`).

---

## POST `/api/recipe/:tid/step/commit`

Persist a stage result the client is holding after a `202` (spec FR-080).

**Request** `{ "heldState": State, "fromCheckpointId": "…" }`
**Responses**: `200 { checkpointId, timeline }` | `202 { pendingSave: true }` (still failing) | `401` | `404`
**Effects**: `graph.updateState` to write the checkpoint; **does not** re-invoke
the node and **does not** add a `usage_events` row (spec FR-082).

---

## POST `/api/recipe/:tid/fork`

Edit fields at a checkpoint and branch (spec FR-026, FR-044).

**Request**
```jsonc
{ "checkpointId": "…", "patch": { "ingredients": [ /* … */ ] } }
```

**Responses**
- `200 { checkpointId, state, replayFromStage, timeline }`
  — `replayFromStage` = earliest `FIELD_CONSUMERS` stage for the changed fields;
  the next `/step` re-runs it.
- `400 { error: "invalid-edit", field, message }` (spec FR-024, SC-009)
- `400 { error: "too-many-ingredients", max }` (spec FR-044a)
- `409 { error: "session-capped" }` (spec FR-077 — no forking when capped)
- `401`, `404`

**Effects**: `graph.updateState(sourceConfig, patch, asNode)`. No `usage_events`
(a fork runs no stage).

---

## GET `/api/recipe/:tid/history`

**Response** `200 { timeline: TimelineEntry[] }` — newest-first, flat; client
builds the tree via `lib/tree.ts` (spec FR-017–FR-019).
`401`, `404`. Bumps `last_activity`.

---

## GET `/api/recipe/:tid/state?checkpointId=…`

**Response** `200 { checkpointId, state, next, kind }` — exact snapshot (spec
FR-021, SC-004). `400 { error: "unknown-checkpoint" }`, `401`, `404`.

---

## POST `/api/recipe/:tid/delete`

**Response** `200 { deleted: true }` — removes `sessions` row + all checkpoints
for the thread (spec FR-055, SC-018). Idempotent (`200` even if already gone).
`401`, `404` (not owner).

---

## GET `/api/recipe/mine`

**Response** `200 { sessions: [{ threadId, title, lastActivity, status }] }` —
sessions owned by `X-Client-Id`, newest-first. Used to rebuild the on-device list
(spec FR-032). Never returns another owner's sessions (spec FR-060). `401`.

---

## GET `/api/cron/purge`

Guarded by `Authorization: Bearer $CRON_SECRET` (Vercel Cron). Deletes
`sessions` with `last_activity < now() - $SESSION_PURGE_DAYS` and their
checkpoints (spec FR-057). `200 { purged: n }`. `401` without the secret.

---

## Route → requirement map

| Route | Primary spec refs |
|---|---|
| `start` | FR-001, FR-003a, FR-005, FR-011, FR-039, FR-040 |
| `step` | FR-006–FR-010, FR-034–FR-038, FR-050–FR-054, FR-059, FR-072–FR-075, FR-080–FR-083, FR-077 |
| `step/commit` | FR-080–FR-082 |
| `fork` | FR-024, FR-026–FR-029, FR-044, FR-044a |
| `history` | FR-017–FR-019 |
| `state` | FR-020, FR-021 |
| `delete` | FR-055, FR-056, FR-058 |
| `mine` | FR-004, FR-032, FR-060 |
| `cron/purge` | FR-057 |
| all | FR-003, FR-060, FR-067, FR-068, FR-061–FR-066 |
