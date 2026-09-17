import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createChatModel, MODELS } from "../models";
import { draftRecipePrompt } from "../prompts";
import { RecipeDraftSchema, type State } from "../state";

const OutputSchema = z.object({ recipeDraft: RecipeDraftSchema });

export async function draftRecipe(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const model = createChatModel(MODELS.default).withStructuredOutput(OutputSchema, {
    name: "draftRecipe",
  });
  const result = await model.invoke(
    draftRecipePrompt(
      state.ingredients,
      state.constraints,
      state.directions,
      state.directionSelection,
    ),
    config,
  );
  return { recipeDraft: OutputSchema.parse(result).recipeDraft };
}
