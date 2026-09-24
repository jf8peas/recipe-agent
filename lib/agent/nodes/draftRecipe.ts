import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { requestDeadline } from "../deadline";
import { createChatModel, MODELS } from "../models";
import { draftRecipePrompt } from "../prompts";
import { RecipeDraftSchema, type State } from "../state";

const OutputSchema = z.object({ recipeDraft: RecipeDraftSchema });

export async function draftRecipe(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const { timeoutMs, signal } = requestDeadline(config);
  const model = createChatModel(MODELS.default, { timeoutMs }).withStructuredOutput(OutputSchema, {
    name: "draftRecipe",
  });
  const startedAt = Date.now();
  let result: unknown;
  try {
    result = await model.invoke(
      draftRecipePrompt(
        state.ingredients,
        state.constraints,
        state.directions,
        state.directionSelection,
      ),
      { ...config, signal },
    );
  } catch (err) {
    console.error(
      `[draftRecipe] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    throw err;
  }
  return { recipeDraft: OutputSchema.parse(result).recipeDraft };
}
