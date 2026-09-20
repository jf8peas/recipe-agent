# Implementation Plan: UI Unification

**Feature Directory**: `specs/006-ui-unification`
**Created**: 2026-09-20
**Status**: Draft
**Spec**: [spec.md](spec.md)
**Input**: Unify Recipe Agent's screens (entry form, session list, running
session, About page) using the high-fidelity design handoff at
`design/v003/` — one two-state header, a rebuilt two-row agent graph with a
legible node-size floor and auto-fit scaling, stage outputs as tabs synced
to the graph, a shared 720px column/type-scale/component set, and the About
page's scroll-container fixed — recreated in the app's real `.tsx`
components, not shipped as the reference HTML/JSX.

## Summary

The largest-scope feature in this repo to date, touching nearly every
screen, but architecturally modest: no new dependency, no new route, no
graph/data model change. Five small `components/ui/` primitives (`Button`,
`Card`, `ListRow`, `TextArea`, `Spinner`) and a new `Toggle` are extracted
once and consumed everywhere; `AppHeader` gains a `mode` prop and absorbs
the About page's own header; `AgentGraphProgress`'s existing `deriveRunPath`
derivation (feature 005) is reused completely unchanged, only its rendering
geometry changes to a two-row layout via a wider SVG `viewBox` — no
`ResizeObserver`/`transform: scale()` machinery, since SVG's own viewBox
scaling already does that job. `app/page.tsx` gains exactly one new piece of
state (`activeTab`); which tabs exist is derived from the graph's own
already-correct state, never tracked separately. The constitution's
Principle VI (three-panel layout) is amended (v3.0.0 → v4.0.0) to describe
the new single-column, tabbed, sticky-action-row layout as the standard,
per the user's explicit direction — the shipped app never actually
implemented the old three-panel description in the first place.

## Technical Context

