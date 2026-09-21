import type { TimelineStage } from "./tree";

/**
 * Static, developer-authored copy for the "About This App" reference page
 * (spec 004, FR-007–FR-020). Content, wording, and section order are drawn
 * directly from design/v002/about.html (the authoritative mockup) — see
 * that spec's Assumptions and research.md R4. Not live-introspected from
 * the running app.
 */

export const AUTHOR_LINKEDIN_URL = "https://www.linkedin.com/in/john-fong-04b7a120/";

// ---- Cover (FR-007) ----

export const COVER_KICKER = "Recipe Agent";
export const COVER_TITLE = "How it works";
export const COVER_LEDE =
  "An ingredient list becomes a finished recipe, one agent stage at a time — with full time-travel over every step it took to get there. This page works for a non-technical reader and an engineer alike.";

// ---- Author (FR-007) ----

export const AUTHOR_BIO =
  "John Fong is an on-the-tools business analyst who builds full-stack data products end to end. Recipe Agent is a personal project exploring how to use LangGraph to orchestrate an agentic process with full time-travel over an AI system's state history.";

// ---- Pitch (FR-007) ----

export const PITCH_HEADLINE =
  "Turn a list of ingredients into a finished recipe — and never lose a version of it";

export interface PitchFlowStep {
  label: string;
  detail: string;
}

export const PITCH_FLOW_STEPS: PitchFlowStep[] = [
  { label: "Ingredients", detail: '"2 eggs, spinach, feta…"' },
  { label: "Recipe Agent", detail: "A seven-node agent pipeline" },
  { label: "A finished recipe", detail: "Steps, timing, nutrition" },
];

export interface PitchHighlight {
  title: string;
  body: string;
}

export const PITCH_HIGHLIGHTS: PitchHighlight[] = [
  {
    title: "Paced, not instant",
    body: "The agent pauses after every stage instead of racing to the end, so you can watch it think.",
  },
  {
    title: "Nothing is thrown away",
    body: "Every stage's output is saved, so the whole run's history is always there to look back on.",
  },
  {
    title: "Edit the past, not just the present",
    body: 'Change an earlier answer and replay from there — that\'s "time travel," next.',
  },
];

// ---- Time travel (FR-008) ----

export const TIME_TRAVEL_TITLE = "Every stage is saved — so you can rewind, edit, and replay";

export const TIME_TRAVEL_EXPLANATION =
  "Nothing the agent produces is ever overwritten. Each stage's result is kept as its own checkpoint, and each checkpoint remembers the one before it. That means you can go back to any earlier point in a run, change something, and continue from there — without disturbing the original.";

// ---- Journey (FR-009) ----

export interface JourneyStep {
  step: string;
  title: string;
  body: string;
}

export const JOURNEY_STEPS: JourneyStep[] = [
  {
    step: "01",
    title: "Type in what you have",
    body: "List your ingredients and, optionally, a cuisine, a time limit, servings, or a diet to respect.",
  },
  {
    step: "02",
    title: "Watch it think, one stage at a time",
    body: 'The agent pauses after every stage. Step through manually, or let "Auto-run" click through for you.',
  },
  {
    step: "03",
    title: "Inspect, edit, or fork any step",
    body: "Disagree with a direction the agent chose? Edit that step and replay from there as a new branch.",
  },
  {
    step: "04",
    title: "Cook from the finished recipe",
    body: "Scaled to your servings, with steps, timing, and an approximate nutrition estimate.",
  },
];

export interface JourneyCallout {
  title: string;
  body: string;
}

export const JOURNEY_CALLOUT: JourneyCallout = {
  title: "No accounts, no login",
  body: 'A random ID stored in your browser is the only "credential." Sessions are private to your device — nothing is shareable across devices or people, and nothing ever appears in the page\'s URL.',
};

// ---- Architecture (FR-011) ----

export interface ArchitectureHop {
  hop: string;
  label: string;
  title: string;
  code: string;
  body: string;
  /** A genuine network round trip (FR-011's "which of those hops is a
   * genuine network round trip versus a same-process function call"). */
  isNetworkHop: boolean;
  /** Gets the accent-bordered "highlighted" card treatment in the mockup —
   * true for both network hops AND the validation gate (hop 4), which is
   * visually emphasized despite being a same-process call. */
  highlighted: boolean;
}

