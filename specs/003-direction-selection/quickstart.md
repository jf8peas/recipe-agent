# Quickstart: Direction Selection Stage

No new environment variable, dependency, or migration — this feature only
changes the compiled graph's shape and a few TypeScript source files. Follow
[specs/001-recipe-agent/quickstart.md](../001-recipe-agent/quickstart.md) for
initial project setup if you haven't already.

## Run it

```bash
npm run dev
```

## Primary flow (manual verification)

1. Start a session with ingredients likely to produce clearly different
   directions (e.g. ingredients that fit both a quick stir-fry and a slow
   braise).
2. Step through `parseIngredients` and `proposeDirections` as normal.
3. Step once more — this now runs **`selectDirection`**, not `draftRecipe`.
   Confirm the state view shows a new "Direction selected" section: which
   candidate, a plain-language explanation, and whether it was a clear
   favorite or a default pick.
4. Step again — confirm `draftRecipe` drafts from the *selected* direction
   (check the draft's title/steps match that candidate, not necessarily the
   first-listed one).
5. Open the session's history — confirm the new step appears in its correct
   position, between "proposeDirections" and "draftRecipe" entries.

## Editing (Story 3)

1. On a run that has completed selection, edit the recorded selection (via
   the state panel) to point at a different candidate; continue the run.
   Confirm the draft now matches the newly-selected direction, and that no
   new model judgment call happened for selection itself (it wasn't re-run).
2. Separately, on a fresh run, edit the *candidate directions* themselves
   right after they're proposed, then continue. Confirm `selectDirection`
   runs (or re-runs) against the edited set.

## Edge cases to check by hand

- Ingredients/constraints deliberately unlikely to favor one direction over
  another (e.g. very generic ones) — confirm the run still completes, picks
  the first-listed candidate, and the explanation plainly says it was a
  default pick, not a confident one.
- Edit `directions` down to exactly one entry, continue — confirm selection
  is instant (no visible model-call delay) and the explanation says only one
  candidate existed.
- Edit `directions` down to zero entries and try to continue — confirm this
  is rejected the same way any other invalid edit is (inline error, edit
  blocked), not a stage failure.

## Automated checks

```bash
npx vitest run
npx playwright test
```

Both suites are extended by this feature (research R7 enumerates the
affected files) — no new test command.
