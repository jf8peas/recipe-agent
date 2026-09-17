# Node Contract: `selectDirection`

This feature adds no new API route — `/state`, `/history`, `/step`, and
`/fork` all already return generic `State`/`TimelineEntry`-shaped payloads
that pick up the new channel and stage automatically (research R9). The only
new "interface" is this node's own input/output contract, documented here in
place of an API contract, the same way feature 002 substituted a UI contract
when it had no HTTP surface either.

## Signature

```ts
function selectDirection(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>>
```

Same signature shape as every other node (`lib/agent/nodes/critique.ts`,
`lib/agent/nodes/proposeDirections.ts`).

## Input (reads from `state`)

| Field | Used for |
|---|---|
| `state.directions` | The candidates to judge between |
| `state.constraints` | Context for the judgment (same constraints `proposeDirections` used to generate them) |
| `state.ingredients` | Cross-checking each candidate against what's actually available — also keeps `selectDirectionPrompt`'s rendered text consistent with every other stage's prompt (all list the usable ingredients), which is what lets the e2e fake-model's failure-sentinel convention (embedded as an ingredient line) reach this node too |

## Output

Always returns `{ directionSelection: DirectionSelection }` — never leaves
`directionSelection` unset on a successful run (research R1/R6). See
data-model.md § 1 for `DirectionSelection`'s shape.

## Behavioral guarantees

| Guarantee | Spec ref |
|---|---|
| When `state.directions.length === 1`, returns immediately with `selectedIndex: 0`, `clearFavorite: true`, and an explanation that says only one candidate existed — no model call. | FR-015, research R6 |
| Otherwise, invokes a structured-output model call (same model tier as `proposeDirections` — `MODELS.default`, not `MODELS.critique`) and validates the result against `DirectionSelectionSchema` before returning it. | FR-001, spec Assumptions |
| `clearFavorite: false` only when the model itself reports no candidate was clearly better — never inferred from validation trouble. A validation/parse/model failure is a **different** case: it propagates as a thrown error, which the existing step route turns into a `stage-failure` checkpoint (research R1) — it does **not** produce a `directionSelection` with `clearFavorite: false`. | FR-004, FR-011 |
| When `clearFavorite` is `false`, `explanation` plainly says the pick was a default among equivalent options — never phrased with the same confidence as a real judgment. | FR-005 |
| `selectedIndex` is always a valid index into `state.directions` as it stood when the node ran (`0 <= selectedIndex < state.directions.length`). | FR-001 |

## Downstream consumer

`draftRecipePrompt` (`lib/agent/prompts.ts`) resolves the direction to draft
from as `state.directions[state.directionSelection?.selectedIndex ?? 0]` —
the `?? 0` is a defensive fallback solely for a checkpoint that predates this
feature (`directionSelection` still `null`), per spec FR-014. It is not the
FR-004/FR-015 fallback path (those always populate `directionSelection`
first).

## Test surface

No dedicated unit test file — matches the existing convention (no other node
has one either; `proposeDirections`, `critique`, etc. are all covered only via
`tests/integration/graph.test.ts` and the `tests/contract/*.test.ts` files'
shared `queueResponse`/mocked-`createChatModel` fixture pattern). Coverage for
this node extends those same files (research R7 enumerates which ones).
