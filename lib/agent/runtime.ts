import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool } from "../db/pool";
import { buildGraph, NODE_NAMES } from "./graph";

type CompiledRecipeGraph = ReturnType<ReturnType<typeof buildGraph>["compile"]>;

const g = globalThis as unknown as { __recipeGraph?: CompiledRecipeGraph };

/**
 * Compiled-graph singleton (constitution Principle III, research R7): built
 * once per lambda instance (cached on `globalThis` to survive Next.js dev
 * HMR), reusing the shared `pg.Pool` for its `PostgresSaver` rather than
 * opening a second connection pool.
 */
export function getGraph(): CompiledRecipeGraph {
  if (!g.__recipeGraph) {
    const checkpointer = new PostgresSaver(getPool());
    g.__recipeGraph = buildGraph().compile({
      checkpointer,
      interruptAfter: [...NODE_NAMES],
    });
  }
  return g.__recipeGraph;
}
