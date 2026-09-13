<!--
Sync Impact Report
==================
Version change: 2.0.1 → 3.0.0
Rationale: MAJOR — backward-incompatible correction of a factual claim in
Principles I and IV. Both asserted that a single LangGraph `thread_id`'s own
checkpoint history (`getStateHistory` / `parentConfig`) is THE branch tree, and
that the Postgres checkpointer is the sole source of truth for it. Confirmed via
the `/speckit-implement` T016 spike (research R3) against a real Postgres wire
protocol, across `@langchain/langgraph-checkpoint-postgres` 1.0.0–1.0.5: creating
a SECOND child of an already-branched-from checkpoint within one thread silently
drops the write (a channel-version collision in that package's blob storage —
confirmed absent from `MemorySaver`, so it is specific to that checkpointer
package, not LangGraph core). A time-travel product forks from
already-branched-from checkpoints constantly, so this is load-bearing, not an
edge case. Fix: **each branch is its own LangGraph thread**, seeded by replaying
the parent branch's recorded outputs (safe — a freshly-seeded thread never
collides) up to the fork point. The app's own `branches` table now tracks
cross-thread relationships; the checkpointer remains authoritative only for a
single branch's own linear history. This changes what "the branch tree" IS, so
it is a redefinition, not a clarification — MAJOR.

