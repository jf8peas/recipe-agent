import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import type {
  Ingredient,
  Constraints,
  DishDirection,
  DirectionSelection,
  RecipeDraft,
  Critique,
  FinalRecipe,
  Outcome,
} from "./state";
import { parseIngredients } from "./nodes/parseIngredients";
import { ingredientError } from "./nodes/ingredientError";
import { proposeDirections } from "./nodes/proposeDirections";
import { selectDirection } from "./nodes/selectDirection";
import { draftRecipe } from "./nodes/draftRecipe";
import { critique } from "./nodes/critique";
import { refine } from "./nodes/refine";
import { finalize } from "./nodes/finalize";
import { routeAfterParseIngredients, routeAfterCritique } from "./edges";

/** Every channel a plain last-value-wins Annotation (no reducers) so
 * `updateState` can overwrite any field on edit (constitution Principle IV,
 * spec FR-025). Lives here (not `./state`, a pure data/schema module client
 * components also import) since it's the only place `@langchain/langgraph`'s
 * `Annotation` is needed. */
const GraphState = Annotation.Root({
  ingredients: Annotation<Ingredient[]>(),
  constraints: Annotation<Constraints>(),
  directions: Annotation<DishDirection[]>(),
  directionSelection: Annotation<DirectionSelection | null>(),
  recipeDraft: Annotation<RecipeDraft | null>(),
  critiques: Annotation<Critique[]>(),
  finalRecipe: Annotation<FinalRecipe | null>(),
  refineCount: Annotation<number>(),
  outcome: Annotation<Outcome>(),
  failureReason: Annotation<string | null>(),
});

const NODE_NAMES = [
  "parseIngredients",
  "ingredientError",
  "proposeDirections",
  "selectDirection",
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
    .addNode("selectDirection", selectDirection)
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
    .addEdge("proposeDirections", "selectDirection")
    .addEdge("selectDirection", "draftRecipe")
    .addEdge("draftRecipe", "critique")
    .addConditionalEdges("critique", routeAfterCritique, ["refine", "finalize"])
    .addEdge("refine", "critique")
    .addEdge("finalize", END);

  return graph;
}

export { NODE_NAMES };
