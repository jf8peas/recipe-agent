# Implementation Plan: About This App Slideshow

**Feature Directory**: `specs/002-about-app-slideshow`
**Created**: 2026-09-16
**Status**: Draft
**Spec**: [spec.md](spec.md)
**Input**: Add a 5-slide "About This App" architecture slideshow, opened from
the header as a full-page overlay (Author Profile, Tech Stack, Database &
State Persistence, Repository Structure, Execution Flow), with Next/Previous/
Return controls, keyboard navigation, focus management, ARIA live
announcements, and responsive layout down to phone width.

## Summary

A new client-only component, `AboutSlideshow`, mounted and toggled from the
existing `AppHeader`, renders a full-viewport overlay covering the entire app
(header included) with five static, content-rich slides walking a reader
through the app's own architecture — including the deeper "why" behind
connection pooling, last-value-wins state channels, step-wise execution, and
cross-branch tree reconstruction, per spec FR-011. No new API route, no new
dependency, no database or graph-state change — this is presentational
chrome layered over the existing app, styled with the project's existing
design tokens and hand-rolled the same way `BranchTimeline`'s keyboard
navigation already is.

## Technical Context

**Language / Runtime**: TypeScript, Node.js (existing project toolchain — no
change; this feature ships no server code).
**Framework**: Next.js App Router — a new client component (`"use client"`),
no new route/Route Handler.
**Primary Dependencies**: React 19 only. No new package.
**Storage**: None — no new table, no graph-state channel.
**External Services**: None new — the author's LinkedIn URL is a plain
outbound `<a>` link (already present in `AppHeader.tsx`, reused).
**Testing**: Playwright + `@axe-core/playwright` (existing devDependencies),
new spec `tests/e2e/about-slideshow.spec.ts` following the established
`tests/e2e/us*-*.spec.ts` pattern. No new unit-test file — see research.md R6.
**Target Platform**: Same as the whole app — Vercel, evergreen browsers, from
320px through 1920px viewport widths (spec SC-004).
**Performance Goals**: None beyond spec SC-001 (discoverable within 5s) — all
content is static and bundled, no network round-trip on open.
**Constraints**: No new dependency (constitution Principle I's Fixed
Technology Stack); all visual values from `app/tokens.css` (Principle VI); no
Edge runtime concern (nothing here touches Postgres or LangGraph).
**Scale/Scope**: 2 new files, 1 modified file, 1 new e2e spec, 1 new design
token. Fixed at 5 slides (spec Out of Scope: no runtime slide
add/remove/reorder).

No unresolved NEEDS CLARIFICATION — the spec's own Clarifications session
resolved the two items that would otherwise have landed here (overlay style,
bio length); research.md Phase 0 resolves the remaining implementation-detail
discrepancies against the planning request (styling approach, file layout,
model-name accuracy, `interruptAfter` accuracy, testing strategy).

## Constitution Check

*Gate: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I. Fixed Technology Stack | PASS | No dependency added or substituted. No model call, no LangGraph usage, no persistence. Slide 2's content names the stack for the *reader's* benefit as documentation copy — it doesn't add or bypass any of it in code. |
| II. Schema-Validated Graph State | N/A | No graph state channel added. |
| III. Node.js Serverless Runtime Discipline | N/A | No API route added. Slide content correctly *describes* this principle to readers (research R7) but doesn't need to comply with it itself — there's no route here to set `runtime`/`maxDuration` on. |
| IV. Time-Travel State Integrity | N/A | No checkpoint, thread, or branch touched. Slide 3/5 content must accurately *describe* the one-thread-per-branch rule (research R7) — verified against the actual constitution text and `lib/fork-replay.ts`, not restated from memory. |
| V. Client-Driven Step Execution | N/A | No step/invoke call added. |
| VI. Session & UI Boundaries | PASS | No auth/sharing mechanism added (spec Assumptions: no access restriction, consistent with the existing no-auth model). All new styling uses `app/tokens.css` values — one new token (`--z-overlay`) added there rather than hard-coded, since this is genuinely the first stacking-order value the app needs (research R5). The fixed three-panel session layout (left timeline / center state / right actions) doesn't apply here — this overlay is global chrome, the same category as the existing header, entry form, and session list, none of which live inside that three-panel structure either. |

**Result**: PASS — no deviations requiring justification.

## Project Structure

```
components/
  AppHeader.tsx          # MODIFIED — add "About This App" trigger + open state
  AboutSlideshow.tsx      # NEW — overlay shell, 5 slides, focus trap, keyboard nav, ARIA live region
lib/
  about-content.ts        # NEW — static slide copy (bio, tech stack, persistence, directory tree, execution stages)
app/
  tokens.css              # MODIFIED — add --z-overlay
tests/e2e/
  about-slideshow.spec.ts # NEW — Playwright + axe-core, covers US1–US3
```

## Phase 0: Research

See [research.md](research.md). Covers: styling approach (R1), file
placement (R2), Slide 2's model-description accuracy (R3), Slide 5's
`interruptAfter` accuracy (R4), overlay/focus-trap mechanics without a new
dependency (R5), testing strategy (R6), and the verified technical facts
FR-011's deep-dive content must stay faithful to (R7).

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — the slide-content module's shape and the
  component's local UI state/transitions (no graph state or DB table
  involved).
- [contracts/about-slideshow-ui.md](contracts/about-slideshow-ui.md) — the
  `AboutSlideshow` component's prop contract and behavioral guarantees, in
  place of an API contract (this feature has no endpoint).
- [quickstart.md](quickstart.md) — manual verification flow for all three
  user stories, plus the automated Playwright command.

## Constitution Check (post-design)

Re-evaluated after Phase 1 — unchanged from pre-design; no new principle
implicated by the data model or contract. Still **PASS**.

## Complexity Tracking

No constitution deviation. Two items diverge from the literal planning
request but are corrections *toward* the constitution/existing conventions,
not deviations from it — recorded in full in research.md rather than here:

- Styling via inline `style` + design tokens instead of Tailwind (R1) — the
  simpler alternative *is* what's being kept; Tailwind was the rejected
  addition.
- Flat `components/`/`lib/` file placement instead of new `components/about/`
  and `components/layout/` subdirectories (R2) — same reasoning.

## Progress Tracking

- [x] Technical Context filled
- [x] Constitution Check (pre-design) passed
- [x] Phase 0 research complete
- [x] Phase 1 data-model complete
- [x] Phase 1 contracts complete
- [x] Phase 1 quickstart complete
- [x] Constitution Check (post-design) passed
- [x] Agent context file updated
