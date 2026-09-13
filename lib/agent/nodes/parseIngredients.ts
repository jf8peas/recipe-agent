import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createChatModel, MODELS } from "../models";
import { parseIngredientsPrompt } from "../prompts";
import { IngredientSchema, type State } from "../state";

const OutputSchema = z.object({ ingredients: z.array(IngredientSchema) });

export async function parseIngredients(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const model = createChatModel(MODELS.default).withStructuredOutput(OutputSchema, {
    name: "parseIngredients",
  });
  const result = await model.invoke(
    parseIngredientsPrompt(state.ingredients, state.constraints),
    config,
  );
  return { ingredients: OutputSchema.parse(result).ingredients };
}
