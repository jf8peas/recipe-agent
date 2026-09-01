# Recipe Agent — Build Recommendation

A Vercel webapp that uses LangGraph agents to build a recipe from a list of
ingredients, with **time-travel**: inspect the agent's state history, pick any
checkpoint, edit it, and replay the agents from that point.

---

## 1. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) on Vercel** | One repo, one deploy. Claude Design output drops straight into React components. |
| Agent runtime | **`@langchain/langgraph` (JS) embedded in Route Handlers** | No separate Python service. The graph runs inside Node serverless functions. |
| LLM | **OpenRouter** (OpenAI-compatible API) via `@langchain/openai`'s `ChatOpenAI` — any model; a stronger model for the critic, chosen via a shared model-config module | One integration point, swap models without new deps. |
| Checkpointer | **`@langchain/langgraph-checkpoint-postgres` + Neon Postgres** | This is the whole feature. Durable state history that survives cold starts, with native fork/resume. |
| Structured output | **Zod** schemas on each node | Keeps recipe state editable as forms, not free text. |

Skip auth for v1 — a `threadId` in the URL + `localStorage` is enough. Add
NextAuth later if you want saved recipe books.

---

## 2. Why LangGraph carries the hard part

"Go back, edit a state, replay from there" is LangGraph's **time-travel**
feature almost verbatim:

- Every super-step is written to the checkpointer as a checkpoint with an id and
  a `parentConfig` pointer.
- `graph.getStateHistory(config)` → the full list of checkpoints for a thread
  (newest first).
- `graph.getState({ configurable: { thread_id, checkpoint_id } })` → the exact
  state at any point.
- `graph.updateState(checkpointConfig, patch)` → writes a **new checkpoint
  forked from that point**. This is the "edit a state" operation. It runs your
  channel reducers, so design editable fields as last-value-wins (plain values),
  not append (like `messages`).
- `graph.stream(null, { configurable: { thread_id, checkpoint_id: <the fork> } })`
  → resumes execution from that checkpoint. This is "have the agents play from
  that point."

Forks all live in the **same thread**, linked by parent pointers — so the branch
**tree** is reconstructed client-side from `parentConfig`. That tree is the UI.

---

## 3. Agent graph

```
parseIngredients → proposeDirections → draftRecipe → critique ⇄ refine → finalize
```

- **parseIngredients** – normalize items, quantities, categories; flag pantry staples.
- **proposeDirections** – 2–3 dish directions given ingredients + constraints (cuisine, time, servings, diet).
- **draftRecipe** – full recipe: steps, timings, techniques, what to buy.
- **critique** (`MODELS.critique` — a stronger model) – feasibility, flavor balance, missing steps. Structured verdict.
- **refine** – apply critique. Conditional edge loops critique ⇄ refine up to N times.
- **finalize** – scale, format, rough nutrition.

Set `interruptAfter: ["*"]` (or per-node) so the graph **pauses after every
node**. The client drives it forward one step at a time — which is exactly the
back-and-forth UX, and it sidesteps Vercel function timeouts.

