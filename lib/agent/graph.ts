import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState } from "./state";
import { parseIngredients } from "./nodes/parseIngredients";
import { ingredientError } from "./nodes/ingredientError";
import { proposeDirections } from "./nodes/proposeDirections";
import { draftRecipe } from "./nodes/draftRecipe";
import { critique } from "./nodes/critique";
import { refine } from "./nodes/refine";
import { finalize } from "./nodes/finalize";
import { routeAfterParseIngredients, routeAfterCritique } from "./edges";

const NODE_NAMES = [
  "parseIngredients",
  "ingredientError",
  "proposeDirections",
  "draftRecipe",
  "critique",
  "refine",
  "finalize",
] as const;

/**
 * Builds (uncompiled) the recipe graph. Kept separate from `runtime.ts`'s
 * singleton so tests can compile it with a different checkpointer/model
 * (e.g. `MemorySaver` + `FakeChatModel`) without touching the app's runtime.
 */
export function buildGraph() {
  const graph = new StateGraph(GraphState)
    .addNode("parseIngredients", parseIngredients)
    .addNode("ingredientError", ingredientError)
    .addNode("proposeDirections", proposeDirections)
    .addNode("draftRecipe", draftRecipe)
    .addNode("critique", critique)
    .addNode("refine", refine)
    .addNode("finalize", finalize)
    .addEdge(START, "parseIngredients")
    .addConditionalEdges("parseIngredients", routeAfterParseIngredients, [
      "ingredientError",
      "proposeDirections",
    ])
    .addEdge("ingredientError", END)
    .addEdge("proposeDirections", "draftRecipe")
    .addEdge("draftRecipe", "critique")
    .addConditionalEdges("critique", routeAfterCritique, ["refine", "finalize"])
    .addEdge("refine", "critique")
    .addEdge("finalize", END);

  return graph;
}

export { NODE_NAMES };
