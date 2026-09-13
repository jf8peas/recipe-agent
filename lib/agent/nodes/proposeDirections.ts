import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createChatModel, MODELS } from "../models";
import { proposeDirectionsPrompt } from "../prompts";
import { DishDirectionSchema, type State } from "../state";

const OutputSchema = z.object({ directions: z.array(DishDirectionSchema).min(2).max(3) });

export async function proposeDirections(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const model = createChatModel(MODELS.default).withStructuredOutput(OutputSchema, {
    name: "proposeDirections",
  });
  const result = await model.invoke(
    proposeDirectionsPrompt(state.ingredients, state.constraints),
    config,
  );
  return { directions: OutputSchema.parse(result).directions };
}
