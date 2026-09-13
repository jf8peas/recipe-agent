import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createChatModel, MODELS } from "../models";
import { finalizePrompt } from "../prompts";
import { FinalRecipeSchema, type State } from "../state";

const OutputSchema = z.object({ finalRecipe: FinalRecipeSchema });

export async function finalize(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const model = createChatModel(MODELS.default).withStructuredOutput(OutputSchema, {
    name: "finalize",
  });
  const result = await model.invoke(finalizePrompt(state.recipeDraft, state.constraints), config);
  return { finalRecipe: OutputSchema.parse(result).finalRecipe, outcome: "finalized" };
}
