# Quickstart: Recipe Agent

Local setup and the primary flow, for a developer picking this up.

## Prerequisites

- Node 20+
- A Neon Postgres project (free tier) — grab the **pooled** connection string
  (host contains `-pooler`)
- An OpenRouter API key with a spend cap set

## 1. Install & configure

```bash
npm install
cp .env.example .env.local
```

`.env.local`:

```
DATABASE_URL=postgres://…-pooler.…neon.tech/neondb?sslmode=require
OPENROUTER_API_KEY=sk-or-…
MODEL_DEFAULT=openai/gpt-4.1-mini
MODEL_CRITIQUE=anthropic/claude-3.7-sonnet     # a stronger model than default
PUBLIC_URL=http://localhost:3000

MAX_INGREDIENTS=50
MAX_REFINE_CYCLES=2
MAX_STAGES_PER_SESSION=60
STAGE_TIMEOUT_MS=45000
SESSION_PURGE_DAYS=90
RATE_WINDOW_SECONDS=60
RATE_MAX_PER_WINDOW=8
DAILY_STAGES_PER_CLIENT=200
DAILY_STAGES_GLOBAL=2000
CRON_SECRET=dev-secret
```

## 2. Migrate

```bash
npm run migrate      # checkpointer.setup() + app tables (idempotent)
```

Never run migrations from a request handler (constitution Principle III).

## 3. Run

```bash
npm run dev          # http://localhost:3000
```

## 4. Primary flow (matches spec User Story 1)

1. Open the app → a `clientId` is minted into `localStorage`.
2. Enter ingredients (e.g. `2 eggs, spinach, feta, olive oil`), optionally set
   constraints, **Start**.
   - `POST /api/recipe/start` → session created, `parseIngredients` runs, timeline
     shows one entry.
3. **Step** through: `proposeDirections → draftRecipe → critique ⇄ refine →
   finalize`. Each click = `POST /api/recipe/:sid/step` (`:sid` = session id;
   the request body names which branch), one stage.
   - Or toggle **pause between stages** off → the client auto-advances (still one
     request per stage).
4. Click any timeline entry → its state loads in the centre panel.
5. Edit a field (e.g. swap an ingredient) → **Edit & Fork** → new branch. **Play
   from here** re-runs from the affected stage.
6. **Delete** the session from the list when done.

## 5. Try the failure paths

| To see | Do |
|---|---|
| Ingredient error outcome | Start with `["asdfgh", "eggs"]` → `parseIngredients` rejects, branch ends in `ingredient-error`; edit + fork to recover |
| Stage failure + retry | Set `MODEL_DEFAULT` to a bogus id → a stage throws → `stage-failure` entry → **Retry** |
| Cancel | Start a stage, hit **Cancel** while the spinner shows → no checkpoint written |
| Session cap | Set `MAX_STAGES_PER_SESSION=3` → after 3 stages the session goes read-only |
| Rate limit | Set `RATE_MAX_PER_WINDOW=2` → third rapid action gets `429` |
| Two-tab lock | Open the app in two tabs (both restore the same active session from `localStorage`), Step in both → second tab's controls disabled |

## 6. Tests

```bash
npm test             # Vitest: schemas, tree builder, limits, edge functions, graph integration
npm run test:e2e     # Playwright + axe: primary flows, WCAG 2.2 AA
```

## Layout reference

```
Header:  title · author link · feedback link · [pause between stages] toggle
┌───────────────┬───────────────────────────┬─────────────────┐
│ Branch        │  Selected state           │  Actions        │
│ timeline      │  (per-field form controls)│  Step / Play    │
│ (vertical,    │                           │  Play from here │
│  keyboard-    │                           │  Edit & Fork    │
│  navigable)   │                           │  Retry / Cancel │
│               │                           │  Delete         │
└───────────────┴───────────────────────────┴─────────────────┘
```
