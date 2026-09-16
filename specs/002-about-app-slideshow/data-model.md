# Phase 1 Data Model: About This App Slideshow

This feature adds no graph state, no database table, and no API contract —
it's pure client-side UI reading from a static content module. "Data model"
here means the shape of that content module and of the component's own local
UI state.

---

## 1. Slide content (`lib/about-content.ts`)

Plain exported constants — no schema/validation layer needed (constitution
Principle II applies to LangGraph graph state; this module isn't graph state,
it's static presentational copy, same category as existing UI strings).

| Export | Type | Notes |
|---|---|---|
| `AUTHOR_LINKEDIN_URL` | `string` | Moved here from `components/AppHeader.tsx` (was a private `AUTHOR_URL` const) so both the header's existing "Author" link and Slide 1 read the same single value — spec Assumptions: "reuses the author LinkedIn link already published in the app's header." |
| `AUTHOR_BIO` | `string` | 1–2 sentences (spec FR-006, Clarifications 2026-09-16). |
| `TECH_STACK_ITEMS` | `{ name: string; blurb: string }[]` | One entry per FR-007 technology (Next.js App Router, Node.js serverless runtime, LangGraph.js, OpenRouter-routed Claude models, Zod). |
| `PERSISTENCE_EXPLANATION` | `{ summary: string; deepDive: string[] }` | `summary` covers FR-008; `deepDive` covers FR-011's tree-reconstruction and connection-pooling/graph-caching nuances (research R7). |
| `DIRECTORY_TREE` | `{ path: string; note: string }[]` | Ordered lines forming the visual tree on Slide 4 (FR-009): API routes, graph node definitions, shared state schema, DB migrations, UI layer. |
| `EXECUTION_STAGES` | `{ name: TimelineStage; description: string }[]` | The 6 happy-path stages in order (FR-010) — reuses the `TimelineStage` names from `lib/tree.ts` so the slide can never name a stage that doesn't match the real graph. |
| `EXECUTION_DEEP_DIVE` | `string[]` | FR-011's step-wise-execution and last-value-wins explanations. |

No field is user-editable, persisted, or sent over the network — it's read
once at render time by `AboutSlideshow.tsx`. Spec's Out of Scope: no admin/
authoring UI, so there's no create/update/delete lifecycle to model.

---

## 2. Component-local UI state (`components/AboutSlideshow.tsx`)

| State | Type | Notes |
|---|---|---|
| `open` | `boolean` | Owned by `AppHeader.tsx` (the trigger lives there); passed down as a prop. |
| `slideIndex` | `number`, `0`–`4` | Resets to `0` every time `open` transitions `false → true` (spec FR-005) — not preserved across opens. |
| `previouslyFocusedElement` | `HTMLElement \| null` (a ref, not state) | Captured when `open` becomes `true`; focus is restored there when it becomes `false` (spec FR-014). |

State transitions:

```
closed --[open]--> slideIndex=0
slideIndex=n --[Next, n<4]--> slideIndex=n+1
slideIndex=n --[Previous, n>0]--> slideIndex=n-1
any slideIndex --[Return to App]--> closed (slideIndex discarded, not persisted)
```

No transition reaches out of `[0, 4]` — "Next" at `n=4` and "Previous" at
`n=0` are no-ops surfaced as a disabled control (spec Acceptance Scenarios
4–5), not a wrapping/looping transition.

---

## 3. Relationship to existing entities

Nothing here reads or writes `State` (the LangGraph graph state,
`lib/agent/state.ts`), `SessionRow`, or `BranchRow` (`lib/db/schema.ts`).
`AboutSlideshow` is mounted at the same layout level as `AppHeader` itself
(`app/layout.tsx`), rendered as a full-viewport overlay on top of whatever
`app/page.tsx` (the session/list/entry view) is currently showing — it never
touches that view's own state, satisfying FR-004's "no data loss" requirement
by construction (the underlying tree simply isn't unmounted, only visually
and interactively covered).
