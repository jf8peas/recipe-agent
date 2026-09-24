import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { requestDeadline } from "../deadline";
import { createChatModel, MODELS } from "../models";
import { critiquePrompt } from "../prompts";
import { CritiqueSchema, type State } from "../state";

const OutputSchema = z.object({ critique: CritiqueSchema.omit({ cycle: true }) });

/** Appends to `critiques` by returning the full new array — not a reducer (data-model.md § 1). */
export async function critique(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const { timeoutMs, signal } = requestDeadline(config);
  const model = createChatModel(MODELS.critique, { timeoutMs }).withStructuredOutput(OutputSchema, {
    name: "critique",
  });
  const startedAt = Date.now();
  let result: unknown;
  try {
    result = await model.invoke(
      critiquePrompt(state.recipeDraft, state.constraints, state.critiques),
      { ...config, signal },
    );
  } catch (err) {
    console.error(
      `[critique] failed after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    throw err;
  }
  const { critique: newCritique } = OutputSchema.parse(result);
  return { critiques: [...state.critiques, { ...newCritique, cycle: state.critiques.length + 1 }] };
}