**Language / Runtime**: TypeScript, Node.js (existing toolchain — no change).
**Framework**: React components under Next.js App Router — no Route Handler
touched.
**Primary Dependencies**: None new. Inline SVG (already used four times in
this codebase) and plain inline styles are the only techniques used.
**Storage**: None — no graph state channel, database table, or migration.
**External Services**: None new.
**Testing**: Vitest (no new pure-logic module beyond the small, directly
derivable `visibleTabs`/`STAGE_TO_TAB` functions in `data-model.md` § 4,
covered inline where they're defined — mirrors feature 005's
`lib/graph-progress.ts` test convention at a much smaller scale) and
Playwright (`tests/e2e/ui-unification.spec.ts`, new; every existing e2e
spec updated only where a selector moved).
**Target Platform**: Unchanged — same Vercel deployment, same browser target.
**Performance Goals**: None beyond rendering promptly — no new computation
heavier than feature 005's own `deriveRunPath`, already proven cheap.
**Constraints**: No new dependency (Principle I); every new visual value
resolves through `app/tokens.css` (Principle VI); mobile-first, single-column
running-session layout (Principle VI, amended); color never the sole state
signal (Principle VI's own design-token discipline, applied to the graph's
and critique's state indicators).
**Scale/Scope**: 6 new files (`components/ui/{Button,Card,ListRow,TextArea,
Spinner,Toggle}.tsx`), 1 new asset (`app/icon.svg`), ~9 modified components
(`AppHeader`, `AgentGraphProgress`, `about/AboutPage`, `StatePanel` split
into tab bodies, `ActionToolbar`, `EntryForm`, `SessionList`, `app/page.tsx`,
`app/layout.tsx`), 1 new e2e spec, 1 constitution amendment.

No unresolved NEEDS CLARIFICATION — spec.md's own three clarifications and
this plan's own explicit open question (Principle VI) are all resolved; see
[research.md](research.md) R1–R10.

## Constitution Check

*Gate: must pass before Phase 0. Re-checked after Phase 1. Evaluated against
the constitution as amended by this same plan (v4.0.0) — see research R8.*

| Principle | Status | Notes |
|---|---|---|
| I. Fixed Technology Stack | PASS | No dependency added or substituted. Inline SVG and plain inline styles are both already-established techniques. |
| II. Schema-Validated Graph State | N/A | No graph state channel touched. |
| III. Node.js Serverless Runtime Discipline | N/A | No API route added, modified, or removed. |
| IV. Time-Travel State Integrity | N/A | No checkpoint, thread, or branch write. |
| V. Client-Driven Step Execution | N/A | No step/invoke call added or changed (FR-022/SC-007: every existing real interaction's behavior is preserved). |
| VI. Session & UI Boundaries | PASS | This feature *is* the reason Principle VI was amended (research R8) — the new text describes exactly the single-column/graph/tabs/sticky-action-row layout this plan builds, so it's now compliant by construction rather than by exception. Design tokens: every new visual value resolves through `app/tokens.css` (verified via the token-discipline grep, quickstart.md); no new hard-coded value. |

**Result**: PASS — no undocumented deviations. One constitution amendment
landed alongside this plan (v3.0.0 → v4.0.0), per explicit user direction,
not a silent exception.

## Project Structure

```
components/
  ui/                            # NEW subdirectory
    Button.tsx                    # NEW
    Card.tsx                      # NEW
    ListRow.tsx                   # NEW
    TextArea.tsx                  # NEW
    Spinner.tsx                   # NEW
    Toggle.tsx                    # NEW
  AppHeader.tsx                   # MODIFIED — gains `mode` prop, absorbs About page's own header
  AgentGraphProgress.tsx          # MODIFIED — two-row layout geometry, node-click/selected-node props;
                                   #   lib/graph-progress.ts's deriveRunPath/types UNCHANGED
  StatePanel.tsx                  # DELETED — split into per-tab bodies inside app/page.tsx (or a new
                                   #   components/RunTabs.tsx, decided in tasks) using components/fields/*
                                   #   (all unchanged) wrapped in the new Card primitive
  ActionToolbar.tsx               # MODIFIED — restyled onto Button primitive + sticky/bordered/shadow-md row
  EntryForm.tsx                   # MODIFIED — restyled onto TextArea/Button primitives
  SessionList.tsx                 # MODIFIED — restyled onto ListRow/Button primitives
  about/
    AboutPage.tsx                  # MODIFIED — header swapped to AppHeader mode="about"; scroll-container
                                   #   fix; own agent-graph illustration restyled (content/sections unchanged)
app/
  page.tsx                        # MODIFIED — new activeTab state; graph+tabs replace graph+StatePanel
  layout.tsx                      # MODIFIED — AppHeader call site unchanged in shape (mode="app" implicit
                                   #   default), icon metadata picked up automatically via app/icon.svg
  icon.svg                        # NEW — Next.js App Router file-based favicon convention
lib/
  graph-progress.ts                # UNCHANGED — deriveRunPath, GraphNodeName, NodeVisualState, RunPathState
                                   #   all reused as-is; only GRAPH_NODES/DECISION_POINTS coordinate values
                                   #   change (still the same file, same exported shapes)
tests/e2e/
  ui-unification.spec.ts          # NEW
.specify/memory/
  constitution.md                  # AMENDED — v3.0.0 -> v4.0.0, Principle VI (research R8)
```

## Phase 0: Research

See [research.md](research.md). Covers: the full design-reference-to-real-file
mapping table (R1); why the graph rebuild keeps the existing SVG technique
instead of the reference's plain-HTML + `ResizeObserver` approach (R2);
confirming there's no desktop graph/tabs side-by-side breakpoint in the
reference at all, resolving the planning request's own flagged uncertainty
with evidence rather than a guess (R3); the `components/ui/` primitives'
shape (R4); how tabs derive from feature 005's own already-correct
`RunPathState` rather than tracking a second, independent list (R5); why
`constraints` gets no tab of its own (R6); build sequencing (R7); the
constitution Principle VI conflict, surfaced as an explicit open question
and resolved by amendment per the user's direction (R8); the About page's
scroll-container fix (R9); and the testing/verification approach (R10).

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — the primitives' prop shapes, the header's
  `mode` prop, the graph's new `row`-aware layout geometry (same derived
  state as feature 005), and the tabs' derivation logic (`STAGE_TO_TAB`,
  `visibleTabs`, the one new `activeTab` state variable).
- [contracts/ui-contracts.md](contracts/ui-contracts.md) — prop contracts
  and behavioral guarantees for every new/changed component, in place of an
  API contract (no HTTP surface exists to change).
- [quickstart.md](quickstart.md) — manual verification flow mapped to the
  five user stories and the four reference screenshots, plus the automated
  test commands and the token-discipline grep check.

## Constitution Check (post-design)

Re-evaluated after Phase 1 — unchanged from pre-design; the data model and
contracts introduce nothing that implicates a principle beyond what the
pre-design check already covered. Still **PASS**.

## Complexity Tracking

No undocumented constitution deviation — the one real deviation (Principle
VI) is resolved via a proper amendment, not an exception. Two additions
beyond the literal "restyle these screens" framing, both explicitly
requested/approved via spec.md's own Clarifications rather than assumed by
this plan: a new `components/ui/` subdirectory (a genuinely new
architectural layer for this codebase, justified by five-plus screens now
sharing one visual language — research R4), and the new `app/icon.svg`
asset (a deliberate, user-approved departure from the "no logo" convention,
flagged as such in the design handoff itself and confirmed with the user
directly — spec.md Clarifications).

## Progress Tracking

- [x] Technical Context filled
- [x] Constitution Check (pre-design) passed
- [x] Phase 0 research complete
- [x] Phase 1 data-model complete
- [x] Phase 1 contracts complete
- [x] Phase 1 quickstart complete
- [x] Constitution Check (post-design) passed
- [x] Agent context file updated
