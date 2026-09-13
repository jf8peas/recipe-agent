import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientId, jsonError } from "../../../../lib/api-helpers";
import { getPool } from "../../../../lib/db/pool";
import { insertSession } from "../../../../lib/db/sessions";
import { insertBranch } from "../../../../lib/db/branches";
import { recordUsageEvent, countClientEvents, countGlobalStageEvents } from "../../../../lib/db/usage";
import { checkRateLimit, checkDailyClientCap, checkGlobalCap } from "../../../../lib/limits";
import { ConstraintsSchema, INITIAL_STATE, toRawIngredient } from "../../../../lib/agent/state";
import { getGraph } from "../../../../lib/agent/runtime";
import { mintSessionId, mintThreadId } from "../../../../lib/ids";
import { buildTimeline } from "../../../../lib/history";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  ingredients: z.array(z.string().min(1)),
  constraints: ConstraintsSchema.partial().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const clientId = getClientId(request);
  if (!clientId) return jsonError(401, "missing-client-id", "X-Client-Id header is required.");

  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(400, "invalid-request", "Request body did not match the expected shape.");
  }

  const { ingredients } = body.data;
  const maxIngredients = Number(process.env.MAX_INGREDIENTS ?? 50);
  if (ingredients.length === 0) {
    return jsonError(400, "no-ingredients", "Enter at least one ingredient.");
  }
  if (ingredients.length > maxIngredients) {
    return jsonError(
      400,
      "too-many-ingredients",
      `Enter at most ${maxIngredients} ingredients.`,
      { max: maxIngredients },
    );
  }

  const pool = getPool();
  const rateWindowSeconds = Number(process.env.RATE_WINDOW_SECONDS ?? 60);
  const [windowCount, dailyClientCount, dailyGlobalCount] = await Promise.all([
    countClientEvents(clientId, rateWindowSeconds, pool),
    countClientEvents(clientId, 86400, pool),
    countGlobalStageEvents(86400, pool),
  ]);

  const rejection =
    checkRateLimit(windowCount, Number(process.env.RATE_MAX_PER_WINDOW ?? 8), rateWindowSeconds) ??
    checkDailyClientCap(dailyClientCount, Number(process.env.DAILY_STAGES_PER_CLIENT ?? 200)) ??
    checkGlobalCap(dailyGlobalCount, Number(process.env.DAILY_STAGES_GLOBAL ?? 2000));

  if (rejection) {
    await recordUsageEvent({ clientId, kind: "rejected-limit" }, pool);
    return NextResponse.json(rejection, { status: 429 });
  }

  const sessionId = mintSessionId();
  const threadId = mintThreadId();

  await insertSession({ sessionId, clientId, rootThreadId: threadId }, pool);
  await insertBranch({ threadId, sessionId }, pool);

  const graph = getGraph();
  const config = { configurable: { thread_id: threadId } };
  const seed = {
    ...INITIAL_STATE,
    ingredients: ingredients.map(toRawIngredient),
    constraints: { ...INITIAL_STATE.constraints, ...body.data.constraints },
  };
  const state = await graph.invoke(seed, { ...config, signal: request.signal });

  await recordUsageEvent({ clientId, threadId, kind: "start" }, pool);

  const snapshot = await graph.getState(config);
  const timeline = await buildTimeline(graph, [
    { thread_id: threadId, session_id: sessionId, parent_thread_id: null, forked_from_checkpoint_id: null, created_at: new Date() },
  ]);

  return NextResponse.json({
    sessionId,
    branchId: threadId,
    checkpointId: snapshot.config.configurable?.checkpoint_id,
    state,
    next: snapshot.next,
    timeline,
  });
}
