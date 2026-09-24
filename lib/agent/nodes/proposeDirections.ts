import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { requestDeadline } from "../deadline";
import { createChatModel, MODELS } from "../models";
import { proposeDirectionsPrompt } from "../prompts";
import { DishDirectionSchema, type State } from "../state";

const OutputSchema = z.object({ directions: z.array(DishDirectionSchema).min(2).max(3) });

export async function proposeDirections(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const { timeoutMs, signal } = requestDeadline(config);
  const model = createChatModel(MODELS.default, { timeoutMs }).withStructuredOutput(OutputSchema, {
    name: "proposeDirections",
  });
  const startedAt = Date.now();
  let result: unknown;
  try {
    result = await model.invoke(proposeDirectionsPrompt(state.ingredients, state.constraints), {
      ...config,
      signal,
    });
  } catch (err) {
    console.error(
      `[proposeDirections] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    throw err;
  }
  return { directions: OutputSchema.parse(result).directions };
}
