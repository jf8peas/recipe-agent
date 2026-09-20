# Recipe Agent

Turn a list of ingredients into a finished recipe, one LangGraph stage at a
time — with full time-travel: every stage's output is a checkpoint you can
inspect, edit, and replay from.

Live spec/plan/task docs (the authoritative source for anything not covered
here) live under [specs/](specs/), governed by
[.specify/memory/constitution.md](.specify/memory/constitution.md):

- [specs/001-recipe-agent/](specs/001-recipe-agent/) — the core app: the
  agent graph, time-travel, and everything below in this README.
- [specs/003-direction-selection/](specs/003-direction-selection/) — the
  `selectDirection` stage documented below, closing the gap where
  `draftRecipe` used to always draft from the first proposed direction.
- [specs/004-about-page-redesign/](specs/004-about-page-redesign/) — the
  in-app "About This App" reference page (an architecture walkthrough for
  anyone using the deployed app, reachable from the header). Replaces the
  original five-slide slideshow from spec 002.
- [specs/005-agent-graph-progress/](specs/005-agent-graph-progress/) — the
  running-session view's agent-graph diagram, showing the true graph
  topology and one run's real path instead of a linear step indicator.
- [specs/006-ui-unification/](specs/006-ui-unification/) — a shared header,
  a two-row rebuild of the graph diagram above, stage outputs as tabs
  instead of a stacked column, and a `components/ui/` primitives layer
  used across every screen (including the About page).

This README is a reader's map to the crux of the app — the agent graph — not
a replacement for those.

## Stack

- **Next.js App Router**, deployed on Vercel — one route (`/`), no
  per-session URLs.
- **LangGraph.js** (`@langchain/langgraph`) runs the agent graph inside API
  route handlers; **`PostgresSaver`** (Neon) persists every stage as a
  checkpoint.
- **OpenRouter**, via `@langchain/openai`'s `ChatOpenAI` pointed at
  OpenRouter's endpoint — the only way any node talks to a model
  ([lib/agent/models.ts](lib/agent/models.ts)). No provider SDK is used
  directly.
- **Zod** validates every graph-state channel and every node's output.
- Sessions are **device-private**: an anonymous `clientId` in `localStorage`
  is the only credential (`X-Client-Id` header). Nothing is shareable across
  devices or people.

## Time-travel, in one paragraph

Every stage's output is a LangGraph checkpoint. Stepping through the graph
one stage at a time (or via Auto-run) walks that checkpoint chain forward.
Retrying a failed stage creates a sibling checkpoint in the same chain.
**Forking** — editing a past state and replaying from there — seeds a
*brand-new* LangGraph thread (one thread per branch), replaying the parent
branch's recorded stage outputs up to the fork point before diverging with
the edit. This design exists because of a confirmed data-loss bug in
`@langchain/langgraph-checkpoint-postgres` when branching within a single
thread — see [research.md § R3](specs/001-recipe-agent/research.md) for the
full writeup and [lib/fork-replay.ts](lib/fork-replay.ts) for the
implementation.

## The agent graph

This is the crux of the app: seven real stages plus one terminal error
stage, wired up in [lib/agent/graph.ts](lib/agent/graph.ts). Every node
validates its input and output against a Zod schema
([lib/agent/state.ts](lib/agent/state.ts)); the graph is compiled with
`interruptAfter` on every node, so each API request advances exactly one
stage.

```mermaid
flowchart TD
    START(["start"]) --> parseIngredients

    parseIngredients{{"parseIngredients"}} -->|"any ingredient unusable"| ingredientError[["ingredientError (no model call)"]]
    parseIngredients -->|"all usable"| proposeDirections{{"proposeDirections"}}

    proposeDirections --> selectDirection{{"selectDirection"}}
    selectDirection --> draftRecipe{{"draftRecipe"}}
    draftRecipe --> critique{{"critique"}}

    critique -->|"blocking, under refine limit"| refine{{"refine"}}
    critique -->|"else"| finalize{{"finalize"}}
    refine --> critique

    ingredientError --> END1(["end"])
    finalize --> END2(["end"])

    classDef model fill:#fdf0e8,stroke:#b5502f,color:#241f1a;
    classDef critiqueModel fill:#f4e8e3,stroke:#8a3a20,color:#241f1a;
    classDef terminal fill:#f2ede6,stroke:#6b6156,color:#241f1a;
    class parseIngredients,proposeDirections,selectDirection,draftRecipe,refine,finalize model;
    class critique critiqueModel;
    class ingredientError terminal;
```

