import type { State } from "./agent/state";

/** The 4-way `kind` used by `/step`, `/step/commit` and `/state` responses
 * (contracts/api.md) — distinct from `TimelineEntry.kind` (lib/tree.ts),
 * which also has an `"in-progress"` value for mid-run leaf entries. */
export function stageKind(
  outcome: State["outcome"],
): "normal" | "finalized" | "ingredient-error" | "stage-failure" {
  if (outcome === "finalized") return "finalized";
  if (outcome === "ingredient-error") return "ingredient-error";
  if (outcome === "stage-failure") return "stage-failure";
  return "normal";
}