Modified principles:
  - I. Fixed Technology Stack — "Persistence / checkpointing" bullet narrowed:
    the checkpointer is the source of truth for one branch's history, not the
    whole tree; added a pointer to Principle IV for the branching rule.
  - IV. Time-Travel State Integrity — replaced the "branch tree MUST be
    reconstructed from checkpoint `parentConfig`" bullet with the confirmed
    one-thread-per-branch rule, the fork-must-seed-a-new-thread rule (with the
    reason — the confirmed bug), the retry-may-reuse-the-thread rule, and the
    cross-thread tree-reconstruction rule (per-thread `parentConfig` chains +
    the app's own `branches` table).

Modified sections:
  - Technology & Configuration Constraints — "Checkpointer" bullet gains the
    one-thread-per-branch rule and a pointer to Principle IV.
  - Development Workflow & Quality Gates — review gate gains: "creates a second
    child of an already-branched checkpoint within one thread via `updateState`
    instead of seeding a new thread."

Added sections: none
Removed sections: none

Templates requiring updates:
  - specs/001-recipe-agent/{spec,plan,tasks,data-model,research}.md +
    contracts/api.md + CLAUDE.md                  ⚠ pending — update alongside
    this amendment as part of the same `/speckit-implement` pass
  - RECOMMENDATION.md                             ⚠ pending — same pass
  - .specify/templates/*.md                       ✅ unaffected (structural, not
    content-specific)
  - README.md                                     ⚠ pending (not present)

Prior amendments: 2.0.1 PATCH (Principle VI → device-private session model);
2.0.0 MAJOR (Principle I LLM integration → OpenRouter).

Follow-up TODOs: none. Ratification date preserved (2026-09-01); Last Amended
2026-09-14.
-->

# Recipe Agent Constitution

Recipe Agent is a Vercel-hosted Next.js webapp that uses LangGraph agents to
build a recipe from a list of ingredients, with time-travel: inspect the agent's
state history, select any checkpoint, edit it, and replay the agents from that
point.

This constitution defines the non-negotiable architecture, conventions, and
operational rules for the project. Every plan, specification, task list, code
review, and pull request MUST comply with it.

## Core Principles

### I. Fixed Technology Stack

The stack below is fixed. Substituting, adding, or removing any load-bearing
dependency in this list requires a constitution amendment (see Governance).

- **Framework**: Next.js (App Router), deployed on Vercel.
- **Agent framework**: `@langchain/langgraph` (JS/TS), embedded directly inside
  Next.js Route Handlers. No standalone agent service, no Python runtime, no
  LangGraph Platform / LangGraph Server deployment.
- **LLM integration**: OpenRouter is the single integration point for every graph
  node's model call, via its OpenAI-compatible API (`@langchain/openai`'s
  `ChatOpenAI` pointed at `https://openrouter.ai/api/v1`). Graph nodes MAY use any
  model OpenRouter offers. Direct provider SDKs (`@langchain/anthropic`, the
  native OpenAI endpoint, etc.) MUST NOT be used for graph-node calls. Each node's
  model is selected by key from a single shared model-config module; model IDs
  MUST NOT be hard-coded at call sites, and each node MUST declare which model key
  it uses and why.
- **Persistence / checkpointing**: `@langchain/langgraph-checkpoint-postgres`
  paired with Neon Postgres. The LangGraph checkpointer is the source of truth
  for a single branch's own state history. Cross-branch structure (the full
  tree) is governed by Principle IV.
- **Schema validation**: Zod.

Rationale: One deploy target, one language, one persistence layer. The time-travel
feature depends entirely on LangGraph's checkpointer semantics; swapping the
framework or the checkpointer would invalidate the core product. Model choice is
deliberately NOT fixed — routing every call through OpenRouter lets each node use
the best model for its task without adding provider dependencies.

### II. Schema-Validated Graph State

- Every graph state channel MUST have an explicit Zod schema.
- Every node input and output MUST be parsed/validated against a Zod schema at
  the node boundary. Unvalidated data MUST NOT enter or leave a node.
- LLM structured output MUST be constrained by, and validated against, a Zod
  schema. A validation failure is an error to surface, never a value to coerce
  silently.
- No `any`-typed or free-form JSON state fields. If a field is a string, it is a
  string because the schema says so.

Rationale: Time-travel lets a user hand-edit any state field and replay from it.
Strict schemas at every boundary are what make an edited checkpoint safe to
resume instead of a source of downstream crashes.

### III. Node.js Serverless Runtime Discipline

- Every API route that touches Postgres OR LangGraph MUST explicitly set
  `export const runtime = "nodejs"`. The Edge runtime is strictly prohibited for
  these routes — the `pg` driver requires Node.js.
- Every API route handler MUST set `export const maxDuration = 60`.
- Database access MUST use Neon's **pooled** connection string.
- The Postgres client/pool AND the compiled LangGraph graph MUST be cached in
  module scope so warm invocations reuse them. Creating a new pool or recompiling
  the graph per request is prohibited.
- `PostgresSaver.setup()` (checkpointer schema migration) MUST run via a
  dedicated migration script, never lazily inside a request handler.

Rationale: Serverless cold starts, connection exhaustion, and the 60s function
ceiling are the predictable failure modes for this architecture. These rules
neutralize all of them.

### IV. Time-Travel State Integrity

- Every state channel that a user can edit MUST be a plain, last-value-wins
  value. `updateState` MUST overwrite such a field, not merge or append.
- Append/accumulate reducers (e.g. message-list reducers like
  `messagesStateReducer`) are PROHIBITED on any state field intended for
  time-travel editing.
- If append-style history is genuinely needed, it MUST live in a separate,
  clearly non-editable channel that is documented as such.
- **Each branch MUST be its own LangGraph `thread_id`.** A branch that carries
  edited values MUST be created by seeding a brand-new thread (replaying the
  parent branch's recorded stage outputs up to the fork point, then diverging
  with the edit) — MUST NOT be created by asking the checkpointer to write a
  second child of an already-branched-from checkpoint within one thread. That
  path is PROHIBITED: it triggers a confirmed data-loss bug in
  `@langchain/langgraph-checkpoint-postgres` (verified 1.0.0–1.0.5, research
  R3) where the edit is silently dropped in favor of an existing sibling's
  content.
- Retry (re-running a stage with the SAME input, no edits) MAY resume a
  historical checkpoint within the same thread via plain execution — this is
  safe and creates a proper sibling; it MUST NOT go through `updateState`.
- The full cross-branch tree MUST be reconstructed by combining each thread's
  own `parentConfig` chain (`getStateHistory`) with the app's `branches` table
  (session id, thread id, parent thread id, forked-from checkpoint id). The app
  MUST NOT assume one thread's history spans more than one branch.

Rationale: "Edit a state and replay from there" only works if editing a field
replaces its value. An append reducer turns an edit into an append, silently
corrupting the branch. The one-thread-per-branch rule exists because the
alternative (branching within a thread) is empirically unsafe with the
project's chosen checkpointer package — the constitution follows the confirmed
behavior of the actual dependency, not the library's intended-but-buggy design.

### V. Client-Driven Step Execution

- The graph MUST be configured to pause after every step, via
  `interruptAfter: ["*"]` or explicit per-node interrupts.
- The client advances execution one step per request. A single serverless
  invocation MUST NOT run an open-ended multi-node sequence to completion.
- Each step request resumes from an explicit `thread_id` + `checkpoint_id` and
  returns the new state and checkpoint id.

Rationale: Step-wise execution is both the product's UX (back-and-forth over
states) and the mechanism that keeps every invocation safely under the 60s
function limit.

### VI. Session & UI Boundaries

- v1 has NO authentication framework. Session ownership is an anonymous,
  high-entropy client identifier held only in `localStorage` and sent with every
  request; no session identifier appears in the URL, and a session is reachable
  only from the browser that created it (not shareable, no cross-device access).
  Introducing auth — or any cross-device/sharing mechanism — is a constitution
  amendment.
- The application layout is a fixed three-panel structure:
  - **Left**: vertical branch-tree timeline, built from checkpoint `parentConfig`.
  - **Center**: editable state view for the selected checkpoint.
  - **Right**: action controls (e.g. edit & fork, play from here, retry).
- Design tokens (color, spacing, type scale, radii) live in a single shared
  source consumed by the whole UI. Component-local hard-coded style values that
  duplicate a token are prohibited.

Rationale: A fixed shell keeps the state/branch/replay interactions legible and
lets the visual design be applied without re-architecting the layout.

## Technology & Configuration Constraints

- **Required environment variables**: `OPENROUTER_API_KEY`, `DATABASE_URL` (Neon
  pooled connection string). Routes MUST fail fast with a clear error if a
  required variable is missing.
- **Model routing**: Every node references its model by key from the shared
  model-config module (e.g. `MODELS.default`, `MODELS.critique`). That module is
  the only place keys map to concrete OpenRouter model IDs, so a model swap is a
  one-file change. `MODELS.critique` SHOULD resolve to a more capable model than
  `MODELS.default`; the specific IDs are an implementation choice, not a
  constitutional fixture. Any new node MUST declare which model key it uses and
  why.
- **Runtime pins**: `runtime = "nodejs"` and `maxDuration = 60` on every API
  handler; never Edge for DB/LangGraph routes.
- **Checkpointer**: `PostgresSaver` is the only checkpointer in deployed
  environments. `MemorySaver` is permitted only in local development and tests,
  never in code paths that run on Vercel. One LangGraph thread per branch
  (Principle IV); the app's `branches` table links threads into the full tree.
- **Graph compilation**: the graph is defined once and compiled once per module
  load; the compiled instance is exported and reused.

## Development Workflow & Quality Gates

- **Constitution Check**: Every `/speckit-plan` MUST include a Constitution Check
  section that explicitly confirms compliance with Principles I–VI, or documents
  a justified, amendment-backed exception.
- **Review gate**: A change MUST NOT merge if it:
  - adds an Edge-runtime route touching DB or LangGraph,
  - omits `runtime`/`maxDuration` exports on an API handler,
  - introduces an append reducer on an editable state channel,
  - adds graph state without a Zod schema,
  - hard-codes a model ID or a design token value outside its shared config,
  - creates a DB pool or compiles the graph inside a request handler,
  - creates a second child of an already-branched-from checkpoint within one
    LangGraph thread via `updateState` instead of seeding a new thread.
- **Migrations**: checkpointer and application schema changes ship as explicit
  migration scripts, run outside the request path, and are noted in the PR.
- **Local vs. deployed parity**: any `MemorySaver` or Edge usage MUST be guarded
  so it can never execute in a Vercel deployment.

## Governance

- **Authority**: This constitution supersedes other conventions. Where a plan,
  spec, task, or review conflicts with it, the constitution wins.
- **Amendments**: Proposed as a pull request that (a) states the change and its
  rationale, (b) updates this file, (c) bumps the version per the policy below,
  (d) updates the Sync Impact Report, and (e) updates any dependent templates and
  docs in the same PR. Amendments require explicit maintainer approval.
- **Versioning policy** (semantic):
  - **MAJOR**: removal or backward-incompatible redefinition of a principle or
    governance rule.
  - **MINOR**: a new principle or section, or materially expanded guidance.
  - **PATCH**: clarifications and wording fixes with no change in obligations.
- **Compliance review**: The Constitution Check in `/speckit-plan` is the
  standing compliance gate. Reviewers MUST verify the review-gate list above on
  every PR. Non-compliant work is blocked until fixed or until an amendment
  legitimizes it.
- **Dependent artifacts**: `plan-template.md`, `spec-template.md`,
  `tasks-template.md`, and command templates under `.specify/templates/` MUST be
  kept consistent with this constitution. Until those templates exist in the
  repo, the first command that needs one MUST create it in a constitution-aligned
  form.

**Version**: 3.0.0 | **Ratified**: 2026-09-01 | **Last Amended**: 2026-09-14