| Node | Model | Reads | Writes | Routes to |
|---|---|---|---|---|
| `parseIngredients` | `MODELS.default` | `ingredients` (raw), `constraints` | `ingredients` (classified) | `ingredientError` if any ingredient is unusable, else `proposeDirections` |
| `ingredientError` | — (no model call) | `ingredients` | `outcome: "ingredient-error"` | end |
| `proposeDirections` | `MODELS.default` | `ingredients`, `constraints` | `directions` (2–3) | `selectDirection` |
| `selectDirection` | `MODELS.default` (skipped if only 1 candidate — [spec 003](specs/003-direction-selection/)) | `ingredients`, `constraints`, `directions` | `directionSelection` (chosen index, why, clear-favorite-or-default) | `draftRecipe` |
| `draftRecipe` | `MODELS.default` | `ingredients`, `constraints`, `directions`, `directionSelection` | `recipeDraft` | `critique` |
| `critique` | `MODELS.critique` (stronger model) | `recipeDraft`, `constraints`, `critiques` | `critiques` (appended) | `refine` if the latest critique is blocking and under `MAX_REFINE_CYCLES`, else `finalize` |
| `refine` | `MODELS.default` | `recipeDraft`, latest `critique` | `recipeDraft`, `refineCount++` | `critique` |
| `finalize` | `MODELS.default` | `recipeDraft`, `constraints` | `finalRecipe`, `outcome: "finalized"` | end |

`MODELS.default` / `MODELS.critique` resolve from the `MODEL_DEFAULT` /
`MODEL_CRITIQUE` env vars ([lib/agent/models.ts](lib/agent/models.ts)) — swap
models by changing env vars, never code.

### The prompts

Exact templates from [lib/agent/prompts.ts](lib/agent/prompts.ts), in graph
order. Every one of these is sent through `withStructuredOutput` against a
Zod schema, so the model's reply is always validated shape before it's
trusted (constitution Principle II). A shared `constraintsBlock()` helper
renders cuisine/time/servings/diet constraints identically across all of
them; `"No constraints specified."` when none are set.

#### 1. `parseIngredients`

```
You are a culinary assistant. Classify each raw ingredient line a home
cook typed. For each, decide if it's usable to cook with, normalize its name
and quantity if possible, and flag whether it's a common pantry staple
(salt, oil, water, etc.).

Constraints:
<constraintsBlock>

Raw ingredient lines (one per item, preserve order):
<numbered list of each ingredient's raw text>

For each unusable item, set usable: false and reason to one of:
"not-food" (not an edible ingredient), "unintelligible" (can't tell what it is),
"duplicate" (repeats an earlier line), or "other".
```

#### 2. `proposeDirections`

```
Given these usable ingredients, propose 2-3 distinct dish directions
(different styles/cuisines/techniques) that make good use of them.

Constraints:
<constraintsBlock>

Usable ingredients:
<bulleted list: name (quantity)>

For each direction give a short title, a 1-2 sentence summary, and a brief
note on why it fits the ingredients and constraints.
```

#### 3. `selectDirection`

Skipped entirely (no model call, no prompt) when only one direction exists
to choose from — see [spec 003, research R6](specs/003-direction-selection/research.md).

```
Given these candidate dish directions, judge which one best fits the
available ingredients and constraints, and is the strongest choice to cook.
Report its index (0-based, in the order listed below), a brief explanation
of why, and whether it was a clear favorite or a close call among equivalent
options.

Constraints:
<constraintsBlock>

Usable ingredients:
<bulleted list: name (quantity)>

Candidate directions:
<numbered list: index. title — summary (whyItFits)>

If no candidate is clearly better than the others, that's a valid outcome:
report clearFavorite: false, pick the first-listed candidate (index 0), and
say plainly in the explanation that it was a default pick among equivalent
options — don't invent a confident-sounding reason for it.
```

#### 4. `draftRecipe`

```
Write a full recipe draft for this dish direction, using the
available ingredients.

Constraints:
<constraintsBlock>

Dish direction: <selected direction's title> — <its summary>

Usable ingredients:
<bulleted list: name (quantity)>

Produce a title, a servings count, an ordered list of steps (each with an
estimated time in minutes where sensible, and a technique name if relevant),
and a "toBuy" list of anything needed but not among the ingredients above.
```

#### 5. `critique` (uses `MODELS.critique`)

```
Critique this recipe draft as an experienced chef. Judge whether the
steps are feasible as written, whether the flavors balance, and list anything
missing or unclear. Set blocking: true only if the recipe has a real problem
that must be fixed before it's servable (not just stylistic preference).

Constraints:
<constraintsBlock>

This is critique cycle <priorCritiques.length + 1>.

Recipe draft:
<recipeDraft as JSON>
```

#### 6. `refine`

