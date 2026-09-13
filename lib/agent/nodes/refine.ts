import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createChatModel, MODELS } from "../models";
import { refinePrompt } from "../prompts";
import { RecipeDraftSchema, type State } from "../state";

const OutputSchema = z.object({ recipeDraft: RecipeDraftSchema });

export async function refine(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const model = createChatModel(MODELS.default).withStructuredOutput(OutputSchema, {
    name: "refine",
  });
  const latestCritique = state.critiques[state.critiques.length - 1];
  const result = await model.invoke(refinePrompt(state.recipeDraft, latestCritique), config);
  return {
    recipeDraft: OutputSchema.parse(result).recipeDraft,
    refineCount: state.refineCount + 1,
  };
}
