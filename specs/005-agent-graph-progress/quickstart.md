# Quickstart: Agent Graph Progress Diagram

No new environment variable, dependency, or migration. Follow
[specs/001-recipe-agent/quickstart.md](../001-recipe-agent/quickstart.md) for
initial project setup if you haven't already.

## Run it

```bash
npm run dev
```

## Primary flow (manual verification)

1. Start a new session with a normal ingredient list — confirm the diagram
   shows `parseIngredients` as current, nothing taken, before the first step.
2. Step through `parseIngredients` — confirm `parseIngredients` becomes
   taken and `proposeDirections` becomes current; the `ingredientError`
   side of the decision reads as untaken (dashed, `✕`), not "not yet
   reached."
3. Continue stepping through `proposeDirections`, `selectDirection`,
   `draftRecipe`, `critique` — confirm each becomes taken in turn and the
   next one becomes current, matching the running session's own "Step
   (stageName)" button label at every point.
4. If `critique` routes to `refine`, confirm the loop-back connection and
   `refine` show as taken once you step through it, and that stepping back
   into `critique` a second time doesn't duplicate or reset anything.
5. Finish the run — confirm no node is marked current, and every node on
   the actual path taken (including a revision loop, if one happened) is
   marked taken.

## Ingredient-error flow

1. Start a session with an ingredient the fake/real model would mark
   unusable (e.g. `"rock"` under the e2e fixture — `lib/agent/fake-model.ts`).
2. Step through `parseIngredients` — confirm the diagram shows exactly
   `parseIngredients` → `ingredientError` as taken, nothing else, and the
   `proposeDirections` side (and everything downstream of it) reads as
   untaken, not "not yet reached."

## Keyboard + screen reader pass

1. With a screen reader running, reach the diagram without looking at the
   screen — confirm you can determine the current stage and which path was
   taken from the text alone (the `<svg>` itself is `aria-hidden`).
2. Confirm advancing a stage doesn't produce a duplicate announcement
   alongside the existing "Running `<stage>`…" live region.

## Diagram + responsive pass

1. Resize down to ~320px width — confirm the diagram stays legible, either
   fitting directly or scrolling within its own bounded region, and the
   page itself never scrolls sideways.
2. Toggle light/dark mode — confirm the diagram re-themes with no
   unstyled-looking element.

## Automated checks

```bash
npx vitest run tests/unit/graph-progress.test.ts
npx playwright test tests/e2e/agent-graph-progress.spec.ts
```
