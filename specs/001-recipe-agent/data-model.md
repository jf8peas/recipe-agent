# Phase 1 Data Model: Recipe Agent

Two layers:
1. **Graph state** — the LangGraph `State` object, persisted as checkpoints by
   `PostgresSaver` (LangGraph owns these tables).
2. **App tables** — ownership, counters, and the usage ledger we own.

All shapes are Zod schemas in `lib/agent/state.ts` (state) and `lib/db/schema.ts`
(rows). Constitution Principle II: every channel and every node I/O boundary
validates.

---

## 1. Graph State (`State`)

Each channel is a **plain `Annotation`** (last-value-wins, no reducer) so
`updateState` overwrites on edit — constitution Principle IV, spec FR-025.

| Channel | Type (Zod) | Written by | Editable | Notes |
|---|---|---|---|---|
| `ingredients` | `Ingredient[]` | user input, `parseIngredients` | yes | includes per-item classification (spec FR-041) |
| `constraints` | `Constraints` | user input | yes | all fields optional |
| `directions` | `DishDirection[]` | `proposeDirections` | yes | 2–3 items (spec FR-012) |
| `recipeDraft` | `RecipeDraft \| null` | `draftRecipe`, `refine` | yes | null until drafted |
| `critiques` | `Critique[]` | `critique` | yes | appended *by the node reading prev state*, not a reducer |
| `finalRecipe` | `FinalRecipe \| null` | `finalize` | yes | null until finalized |
| `refineCount` | `number` | `refine` (`prev + 1`) | no | drives the loop-exit edge |
| `outcome` | `"in-progress" \| "finalized" \| "ingredient-error" \| "stage-failure"` | nodes + step route | no | default `"in-progress"` (research R4) |
| `failureReason` | `string \| null` | step route on node throw | no | set with `outcome: "stage-failure"` |

> `critiques` grows across refine cycles, but **not** via an append reducer — the
> `critique` node reads `state.critiques` and returns the full new array. This
> keeps it last-value-wins so a user edit replaces it cleanly (Principle IV).

### Sub-schemas

```
Ingredient {
  raw: string                     // as the user typed it
  name: string | null             // normalized; null if not usable
  quantity: string | null
  pantryStaple: boolean
  usable: boolean
  reason: "not-food" | "unintelligible" | "duplicate" | "other" | null
}

Constraints {
  cuisine: string | null
  maxMinutes: number | null       // positive int
  servings: number | null         // positive int
  diets: string[]                 // multi-select + free text
}

DishDirection { title: string; summary: string; whyItFits: string }

RecipeDraft {
  title: string
  servings: number
  steps: { order: number; text: string; minutes: number | null; technique: string | null }[]
  toBuy: string[]
}

Critique {
  cycle: number
  feasibility: string
  flavorBalance: string
  missingOrUnclear: string[]
  blocking: boolean               // false ⇒ edge routes to finalize
}

FinalRecipe extends RecipeDraft {
  scaledServings: number
  nutrition: { calories: number; protein: number; carbs: number; fat: number; note: "approximate" }
}
```

### Node I/O contracts

| Node | Model | Input (read) | Output (validated) | Outgoing edge |
|---|---|---|---|---|
| `parseIngredients` | `MODELS.default` | `ingredients` (raw), `constraints` | `{ ingredients: Ingredient[] }` | `ingredients.some(!usable)` → `ingredientError`, else → `proposeDirections` |
| `ingredientError` | none | `ingredients` | `{ outcome: "ingredient-error" }` | → `END` |
| `proposeDirections` | `MODELS.default` | `ingredients`, `constraints` | `{ directions: DishDirection[] }` (2–3) | → `draftRecipe` |
| `draftRecipe` | `MODELS.default` | `ingredients`, `constraints`, `directions` | `{ recipeDraft: RecipeDraft }` | → `critique` |
| `critique` | `MODELS.critique` | `recipeDraft`, `constraints`, `critiques` | `{ critiques: Critique[] }` (prev + 1) | `blocking && refineCount < MAX` → `refine`, else → `finalize` |
| `refine` | `MODELS.default` | `recipeDraft`, last `critique` | `{ recipeDraft: RecipeDraft, refineCount: n+1 }` | → `critique` |
| `finalize` | `MODELS.default` | `recipeDraft`, `constraints` | `{ finalRecipe: FinalRecipe, outcome: "finalized" }` | → `END` |

