<!--
Sync Impact Report
==================
Version change: 2.0.0 → 2.0.1
Rationale: PATCH — clarifies Principle VI to match the session model the spec
settled on during clarification. v2.0.0 said "session identity is a `threadId` in
the URL combined with `localStorage`"; the project chose a device-private model
where an anonymous client identifier in `localStorage` is the sole credential and
no session identifier ever appears in the URL. Same "no auth framework" intent,
accurate mechanism — no change in obligations, so PATCH. Also drops "compare"
from Principle VI's illustrative action list (the spec puts branch comparison out
of scope for v1).

Modified principles:
  - VI. Session & UI Boundaries — first bullet rewritten (threadId-in-URL →
    anonymous client identifier in `localStorage`, no session id in the URL,
    sessions private to the creating browser); right-panel example list no longer
    names "compare".

Modified sections: none

Added sections: none
Removed sections: none

Templates requiring updates:
  - .specify/templates/plan-template.md          ✅ present (created during /speckit-plan)
  - .specify/templates/spec-template.md          ✅ present (created during /speckit-specify)
  - .specify/templates/tasks-template.md         ✅ present (created during /speckit-tasks)
  - .specify/templates/commands/*.md             n/a (not used in this project)
  - RECOMMENDATION.md                            ✅ consistent
  - specs/001-recipe-agent/{spec,plan,tasks,data-model}.md + contracts/api.md + CLAUDE.md  ✅ updated alongside this amendment
  - README.md                                    ⚠ pending (not present — create with a Constitution reference when scaffolding)

Prior amendment (2.0.0): MAJOR — Principle I LLM-integration clause moved from
`@langchain/anthropic` + fixed model IDs to OpenRouter as the sole integration
point via `@langchain/openai`; `ANTHROPIC_API_KEY` → `OPENROUTER_API_KEY`; model
routing via a shared model-config module.

Follow-up TODOs: none. Ratification date preserved (2026-09-01); Last Amended
2026-09-06.
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
  paired with Neon Postgres. The LangGraph checkpointer is the single source of
  truth for graph state and its history.
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
- The client-side branch tree MUST be reconstructed from checkpoint
  `parentConfig` pointers. The app MUST NOT assume `getStateHistory` returns a
  linear history.

Rationale: "Edit a state and replay from there" only works if editing a field
replaces its value. An append reducer turns an edit into an append, silently
corrupting the branch.

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
  never in code paths that run on Vercel.
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
  - creates a DB pool or compiles the graph inside a request handler.
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

**Version**: 2.0.1 | **Ratified**: 2026-09-01 | **Last Amended**: 2026-09-06