export const ARCHITECTURE_HOPS: ArchitectureHop[] = [
  {
    hop: "1",
    label: "BROWSER",
    title: "Type",
    code: "onChange → setRaw(value)",
    body: "Every keystroke updates the raw string via React state. Nothing else happens yet.",
    isNetworkHop: false,
    highlighted: false,
  },
  {
    hop: "2",
    label: "BROWSER",
    title: "Clean up",
    code: "split → trim → filter",
    body: "Plain JS, not Zod. raw is consumed here — ingredients is what moves on.",
    isNetworkHop: false,
    highlighted: false,
  },
  {
    hop: "3",
    label: "BROWSER → NETWORK",
    title: "fetch()",
    code: "POST /api/…/start",
    body: "The one real network hop — a genuine HTTP POST leaves the browser.",
    isNetworkHop: true,
    highlighted: true,
  },
  {
    hop: "4",
    label: "SERVER",
    title: "Validate",
    code: "RequestSchema.safeParse(…)",
    body: "✓ the actual gate — Zod's first check. Fails → 400, stops here.",
    isNetworkHop: false,
    highlighted: true,
  },
  {
    hop: "5",
    label: "SERVER",
    title: "Invoke",
    code: "graph.invoke(seed, config)",
    body: "Same process, no network. Runs exactly one node — interruptAfter is set on all seven.",
    isNetworkHop: false,
    highlighted: false,
  },
  {
    hop: "6",
    label: "SERVER → NETWORK",
    title: "Respond",
    code: "NextResponse.json({ state, next })",
    body: "Travels back over the same fetch() call — its promise resolves with this.",
    isNetworkHop: true,
    highlighted: true,
  },
];

export const ARCHITECTURE_NOTES: string[] = [
  "Loops back to the browser, always — never a server-side loop. Step waits for a click; Auto-run is the browser's own loop firing the next fetch() immediately, one full trip per node.",
  "Only two hops ever leave a process: step 3 (browser → server) and step 6 (server → browser). Everything else — the clean-up in step 2, the validation in step 4, the graph call in step 5 — runs as a plain function call, no network involved. The node that step 5 runs makes its own call to OpenRouter, Zod-checked the same way as step 4 — see the next section for model routing.",
];

// ---- Agent graph (FR-012) ----

export interface AgentGraphEdge {
  condition: string;
  explanation: string;
}

export const AGENT_GRAPH_EDGES: AgentGraphEdge[] = [
  {
    condition: "usable?",
    explanation:
      "None of the parsed ingredients was marked not-food, unintelligible, or a duplicate.",
  },
  {
    condition: "blocking & budget?",
    explanation:
      "blocking — critique's model judged a real feasibility/flavor problem, not just style. budget — refineCount is still under MAX_REFINE_CYCLES (2 by default). Both must hold for the run to loop back to refine.",
  },
];

export const AGENT_GRAPH_NOTE =
  "Circles are nodes; diamonds are edges — a plain function (lib/agent/edges.ts) that reads the current state and decides which node runs next. selectDirection sits behind a plain, unconditional edge — it judges which of proposeDirections's 2–3 candidate directions to draft from, but never changes which node runs next, so it's a node, not a diamond.";

// ---- Prompts & model routing (FR-013) ----

export interface PromptRoutingRow {
  stage: TimelineStage;
  model: "fast" | "stronger";
  asks: string;
  routesTo: string;
}

export const PROMPT_ROUTING_TABLE: PromptRoutingRow[] = [
  {
    stage: "parseIngredients",
    model: "fast",
    asks: "Classify each line: usable, staple, normalized",
    routesTo: "ingredientError or proposeDirections",
  },
  {
    stage: "proposeDirections",
    model: "fast",
    asks: "Propose 2–3 distinct dish directions",
    routesTo: "selectDirection",
  },
  {
    stage: "selectDirection",
    model: "fast",
    asks: 'Judge the candidates; report the chosen index + why (or an honest "no clear favorite, defaulted")',
    routesTo: "draftRecipe",
  },
  {
    stage: "draftRecipe",
    model: "fast",
    asks: "Write a full draft — ingredients, steps, timing, toBuy list",
    routesTo: "critique",
  },
  {
    stage: "critique",
    model: "stronger",
    asks: "Judge feasibility & balance; set blocking true/false",
    routesTo: "refine or finalize",
  },
  {
    stage: "refine",
    model: "fast",
    asks: "Revise the draft to address the critique",
    routesTo: "critique",
  },
  {
    stage: "finalize",
    model: "fast",
    asks: "Scale servings, polish wording, estimate nutrition",
    routesTo: "end",
  },
];

