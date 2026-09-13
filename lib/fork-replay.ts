import { START } from "@langchain/langgraph";
import type { State } from "./agent/state";
import type { buildGraph } from "./agent/graph";

type CompiledRecipeGraph = ReturnType<ReturnType<typeof buildGraph>["compile"]>;

export interface ForkReplayParams {
  sourceThreadId: string;
  /** The checkpoint the user is forking from — becomes the replay's final,
   * patched step (research R3 step 3/5; contracts/api.md `/fork`). */
  checkpointId: string;
  newThreadId: string;
  patch: Partial<State>;
}

export interface ForkReplayResult {
  checkpointId: string;
  state: State;
  next: string[];
}

/**
 * Seeds a brand-new LangGraph thread by replaying `sourceThreadId`'s history
 * up to `checkpointId`, applying `patch` as the final step — never
 * `updateState` on an already-branched source checkpoint (constitution
 * v3.0.0, research R3; confirmed safe by the T016 spike since every call here
 * targets the new thread's own always-childless tip). No model calls.
 */
export async function forkReplay(
  app: CompiledRecipeGraph,
  params: ForkReplayParams,
): Promise<ForkReplayResult> {
  const { sourceThreadId, checkpointId, newThreadId, patch } = params;

  const history: { values: State; next: string[]; checkpointId: string }[] = [];
  for await (const snapshot of app.getStateHistory({
    configurable: { thread_id: sourceThreadId },
  })) {
    history.push({
      values: snapshot.values as State,
      next: snapshot.next,
      checkpointId: (snapshot.config.configurable as { checkpoint_id: string }).checkpoint_id,
    });
  }
  history.reverse(); // oldest-first

  const cutoff = history.findIndex((entry) => entry.checkpointId === checkpointId);
  if (cutoff === -1) {
    throw new Error(`checkpoint ${checkpointId} not found on thread ${sourceThreadId}`);
  }

  const newConfig = { configurable: { thread_id: newThreadId } };

  if (cutoff === 0) {
    // The fork point is the genesis checkpoint itself (before any node ran) —
    // e.g. correcting `ingredients` after an ingredient-error. No prior
    // stages to replay; seed the fresh thread directly with the patch.
    const tip = await app.updateState(newConfig, { ...history[0]!.values, ...patch }, START);
    return finalStateOf(app, tip);
  }

  // Replay every stage strictly before the fork point, exactly as recorded.
  // The stage that produced history[i] is whatever the PREVIOUS checkpoint's
  // `next` named (there is no `next`-independent "producing stage" field on
  // a StateSnapshot in this LangGraph version).
  let tip = await app.updateState(newConfig, history[0]!.values, START);
  for (let i = 1; i < cutoff; i += 1) {
    const stageName = history[i - 1]!.next[0]!;
    tip = await app.updateState(tip, history[i]!.values, stageName);
  }

  // Final step: the fork-point checkpoint's own recorded values, patched —
  // attributed to the same stage that originally produced it, so the new
  // thread's tip ends up with `next` computed from the (now edited) state.
  const finalStageName = history[cutoff - 1]!.next[0]!;
  tip = await app.updateState(tip, { ...history[cutoff]!.values, ...patch }, finalStageName);

  return finalStateOf(app, tip);
}

async function finalStateOf(
  app: CompiledRecipeGraph,
  config: Awaited<ReturnType<CompiledRecipeGraph["updateState"]>>,
): Promise<ForkReplayResult> {
  const snapshot = await app.getState(config);
  return {
    checkpointId: (snapshot.config.configurable as { checkpoint_id: string }).checkpoint_id,
    state: snapshot.values as State,
    next: snapshot.next,
  };
}
