# Implementation Plan: About Page Redesign

**Feature Directory**: `specs/004-about-page-redesign`
**Created**: 2026-09-18
**Status**: Draft
**Spec**: [spec.md](spec.md)
**Input**: Replace the five-slide "About This App" experience (spec 002)
with a single, full-scrolling reference page — same header entry point,
same full-page-overlay presentation, no pagination, a sticky topic nav
instead — with content, section order, and diagrams matching
`design/v002/about.html` exactly in substance.

## Summary

A full content and presentation replacement of spec 002's slideshow, not an
incremental change: `components/AboutSlideshow.tsx` and its 5-slide
`lib/about-content.ts` are deleted and rebuilt as a new
`components/about/` subsystem (four files) plus a fully rewritten
`lib/about-content.ts` (section-shaped, not slide-shaped). The overlay's
non-pagination mechanics (dialog semantics, focus-restore, Tab trap) carry
over from the current component largely unchanged; everything specific to
slide-by-slide navigation is dropped. Three diagrams are ported as inline
SVG using the app's own already-established technique (spec 002's
`ArchitectureDiagram`), not re-derived from the mockup's raw markup. Two new
design tokens (a hero and a section-heading type size) are added to
`app/tokens.css` itself, not hardcoded locally, per constitution Principle
VI. `public/about.html` (a dead, unreferenced duplicate of the design
mockup, confirmed via `diff`) is deleted as cleanup. No new dependency, no
new route, no database change.

## Technical Context

