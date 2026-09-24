import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { requestDeadline } from "../deadline";
import { createChatModel, MODELS } from "../models";
import { parseIngredientsPrompt } from "../prompts";
import { IngredientSchema, type State } from "../state";

const OutputSchema = z.object({ ingredients: z.array(IngredientSchema) });

export async function parseIngredients(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const { timeoutMs, signal } = requestDeadline(config);
  const model = createChatModel(MODELS.default, { timeoutMs }).withStructuredOutput(OutputSchema, {
    name: "parseIngredients",
  });
  const startedAt = Date.now();
  let result: unknown;
  try {
    result = await model.invoke(parseIngredientsPrompt(state.ingredients, state.constraints), {
      ...config,
      signal,
    });
  } catch (err) {
    console.error(
      `[parseIngredients] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    throw err;
  }
  return { ingredients: OutputSchema.parse(result).ingredients };
}
