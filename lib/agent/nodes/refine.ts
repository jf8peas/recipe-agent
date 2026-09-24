import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { requestDeadline } from "../deadline";
import { createChatModel, MODELS } from "../models";
import { refinePrompt } from "../prompts";
import { RecipeDraftSchema, type State } from "../state";

const OutputSchema = z.object({ recipeDraft: RecipeDraftSchema });

export async function refine(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const { timeoutMs, signal } = requestDeadline(config);
  const model = createChatModel(MODELS.default, { timeoutMs }).withStructuredOutput(OutputSchema, {
    name: "refine",
  });
  const latestCritique = state.critiques[state.critiques.length - 1];
  const startedAt = Date.now();
  let result: unknown;
  try {
    result = await model.invoke(refinePrompt(state.recipeDraft, latestCritique), { ...config, signal });
  } catch (err) {
    console.error(
      `[refine] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    throw err;
  }
  return {
    recipeDraft: OutputSchema.parse(result).recipeDraft,
    refineCount: state.refineCount + 1,
  };
}
