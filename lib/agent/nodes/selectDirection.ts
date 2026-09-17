import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createChatModel, MODELS } from "../models";
import { selectDirectionPrompt } from "../prompts";
import { DirectionSelectionSchema, type State } from "../state";

const OutputSchema = z.object({ directionSelection: DirectionSelectionSchema });

/**
 * Judges the candidate directions `proposeDirections` produced and records
 * which one drafting should use (spec 003, mirrors `critique`'s shape).
 * Uses `MODELS.default` — the same tier `proposeDirections` already uses,
 * not `MODELS.critique` (research R5): judging which idea to pursue is a
 * lighter task than critiquing a finished draft.
 */
export async function selectDirection(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  // Nothing to judge between with only one candidate — trivially select it
  // without a model call (spec FR-015, research R6).
  if (state.directions.length === 1) {
    return {
      directionSelection: {
        selectedIndex: 0,
        explanation: "Only one direction was proposed, so it was used.",
        clearFavorite: true,
      },
    };
  }

  const model = createChatModel(MODELS.default).withStructuredOutput(OutputSchema, {
    name: "selectDirection",
  });
  const result = await model.invoke(
    selectDirectionPrompt(state.ingredients, state.directions, state.constraints),
    config,
  );
  return { directionSelection: OutputSchema.parse(result).directionSelection };
}
