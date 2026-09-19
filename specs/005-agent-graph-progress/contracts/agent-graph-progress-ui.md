# UI Contract: `AgentGraphProgress`

No API route changes in this feature (research R6) — same reasoning as
specs 002/004's own UI contracts. This documents the component's prop
contract and behavioral guarantees in place of an API contract.

## Component props

```ts
interface AgentGraphProgressProps {
  timeline: TimelineEntry[];
  branchId: string;
  next: string[];
  outcome: State["outcome"];
  checkpointId: string;
}
```

Replaces `StageProgressProps { next: string[]; outcome: string }` at its
exact call site in `app/page.tsx` (research R7) — a strict superset (two new
required props, `outcome` narrowed to the real `State["outcome"]` union
instead of a bare `string`).

## Behavioral guarantees

| Guarantee | Spec ref |
|---|---|
| Every one of the 8 graph nodes (including `ingredientError`, absent from the replaced component) is rendered. | FR-001 |
| Both decision points render as a shape distinct from plain nodes (a diamond), matching `design/v002/about.html`'s vocabulary. | FR-002 |
| The `refine` → `critique` loop-back connection renders. | FR-003 |
| Every node/edge shows exactly one of four states — taken, current, not-yet-reached, untaken — never ambiguous between them. | FR-004, FR-007 |
| An `ingredient-error` outcome shows only `parseIngredients` → `ingredientError` as taken; zero of the seven main-path nodes show as taken. | FR-005 |
| A `refine` cycle (one or more) shows the loop as taken; its absence shows the loop as not taken — a simple binary, no cycle count (Clarifications). | FR-006 |
| At most one node is marked current; a terminal outcome (`finalized`/`ingredient-error`) marks none. | FR-008 |
| Rendered as one self-contained `<svg>` — every shape/connector/label together, no separate positioned overlay. | FR-009 |
| Every visual value resolves through `app/tokens.css`; matches light/dark automatically. | FR-010 |
| Sized to sit inline in the running-session view, not a large standalone section (a `560×190` viewBox vs. the About page's `950×230` — research R3). | FR-011 |
| A visually-hidden text summary states which node is current. | FR-012 |
| That same summary states which path was taken so far. | FR-013 |
| Zero critical/serious axe-core violations. | FR-014 |

## DOM structure (informative — exact markup may vary as long as the contract above holds)

```
<div> <!-- optionally the bounded-scroll wrapper at narrow viewports -->
  <p class="visually-hidden">
    Progress: parseIngredients, proposeDirections, and selectDirection are
    done. draftRecipe is the current stage. critique, refine, and finalize
    are not yet reached. The ingredient-error path was not taken.
  </p>
  <svg aria-hidden="true" viewBox="0 0 560 190">
    <!-- 8 nodes + 2 diamonds + edges, each carrying its own taken/current/
         not-yet-reached/untaken styling -->
  </svg>
</div>
```

## Test surface

`tests/unit/graph-progress.test.ts` (the pure `deriveRunPath` function) and
`tests/e2e/agent-graph-progress.spec.ts` (new — research R8) — no dedicated
component-render test, matching this project's established pattern of
testing presentational components only through Playwright, with pure logic
tested directly via Vitest.