export const PROMPT_ROUTING_NOTE =
  "Every reply is requested through withStructuredOutput against a Zod schema — a model's answer is validated shape before anything trusts it. MODEL_DEFAULT and MODEL_CRITIQUE are OpenRouter model IDs read only in lib/agent/models.ts — swapping models is an env-var change, never a code change.";

// ---- State, validation & persistence (FR-014) ----

export const STATE_CHANNELS: string[] = [
  "ingredients",
  "constraints",
  "directions",
  "directionSelection",
  "recipeDraft",
  "critiques",
  "finalRecipe",
  "refineCount",
  "outcome",
  "failureReason",
];

export const STATE_NOTES: string[] = [
  "One shared state object — not per-node variables — flows node to node. Its shape is GraphState (Annotation.Root in lib/agent/graph.ts): one last-value-wins channel per field, replaced whole on every update, never merged.",
  "Zod (StateSchema, lib/agent/state.ts) isn't an automatic guard on every transition. It validates exactly two moments a node's own code checks: a model's structured output the instant it returns, and a person's /fork edit patch — before either is trusted to overwrite a channel.",
];

// ---- Branching (FR-015) ----

export interface BranchingStep {
  step: number;
  body: string;
}

export const BRANCHING_INTRO =
  "Forking never writes a second, divergent continuation onto an already-used step in the same thread — that's the operation confirmed to lose data. Instead, lib/fork-replay.ts does this, in order:";

export const BRANCHING_STEPS: BranchingStep[] = [
  {
    step: 1,
    body: "Read the source branch's full checkpoint history, oldest first, up to the checkpoint being forked from.",
  },
  {
    step: 2,
    body: "Seed a brand-new LangGraph thread, and replay every prior stage's recorded output onto it, exactly as it happened.",
  },
  {
    step: 3,
    body: "Apply the user's patch as the final replayed step — attributed to the stage that originally produced it.",
  },
  {
    step: 4,
    body: "Record the new thread as a branch of the old one in a small branches table, and return its fresh tip.",
  },
];

export interface BranchingCallout {
  title: string;
  body: string;
}

export const BRANCHING_CALLOUTS: BranchingCallout[] = [
  {
    title: "One thread per branch",
    body: "Every branch — the original run and every fork of it — is its own LangGraph thread_id. A session can hold many.",
  },
  {
    title: "Fork vs. retry",
    body: "A retry is a plain re-run on the same thread — confirmed safe. Only editing-and-continuing seeds a new one.",
  },
];

// ---- Data model (FR-016) ----

export interface DataModelTable {
  name: string;
  fields: string[];
  note: string;
}

export const DATA_MODEL_TABLES: DataModelTable[] = [
  {
    name: "sessions",
    fields: ["session_id, client_id", "root_thread_id, title", "stage_count, status"],
    note: "One row per app-level session — not a LangGraph thread.",
  },
  {
    name: "branches",
    fields: ["thread_id, session_id", "parent_thread_id", "forked_from_checkpoint_id"],
    note: "One row per branch — links it to its parent and fork point.",
  },
  {
    name: "usage_events",
    fields: ["client_id, thread_id", "kind, created_at", "start | stage | rejected-limit"],
    note: "Backs the rate limits and daily/global caps.",
  },
];

export const DATA_MODEL_TREE_EXPLANATION =
  "Neither piece alone is the tree. Each branch's own checkpoint chain (from LangGraph's checkpointer) gives a plain, unbroken line from its start to wherever it ends; the branches table records which branch forked from which checkpoint of which other branch. Combining the two produces the full, browsable history a person sees in the app.";