```
Revise this recipe draft to address the critique below. Keep what
already works; only change what the critique calls out.

Recipe draft:
<recipeDraft as JSON>

Critique to address:
<latest critique as JSON>
```

#### 7. `finalize`

```
Finalize this recipe: scale it to the requested servings (if given),
polish the wording, and produce an approximate nutrition estimate per serving
(calories, protein, carbs, fat). Nutrition figures are estimates, not lab
measurements.

Constraints:
<constraintsBlock>

Recipe draft:
<recipeDraft as JSON>
```

## Local development

```bash
cp .env.example .env   # fill in DATABASE_URL (Neon, pooled) and OPENROUTER_API_KEY
npm install
npm run migrate        # creates LangGraph's checkpoint tables + app tables
npm run dev
```

Other scripts: `npm test` (Vitest, most tests run against a real Postgres
wire protocol via PGlite — no live database needed), `npm run test:e2e`
(Playwright), `npm run lint`, `npm run build`.

See [specs/001-recipe-agent/quickstart.md](specs/001-recipe-agent/quickstart.md)
for the fuller walkthrough — every env var explained, and manual test
scenarios for each limit/failure path.

## Deploy

This is built for Vercel + Neon:

1. Create a Neon Postgres project; grab the **pooled** connection string
   (hostname has `-pooler` in it — required for serverless).
2. Import the repo into a new Vercel project (Next.js is auto-detected).
3. Set every env var from [.env.example](.env.example) in the Vercel
   project's settings — at minimum `DATABASE_URL`, `OPENROUTER_API_KEY`,
   `MODEL_DEFAULT`, `MODEL_CRITIQUE`, `PUBLIC_URL` (your deployed URL),
   `CRON_SECRET` (any random string — Vercel Cron sends it back as
   `Authorization: Bearer $CRON_SECRET`, which `/api/cron/purge` checks).
4. Deploy. The build runs `npm run vercel-build`
   ([package.json](package.json)), which applies `scripts/migrate.ts`
   (idempotent — creates LangGraph's checkpoint tables and the app's own
   tables) before `next build`, so migrations never need a separate manual
   step.
5. `vercel.json` already wires up the daily purge cron
   (`/api/cron/purge`, `SESSION_PURGE_DAYS`-based retention) — nothing else
   to configure.

## In the app

The header's **About This App** button opens a full-scrolling reference page
walking a reader through this same architecture — tech stack,
persistence/time-travel, the repository layout, and the execution flow
above — for anyone using the deployed app who wants the picture without
reading this file. See [specs/004-about-page-redesign/](specs/004-about-page-redesign/)
for its own spec/plan; its content lives in
[lib/about-content.ts](lib/about-content.ts) and needs updating by hand
alongside any future change to the graph (it is static copy, not
introspected live — see that spec's Assumptions).

## Where to look next

**Feature 001 — the core app** (agent graph, time-travel, everything above):

- [specs/001-recipe-agent/spec.md](specs/001-recipe-agent/spec.md) — full
  functional requirements and user stories.
- [specs/001-recipe-agent/data-model.md](specs/001-recipe-agent/data-model.md)
  — every graph-state channel and app database table.
- [specs/001-recipe-agent/contracts/api.md](specs/001-recipe-agent/contracts/api.md)
  — the API routes' request/response contracts.
- [specs/001-recipe-agent/research.md](specs/001-recipe-agent/research.md) —
  the design decisions behind the trickier parts (time-travel, rate limits,
  cancellation, save-failure recovery).
- [specs/001-recipe-agent/tasks.md](specs/001-recipe-agent/tasks.md) — task
  history for the core app.

**Feature 003 — the `selectDirection` stage**:

- [specs/003-direction-selection/spec.md](specs/003-direction-selection/spec.md)
  — why `draftRecipe` no longer always drafts from the first proposed
  direction, and the deterministic fallback when no candidate stands out.
- [specs/003-direction-selection/data-model.md](specs/003-direction-selection/data-model.md)
  — the `directionSelection` channel and how the edit/fork field-consumer
  map changed.
- [specs/003-direction-selection/research.md](specs/003-direction-selection/research.md)
  — the full verified list of every other place a graph stage name is
  hard-coded (worth reading before adding a future stage).

**Feature 004 — the "About This App" reference page**:

- [specs/004-about-page-redesign/spec.md](specs/004-about-page-redesign/spec.md)
  — requirements for the in-app architecture walkthrough above, replacing
  spec 002's five-slide model with a single full-scrolling page.
- [specs/004-about-page-redesign/research.md](specs/004-about-page-redesign/research.md)
  — why it's a hand-rolled overlay with no new dependency, and how the
  content/diagrams/topic-nav carry over the app's own established patterns.
