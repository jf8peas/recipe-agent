import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createChatModel, MODELS } from "../models";
import { critiquePrompt } from "../prompts";
import { CritiqueSchema, type State } from "../state";

const OutputSchema = z.object({ critique: CritiqueSchema.omit({ cycle: true }) });

/** Appends to `critiques` by returning the full new array — not a reducer (data-model.md § 1). */
export async function critique(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const model = createChatModel(MODELS.critique).withStructuredOutput(OutputSchema, {
    name: "critique",
  });
  const result = await model.invoke(
    critiquePrompt(state.recipeDraft, state.constraints, state.critiques),
    config,
  );
  const { critique: newCritique } = OutputSchema.parse(result);
  return { critiques: [...state.critiques, { ...newCritique, cycle: state.critiques.length + 1 }] };
}
