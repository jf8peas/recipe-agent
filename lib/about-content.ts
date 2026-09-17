import type { TimelineStage } from "./tree";

/**
 * Static, developer-authored copy for the "About This App" slideshow
 * (spec 002, FR-006–FR-011). Not live-introspected from the running app —
 * see specs/002-about-app-slideshow/spec.md's Assumptions and research.md R3.
 */

export const AUTHOR_LINKEDIN_URL = "https://www.linkedin.com/in/john-fong-04b7a120/";

export const AUTHOR_BIO =
  "John Fong is an on-the-tools business analyst who builds full-stack data products end to end. Recipe Agent is a personal project exploring how to use LangGraph to orchestrate an agentic process with full time-travel over an AI system's state history.";

export interface TechStackItem {
  name: string;
  blurb: string;
}

/** FR-007/FR-011 — how the pieces below fit together, read alongside the
 * architecture diagram (`components/AboutSlideshow.tsx`'s `ArchitectureDiagram`). */
export const TECH_STACK_OVERVIEW =
  "These pieces sit in a straight line, request to response: your browser calls a Next.js API route running on Node.js; that route hands the work to the LangGraph.js agent graph; each step of the graph that needs a model calls out through OpenRouter, which sends it to a fast, general-purpose Claude model for routine steps, or a stronger Claude model reserved for the one step that critiques the draft. Zod checks the shape of the data at every one of those handoffs, so nothing malformed ever crosses from one piece to the next.";

/** FR-007. */
export const TECH_STACK_ITEMS: TechStackItem[] = [
  {
    name: "Next.js App Router",
    blurb:
      "The whole app — pages and API routes alike — is one Next.js project, deployed on Vercel.",
  },
  {
    name: "Node.js serverless runtime",
    blurb:
      "Every API route that talks to the database or the agent explicitly runs on Node.js, not the lighter-weight Edge runtime — the database driver this app uses needs full Node.js.",
  },
  {
    name: "LangGraph.js",
    blurb:
      'The recipe-building agent is a LangGraph.js graph: a fixed set of steps ("nodes") connected by edges, each one able to read and update a shared piece of state.',
  },
  {
    name: "Claude models, via OpenRouter",
    blurb:
      "Every model call is routed through OpenRouter, which can reach many providers' models through one API. The app uses a faster model for the routine, mechanical graph steps, and a stronger, more capable model reserved for the one step that critiques the draft recipe.",
  },
  {
    name: "Zod",
    blurb:
      "Every piece of the agent's state, and everything a model is asked to produce, is checked against a Zod schema. Because a user can hand-edit any saved step and ask the app to continue from there, nothing is trusted to be shaped correctly by default.",
  },
];

export interface PersistenceExplanation {
  summary: string;
  deepDive: string[];
}

/** FR-008, FR-011. */
export const PERSISTENCE_EXPLANATION: PersistenceExplanation = {
  summary:
    "Every step the agent takes is saved as a checkpoint in Postgres — the ingredients, the directions, the draft, and so on, as they stood right after that step. Each checkpoint remembers which checkpoint came before it, so the app can always walk backward through a run's whole history, jump to any earlier point, and either just look at it or start a new attempt from there.",
  deepDive: [
    "The app keeps one shared database connection pool and one already-built copy of the agent graph, reused across requests instead of being recreated each time. Serverless functions can go cold and warm again between requests, and rebuilding either of those from scratch on every single request would add real, avoidable delay to every step.",
    'Editing an earlier step and continuing from there — this app\'s "time travel" — only works cleanly because "branching" never happens by writing a second, divergent continuation onto an already-used step in the same saved history. Instead, editing a step seeds a brand-new, independent history that starts by replaying everything up to that point exactly as it happened, and only then applies the edit. That keeps every branch\'s own story straightforward: a plain, unbroken line from its start to wherever it currently ends.',
    "Reconstructing the full picture you see when browsing a run's history — a run with several branches — combines each branch's own straight-line story with a small table the app keeps for itself, recording which branch was created from which earlier step of which other branch. Neither piece alone is enough; together they produce the complete, browsable tree.",
  ],
};

export interface DirectoryTreeEntry {
  path: string;
  note: string;
}

/** FR-009. */
export const DIRECTORY_TREE: DirectoryTreeEntry[] = [
  {
    path: "app/api/recipe/",
    note: "The API routes a browser talks to — start a run, take one step, inspect history, branch, delete.",
  },
  {
    path: "lib/agent/nodes/",
    note: "One file per agent step — parsing ingredients, proposing directions, drafting, critiquing, refining, finalizing.",
  },
  {
    path: "lib/agent/state.ts",
    note: "The shared shape of the agent's state — every field, and the rules it must follow.",
  },
  {
    path: "lib/agent/graph.ts",
    note: "Wires the steps and the shape of state together into the actual graph.",
  },
  { path: "lib/db/migrations/", note: "The database schema, as a sequence of applied changes." },
  {
    path: "components/",
    note: "Everything on screen — the entry form, the timeline, the state view, and this slideshow.",
  },
];

export interface ExecutionStage {
  name: TimelineStage;
  description: string;
}

/** FR-010 — the 7 happy-path stages (excludes the ingredientError side-branch,
 * which only runs when an ingredient can't be used — this is the success
 * path from ingredients to a finished recipe). */
export const EXECUTION_STAGES: ExecutionStage[] = [
  {
    name: "parseIngredients",
    description: "Reads the ingredient list and works out what each item actually is.",
  },
  {
    name: "proposeDirections",
    description: "Suggests a small set of different directions the dish could take.",
  },
  {
    name: "selectDirection",
    description: "Judges the candidate directions and picks the one to draft from.",
  },
  {
    name: "draftRecipe",
    description: "Writes a full first draft of the recipe for the chosen direction.",
  },
  {
    name: "critique",
    description: "Reviews the draft for anything unclear, unbalanced, or impractical.",
  },
  {
    name: "refine",
    description:
      "Revises the draft to address the critique — and may go back for another round of critique.",
  },
  {
    name: "finalize",
    description: "Locks in the recipe, scaled and formatted for the user to actually cook from.",
  },
];

/** FR-011. */
export const EXECUTION_DEEP_DIVE: string[] = [
  "The run doesn't go from start to finish in one uninterrupted burst. It's set up to pause after every single step, without exception, and the app itself decides when to ask for the next one. That keeps every request small and fast, and it's what makes stepping through a run one stage at a time — or stopping to look at, or edit, any point along the way — possible at all.",
  "Every field in the agent's state is simply replaced by whatever a step produces, never added onto or merged with what was there before. That's what makes editing a saved step and continuing from there behave the way you'd expect: the edit is the new value, in full — not one more thing layered on top of the old one.",
];