State schema (each a plain channel so it's editable):
`ingredients`, `constraints`, `directions`, `recipeDraft`, `critiques`, `finalRecipe`.

---

## 4. API surface

```
POST /api/recipe/start          → new threadId, run to first interrupt, return state + checkpointId
POST /api/recipe/:tid/step      → resume from a checkpointId, run one node, return new state
GET  /api/recipe/:tid/history   → getStateHistory → checkpoint list (client builds tree)
GET  /api/recipe/:tid/state     → state at ?checkpointId=
POST /api/recipe/:tid/fork      → updateState(checkpointId, patch) → new checkpointId
```

All on the **Node.js runtime** (`export const runtime = "nodejs"`), not Edge —
`pg` needs it. Add `export const maxDuration = 60`. Use Neon's **pooled**
connection string and cache the client/graph in module scope so warm invocations
reuse it. Run `PostgresSaver.setup()` once via a migration script.

---

## 5. UI shape (the Claude Design work)

- **Left:** branch tree of checkpoints (node name, timestamp, fork markers).
- **Center:** rendered state for the selected checkpoint — ingredient list,
  directions, recipe steps — each field editable.
- **Actions on a checkpoint:** `Edit & fork` (→ `/fork`), `Play from here`
  (→ `/step` repeatedly), `Compare` two branches.

Decide early, because it shapes the data model: **how the branch tree reads** —
vertical timeline with forks branching right (like `git log`), or a true node
graph. Vertical timeline is simpler to build and usually reads better here.

---

## 6. Design workflow — connecting Claude Design to the app

There is **no live sync or code export**. Claude Design produces visual artboards
(as an Artifact) plus PNG/PDF export. It's a spec you build against, not a
component library.

**Best path: share the published Artifact URL.** The artboards are `.dc.html` —
real HTML/CSS. They can be read directly to lift exact values (hex colors,
spacing scale, radii, font sizes, component structure) — better than eyeballing a
flattened PNG.

Workflow:

1. Design the artboards in Claude Design.
2. Share the Artifact URL. From it, generate:
   - a **design-tokens file / Tailwind theme** (colors, spacing, type, radii) —
     the real handoff contract
   - component shells matching the layout
3. Run the app, screenshot it.
4. Compare screenshot vs. artboard, adjust the design, re-share.
5. Repeat until they match.

PNG/PDF export stays useful as a side-by-side reference and for sharing, but it's
a checking aid, not the input. The thing that actually stays connected over time
is the **design-tokens file** — lock the palette / spacing / type scale early,
even while layout is still low-fi.

---

## 7. Should the design come first?

Not the full styling. A rough layout sketch now is fine; polished visuals come
after a working data slice.

The branch tree, the editable-state panel, and the compare view all depend on
the *actual shape* of LangGraph's data — checkpoint count per run, real
`parentConfig` trees, field sizes, what a fork looks like next to its parent.
Designing against guesses means redrawing once real `getStateHistory` output
exists.

**Order:**

1. **Now — low-fi wireframe only.** Lock the skeleton (left tree / center state /
   right actions) and the branch-tree style. No visual polish.
2. **Build the vertical slice unstyled** — start → step → render state → history
   → fork. This is where the data shapes become clear.
3. **Then design properly in Claude Design** against screenshots of the real
   thing.
4. Apply the styling to the working components.

---

## 8. Build order

1. `create-next-app`, add LangGraph + `@langchain/openai` deps, Neon project, env vars.
2. Define state + the 6 nodes with Zod, wire the graph, `MemorySaver` first.
3. Swap in `PostgresSaver`, write the `setup()` script.
4. Build the 6 API routes.
5. Minimal UI: start → step → render state.
6. Add `getStateHistory` + tree view.
7. Add edit/fork.
8. Drop in the Claude Design styling.
9. Deploy to Vercel.

---

## 9. Main gotchas

- **Reducers vs. edits** — if a field uses an append reducer, `updateState`
  appends instead of replacing. Keep editable fields plain (last-value-wins).
- **Branch tree isn't given to you** — LangGraph returns a flat history; build
  the tree from `parentConfig`.
- **Cold starts** — new PG pool per cold function; use the pooled Neon URL +
  module-scope caching of the client and compiled graph.
- **Timeouts** — step-wise execution avoids this; don't stream a whole 6-node
  run in one request on the Hobby plan.
- **Runtime** — Node.js runtime, not Edge, for any route touching `pg`.
- **`PostgresSaver.setup()`** — must run once before first use (migration script).
- **LangGraph.js vs Python** — Python's tooling (LangGraph Studio) is more mature
  for *visualizing* time-travel, but for a Vercel app the JS library is the right
  call; the visualization is custom-built here anyway.

---

## 10. Environment variables

```
OPENROUTER_API_KEY=
DATABASE_URL=            # Neon pooled connection string
```