**Language / Runtime**: TypeScript, Node.js (existing toolchain — no
change; this feature ships no server/route code).
**Framework**: React components under Next.js App Router — no Route
Handler touched.
**Primary Dependencies**: None new. Inline SVG and `color-mix()` are native
browser/CSS features, not dependencies (research R2, R6).
**Storage**: None — no graph state, no database table, no migration.
**External Services**: None new — the author's LinkedIn link and a new
outbound GitHub repo link are both plain anchors.
**Testing**: Playwright only (`tests/e2e/about-page.spec.ts`, new file,
replacing `tests/e2e/about-slideshow.spec.ts` — research R9) — no unit test
file, matching spec 002's own convention for a presentational-only
component.
**Target Platform**: Unchanged — same Vercel deployment, same evergreen-
browser target (research R2's `color-mix()` support check).
**Performance Goals**: None beyond spec SC-001 (every topic reachable by
scrolling once) — all content is static and bundled, no network round trip
on open.
**Constraints**: No new dependency (Principle I); every new visual value
resolves through `app/tokens.css` (Principle VI, research R2); no Edge-
runtime concern (nothing here touches Postgres or LangGraph).
**Scale/Scope**: 1 file deleted (`components/AboutSlideshow.tsx`), 1 file
rewritten (`lib/about-content.ts`), 4 new files (`components/about/`), 1
file deleted (`public/about.html`), 1 file modified (`components/
AppHeader.tsx`, import/name only), 2 new design tokens, 1 test file
replaced, 1 small README.md wording fix.

No unresolved NEEDS CLARIFICATION — spec.md's own Clarifications session
resolved the one genuine open question (the agent-graph diagram's narrow-
viewport legibility, now FR-021a); research.md Phase 0 resolves every
remaining implementation-detail question the planning request itself posed
(content-module-vs-TSX, topic-nav scroll/focus mechanism) plus two findings
the request didn't anticipate (the two-new-tokens question, and confirming
`public/about.html`'s exact disposition via `diff`).

## Constitution Check

*Gate: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I. Fixed Technology Stack | PASS | No dependency added or substituted. Inline SVG, `color-mix()`, and native anchor-link navigation are all standard browser/CSS features already available, not new tooling. |
| II. Schema-Validated Graph State | N/A | No graph state channel touched. |
| III. Node.js Serverless Runtime Discipline | N/A | No API route added, modified, or (despite `public/about.html`'s deletion) newly exposed — that file was never a route handler, just an auto-served static asset being removed. |
| IV. Time-Travel State Integrity | N/A | No checkpoint, thread, or branch touched. |
| V. Client-Driven Step Execution | N/A | No step/invoke call added. |
| VI. Session & UI Boundaries | PASS | No auth/sharing change. Every new visual value (including the two new type-scale sizes) resolves through `app/tokens.css` — the mockup's own local token re-declaration is explicitly *not* carried over, precisely to keep this constitutional (research R2). The three-panel session layout doesn't apply here — this overlay is global chrome, the same category as the header and the feature it replaces, neither of which lives inside that structure either (matches spec 002's own precedent). |

**Result**: PASS — no deviations requiring justification.

## Project Structure

```
app/
  tokens.css                    # MODIFIED — add --text-2xl, --text-3xl (research R2)
components/
  AboutSlideshow.tsx             # DELETED — replaced by components/about/
  AppHeader.tsx                  # MODIFIED — import path + component name only;
                                  #   `isAboutOpen` state and `open`/`onClose` props unchanged
  about/
    AboutPage.tsx                 # NEW — overlay shell: dialog semantics, focus
                                   #   management, Tab trap (carried over from
                                   #   AboutSlideshow.tsx), sticky header + topic nav
                                   #   + "Return to App", renders every section in order
    sections.tsx                  # NEW — ~15 section components
    diagrams.tsx                  # NEW — TimeTravelDiagram, AgentGraphDiagram,
                                   #   StatePersistenceDiagram (inline SVG, research R6)
    shared.ts                     # NEW — reusable style-object helpers (cardStyle,
                                   #   gridStyle, calloutStyle, badgeStyle, tableStyle)
lib/
  about-content.ts                # REWRITTEN — section-shaped exports replace the
                                   #   5-slide model (research R4, data-model.md § 1)
public/
  about.html                      # DELETED — dead duplicate of design/v002/about.html (research R1)
tests/e2e/
  about-slideshow.spec.ts         # DELETED
  about-page.spec.ts              # NEW — full rewrite against the new structure (research R9)
README.md                         # MODIFIED — one-word fix in "In the app" (research R10)
```

`design/v002/about.html` is **not** touched — it stays as the (unrouted)
design-reference artifact this feature was built from (research R1).

## Phase 0: Research

See [research.md](research.md). Covers: confirming `public/about.html`'s
exact disposition (R1), the two new design tokens and why they belong in
`app/tokens.css` itself (R2), the new `components/about/` subdirectory and
why this feature's scope crosses the threshold spec 002 explicitly stayed
under (R3), keeping a restructured content data module (R4), the topic-nav
scroll+focus mechanism with no scroll-spy (R5), porting the diagrams via
the app's own already-established inline-SVG and bounded-scroll-container
techniques rather than the mockup's raw markup (R6), an itemized carry-
over/drop/add table for the overlay shell (R7), verification of every
technical claim in the mockup against the real code — all confirmed
accurate, no corrections needed this time (R8), the test file's rename (R9),
and the small `README.md` propagation fix (R10).

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — the rewritten content module's shape
  (per-section, not per-slide) and the component's (much smaller) local UI
  state.
- [contracts/about-page-ui.md](contracts/about-page-ui.md) — `AboutPage`'s
  prop contract and behavioral guarantees, in place of an API contract (no
  HTTP surface exists to change).
- [quickstart.md](quickstart.md) — manual verification flow for all three
  user stories, plus the automated test command.

## Constitution Check (post-design)

Re-evaluated after Phase 1 — unchanged from pre-design; no new principle
implicated by the data model or contract. Still **PASS**.

## Complexity Tracking

No constitution deviation. One addition beyond the literal planning
request, required to keep the mockup's own visual hierarchy without
violating Principle VI: two new tokens added to `app/tokens.css` itself
(research R2) rather than hardcoded locally the way the standalone mockup
necessarily did. One structural decision the request explicitly deferred to
this plan: a new `components/about/` subdirectory (research R3), reversing
spec 002's earlier "stay flat" call — justified by this feature's
significantly larger scope, not by inconsistency with that earlier
decision's own reasoning.

## Progress Tracking

- [x] Technical Context filled
- [x] Constitution Check (pre-design) passed
- [x] Phase 0 research complete
- [x] Phase 1 data-model complete
- [x] Phase 1 contracts complete
- [x] Phase 1 quickstart complete
- [x] Constitution Check (post-design) passed
- [x] Agent context file updated