`FIELD_CONSUMERS` (research R3): `ingredients→parseIngredients`,
`constraints→proposeDirections`, `directions→draftRecipe`,
`recipeDraft→critique`, `critiques→refine`, `finalRecipe→finalize`.

---

## 2. Checkpoints (LangGraph-owned)

Created by `PostgresSaver.setup()`. Not modified directly. Relevant read paths:

| Concept | Source |
|---|---|
| checkpoint id | `snapshot.config.configurable.checkpoint_id` |
| parent id | `snapshot.parentConfig?.configurable.checkpoint_id` |
| producing stage | keys of `snapshot.metadata.writes` |
| step index | `snapshot.metadata.step` |
| pending next | `snapshot.next` (`[]` ⇒ terminal) |
| created | `snapshot.createdAt` |

**Timeline entry** (`/history` response item), derived:

```
TimelineEntry {
  checkpointId: string
  parentCheckpointId: string | null
  stage: "parseIngredients" | … | "user-edit"
  step: number
  createdAt: string
  kind: "normal" | "in-progress" | "finalized" | "ingredient-error" | "stage-failure"
  isLeaf: boolean
}
```

---

## 3. App tables

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `thread_id` | `text` PK | = LangGraph `thread_id` |
| `client_id` | `text` NOT NULL | owner (spec FR-003a); indexed |
| `title` | `text` | derived from first accepted direction, or ingredient summary; user-renamable (nice-to-have) |
| `created_at` | `timestamptz` | |
| `last_activity` | `timestamptz` | bumped on any read or write (spec FR-057) |
| `stage_count` | `int` NOT NULL default 0 | completed stage executions (spec FR-077) |
| `status` | `text` NOT NULL default `'active'` | `active \| capped` |

Index: `(client_id, last_activity desc)` for `/mine`.
Transitions: `active → capped` when `stage_count >= MAX_STAGES_PER_SESSION`;
deletion removes the row + checkpoints (spec FR-055).

### `usage_events`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint` PK | |
| `client_id` | `text` NOT NULL | indexed |
| `thread_id` | `text` | nullable (start has no thread yet until created) |
| `kind` | `text` | `stage \| start \| rejected-limit` |
| `created_at` | `timestamptz` NOT NULL default now() | indexed |

Limit checks (spec FR-061/FR-062):
- per-client short window: `count(*) where client_id=$1 and kind in ('stage','start') and created_at > now() - $RATE_WINDOW`
- per-client 24 h: same, window 24 h, vs `DAILY_STAGES_PER_CLIENT`
- global 24 h: `count(*) where kind='stage' and created_at > now() - '24h'` vs `DAILY_STAGES_GLOBAL`

### `_app_migrations`

`(id text PK, applied_at timestamptz)` — tracks applied `.sql` files (research R8).

---

## 4. Client-held state (not persisted server-side)

| Key | Where | Purpose |
|---|---|---|
| `recipe-agent.clientId` | `localStorage` | owner credential, `X-Client-Id` header (spec FR-003) |
| `recipe-agent.sessions` | `localStorage` | `[{ threadId, title, lastOpened }]` — on-device list (spec FR-004); rebuildable from `/mine` (spec FR-032) |
| `recipe-agent.currentThreadId` | `localStorage` | the active session; restored on reload since there is no per-session URL (spec FR-003b) |
| `recipe-agent.pauseBetweenStages` | `localStorage` | Step vs Auto-run (spec FR-034), default `true` |
| in-memory only | React state | a held unsaved stage result (spec FR-081) |

No session identifier ever appears in the page URL; navigation between the list
and a session is client-side view switching (spec FR-003a/FR-003b).

---

## 5. Validation rules (from spec)

- Start rejected if `ingredients.length === 0` or `> MAX_INGREDIENTS` (FR-039/FR-040); same check on fork (FR-044a).
- `patch` on fork validated against each changed field's sub-schema; invalid → fork blocked, offending field named (FR-024).
- Editable channels replace, never append (FR-025).
- A fork `patch` may target only the six user-editable Recipe State fields; a
  patch touching an internal channel (`refineCount`, `outcome`, `failureReason`)
  is rejected like an invalid edit (FR-025a).
- `servings`, `maxMinutes` positive integers when present.
- Every node output parsed with its Zod schema before it is committed; parse failure ⇒ stage-failure (FR-050, research R4).
