# Phase 1 Data Model: About Page Redesign

Like spec 002, this feature adds no graph state, no database table, and no
API contract — it's pure client-side content and presentation. "Data model"
here means the shape of the (rewritten) content module and the component's
own local UI state.

---

## 1. Content module (`lib/about-content.ts`, rewritten)

One or a small group of exports per section, each shaped for that section's
own content — not a uniform interface (research R4). `AUTHOR_LINKEDIN_URL`
is the one export that survives unchanged from the current file (still
consumed by `AppHeader.tsx`'s own "Author" link, per spec Dependencies).

| Export(s) | Shape | Feeds section |
|---|---|---|
| `AUTHOR_LINKEDIN_URL` | `string` (unchanged) | Author, Closing |
| `AUTHOR_BIO` | `string` | Author |
| `PITCH_HEADLINE`, `PITCH_FLOW_STEPS`, `PITCH_HIGHLIGHTS` | `string`; `{ label: string }[]` (3, the ingredients→agent→recipe strip); `{ title: string; body: string }[]` (3 cards) | Pitch |
| `TIME_TRAVEL_EXPLANATION` | `string` | TimeTravel (paired with `TimeTravelDiagram`, no content export needed — the diagram's labels are hardcoded geometry, research R6) |
| `JOURNEY_STEPS`, `JOURNEY_CALLOUT` | `{ step: string; title: string; body: string }[]` (4); `{ title: string; body: string }` | Journey |
| `ARCHITECTURE_HOPS` | `{ hop: string; label: string; title: string; code: string; body: string; isNetworkHop: boolean }[]` (6) | Architecture |
| `AGENT_GRAPH_EDGES` | `{ condition: string; explanation: string }[]` (2 — `usable?`, `blocking & budget?`) | AgentGraph (paired with `AgentGraphDiagram`) |
| `PROMPT_ROUTING_TABLE` | `{ stage: TimelineStage; model: "fast" \| "stronger"; asks: string; routesTo: string }[]` (7 — reuses `TimelineStage` from `lib/tree.ts`, same self-enforcing-via-types precedent established in feature 003 research R8) | Prompts |
| `STATE_CHANNELS` | `string[]` (10 channel names) | State (paired with `StatePersistenceDiagram`) |
| `BRANCHING_STEPS`, `BRANCHING_CALLOUTS` | `{ step: number; body: string }[]` (4); `{ title: string; body: string }[]` (2) | Branching |
| `DATA_MODEL_TABLES`, `DATA_MODEL_TREE_EXPLANATION` | `{ name: string; fields: string[]; note: string }[]` (3 — `sessions`, `branches`, `usage_events`); `string` | DataModel |
| `REPO_AREAS`, `REPO_URL` | `{ path: string; note: string }[]`; `string` | Repo |
| `API_GUARDRAILS`, `API_ROUTES` | `{ title: string; body: string }[]` (3); `string[]` (9, grouped by method) | Api |
| `PRINCIPLES` | `{ title: string; body: string }[]` (6) | Principles |
| `CLOSING_POINTERS` | `{ path: string; note: string }[]` (4) | Closing |

Every string value is authored to match `design/v002/about.html`'s actual
wording (the mockup is the source of truth, spec.md Dependencies) — this
table describes *shape*, not content.

---

## 2. Component-local UI state (`components/about/AboutPage.tsx`)

Much simpler than spec 002's — there is no "current slide" concept.

| State | Type | Notes |
|---|---|---|
| `open` | `boolean` | Owned by `AppHeader.tsx` (unchanged prop name, research R7) |
| `announcement` | `string` | The `aria-live="polite"` region's text — set by the topic-nav `onClick` handler to the activated section's name (research R5, R7); empty on open |
| `previouslyFocused` | `HTMLElement \| null` (a ref, not state) | Captured when `open` becomes `true`; restored on close (research R7, carried over from `AboutSlideshow.tsx` unchanged) |

No `slideIndex`, no `SLIDES` array — the page always renders every section,
in the same fixed order, every time it's open (spec Key Entities: "Sections
are fixed in number and order").

---

## 3. Relationship to existing entities

Nothing here reads or writes graph `State`, `SessionRow`, or `BranchRow`.
`AboutPage` mounts the same way `AboutSlideshow` did — as a sibling of
`app/page.tsx`'s own tree, inside `AppHeader.tsx` — so the underlying
session view stays mounted and untouched while it's open, satisfying
FR-005's "no loss of in-progress state" by the same construction spec 002
already established (data-model.md § 3 there).
