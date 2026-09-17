# Phase 1 Data Model: Direction Selection Stage

An amendment to [specs/001-recipe-agent/data-model.md](../001-recipe-agent/data-model.md)
§ 1 (Graph State) — one new channel, one new node, two edge changes, no new
table (Constitution Principle III: `directionSelection` lives in the existing
checkpoint-serialized `State`, not a new DB table).

---

## 1. Graph State — new channel

| Channel | Type (Zod) | Written by | Editable | Notes |
|---|---|---|---|---|
| `directionSelection` | `DirectionSelection \| null` | `selectDirection` | yes | null until selection runs; consumed by `draftRecipe` (replaces the old `directions[0]` read) |

Plain `Annotation` like every other channel (last-value-wins, no reducer —
constitution Principle IV) — an edit fully replaces it, the same as every
other editable field.

### `directions`' row is amended, not replaced

| Channel | Type (Zod) | Written by | Editable | Notes |
|---|---|---|---|---|
| `directions` | `DishDirection[]` | `proposeDirections` | yes | 2–3 items on generation (unchanged, spec FR-012); an edit is no longer constrained to that range — only `.min(1)` (research R4) — since `selectDirection`, not generation, is what now consumes it |

### New sub-schema

```ts
DirectionSelection {
  selectedIndex: number   // int, >= 0 — indexes into state.directions
  explanation: string     // brief, plain-language; honest about a fallback pick (spec FR-005)
  clearFavorite: boolean  // true: a candidate was clearly favored. false: default pick among equivalents (spec FR-004; mirrors Critique.blocking)
}
```

---

## 2. Graph edges — before / after

**Before** (feature 001):
```
proposeDirections --(unconditional)--> draftRecipe
```

**After**:
```
proposeDirections --(unconditional)--> selectDirection --(unconditional)--> draftRecipe
```

Both new edges are unconditional `.addEdge` calls — `selectDirection` never
changes *which* node runs next, only what `draftRecipe` reads (research R1).
No new function in `lib/agent/edges.ts`.

`NODE_NAMES` gains `"selectDirection"` (between `"proposeDirections"` and
`"draftRecipe"`, matching the graph's real order) — it is picked up by
`interruptAfter: [...NODE_NAMES]` automatically (`lib/agent/runtime.ts`),
giving the new node its own step boundary for free (constitution Principle V;
spec FR-006). No change to `runtime.ts` itself.

---

## 3. Edit/fork field-consumer map (`lib/field-consumers.ts`) — amended

| Field | Old consumer | New consumer | Why |
|---|---|---|---|
| `directions` | `draftRecipe` | `selectDirection` | Selection, not drafting, is what now consumes the candidates — editing them must re-enter there (spec FR-010) |
| `directionSelection` | *(new field)* | `draftRecipe` | Editing a completed selection re-enters at drafting, without re-running the automatic judgment (spec FR-009) |

`STAGE_ORDER` gains `"selectDirection"` between `"proposeDirections"` and
`"draftRecipe"` (used by `earliestReplayStage` when an edit touches more than
one field at once — unchanged logic, one more entry in the list).

`FIELD_SCHEMAS` gains `directionSelection: DirectionSelectionSchema`
(non-nullable — an edit always supplies a concrete selection, matching every
other editable field's pattern of validating the full replacement value).
`FIELD_SCHEMAS.directions` gains `.min(1)` (research R4).

---

## 4. Run-history timeline (`lib/tree.ts`, `lib/history.ts`) — amended

`TimelineStage` (the only place the fixed stage names are enumerated for
display purposes) gains `"selectDirection"` between `"proposeDirections"` and
`"draftRecipe"`. **No other change** — `lib/history.ts`'s stage attribution
and `components/BranchTimeline.tsx`'s rendering are both fully generic over
`TimelineStage` already (research R2); a checkpoint whose parent's `next` is
`["selectDirection"]` is labeled and displayed correctly automatically.

`components/StageProgress.tsx`'s own separate `STAGES` constant (research R3)
gains the same entry, in the same position — a genuinely second place this
sequence is enumerated, unrelated to `TimelineStage`.

---

## 5. Feature 002 propagation (`lib/about-content.ts`)

`EXECUTION_STAGES`'s `name` field is typed `TimelineStage` (feature 002,
`lib/about-content.ts`), but each element's `name` only needs to be a
*valid* `TimelineStage` — nothing requires every `TimelineStage` to appear
in the array. Omitting `selectDirection` here would compile fine and
silently leave the slideshow's content stale (research R8's correction);
this is a manual task (tasks.md T026), not something the type system
catches. One new array entry, same position.