// ---- Repo (FR-017) ----

export interface RepoArea {
  path: string;
  note: string;
}

export const REPO_URL = "https://github.com/jf8peas/recipe-agent";

export const REPO_AREAS: RepoArea[] = [
  {
    path: "app/api/recipe/",
    note: "Route handlers a browser talks to — start, step, commit, fork, history, delete.",
  },
  {
    path: "lib/fork-replay.ts",
    note: "The replay-and-patch algorithm that seeds a fork's new thread.",
  },
  { path: "lib/agent/nodes/", note: "One file per graph stage — parseIngredients through finalize." },
  {
    path: "lib/db/",
    note: "The pooled connection, schema, and migrations as a sequence of applied changes.",
  },
  {
    path: "lib/agent/state.ts / graph.ts",
    note: "The Zod-validated state shape, and the graph that wires stages to it.",
  },
  { path: "components/", note: "Everything on screen — entry form, timeline, state panels, this page." },
  {
    path: "lib/agent/models.ts / prompts.ts",
    note: "Where model IDs resolve, and every stage's exact prompt template.",
  },
  {
    path: "specs/",
    note: "The living spec, plan, and research docs — the authoritative source this page was built from.",
  },
];

export const REPO_NOTE =
  "Governed by .specify/memory/constitution.md — the project's own non-negotiables document, summarized in Engineering principles below.";

// ---- API (FR-018) ----

export interface ApiGuardrail {
  title: string;
  body: string;
}

export const API_GUARDRAILS: ApiGuardrail[] = [
  {
    title: "Every request carries X-Client-Id",
    body: "A random id in localStorage is the only credential. Missing it → 401. A session id belonging to someone else's client → 404, never 403 — ownership never leaks which sessions exist.",
  },
  {
    title: "A stage failure isn't an HTTP error",
    body: "A failed stage comes back as 200 with a stage-failure entry in the timeline, so the client can render it in the tree and offer a retry.",
  },
  {
    title: "Four kinds of limit, one status code",
    body: "rate-limited, daily-cap, global-cap, session-cap — each returns 429, and no checkpoint is ever written for a rejected request.",
  },
];

export const API_ROUTES: string[] = [
  "POST /start",
  "POST /:sid/step",
  "POST /:sid/step/commit",
  "POST /:sid/fork",
  "GET /:sid/history",
  "GET /:sid/state",
  "DELETE /:sid",
  "GET /mine",
  "POST /cron/purge",
];

export const API_NOTE =
  'Every handler: runtime "nodejs", maxDuration 60 — Edge is banned for anything touching Postgres or LangGraph.';

// ---- Principles (FR-019) ----

export interface Principle {
  title: string;
  body: string;
}

export const PRINCIPLES: Principle[] = [
  {
    title: "Stack is fixed",
    body: "Next.js on Vercel, LangGraph.js in Route Handlers, OpenRouter for every model call, Neon + Zod.",
  },
  {
    title: "Singletons, always",
    body: "One pool, one compiled graph, cached in module scope — never created inside a request handler.",
  },
  {
    title: "One thread per branch",
    body: "Never a second child of an already-branched checkpoint in one thread — the confirmed data-loss case.",
  },
  {
    title: "Model IDs, one place",
    body: "Only lib/agent/models.ts resolves a model id. Design tokens live only in app/tokens.css.",
  },
  {
    title: "One super-step per request",
    body: "interruptAfter on every node; Auto-run is a client-side loop of single-step requests, not a server loop.",
  },
  {
    title: "Device-private, always",
    body: "No login, no session id in a URL, no sharing across devices — by design, not by omission.",
  },
];

// ---- Closing (FR-020) ----

export interface ClosingPointer {
  path: string;
  note: string;
}

export const CLOSING_POINTERS: ClosingPointer[] = [
  {
    path: "specs/",
    note: "One numbered folder per feature — functional requirements and user stories.",
  },
  { path: "data-model.md", note: "Every graph-state channel and app database table." },
  { path: "contracts/api.md", note: "Every API route's request/response contract." },
  {
    path: "research.md",
    note: "The design decisions behind time-travel, limits, and cancellation.",
  },
];
