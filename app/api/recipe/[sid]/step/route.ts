import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientId, jsonError, requireOwnedSession } from "../../../../../lib/api-helpers";
import { getPool } from "../../../../../lib/db/pool";
import { incrementStageCount, updateSessionTitle } from "../../../../../lib/db/sessions";
import { titleForStage } from "../../../../../lib/session-title";
import { getBranchesForSession } from "../../../../../lib/db/branches";
import { recordUsageEvent, countClientEvents, countGlobalStageEvents } from "../../../../../lib/db/usage";
import {
  checkRateLimit,
  checkDailyClientCap,
  checkGlobalCap,
  checkSessionCap,
} from "../../../../../lib/limits";
import { getGraph } from "../../../../../lib/agent/runtime";
import { buildTimeline } from "../../../../../lib/history";
import type { State } from "../../../../../lib/agent/state";
import { isProviderCapError, providerCapEnvelope } from "../../../../../lib/agent/provider-errors";
import { stageKind } from "../../../../../lib/stage-kind";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  branchId: z.string(),
  fromCheckpointId: z.string(),
  mode: z.enum(["step", "retry"]).optional().default("step"),
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sid: string }> },
): Promise<NextResponse> {
  const { sid } = await params;
  const clientId = getClientId(request);
  if (!clientId) return jsonError(401, "missing-client-id", "X-Client-Id header is required.");

  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(400, "invalid-request", "Request body did not match the expected shape.");
  }
  const { branchId, fromCheckpointId } = body.data;

  const pool = getPool();
  const ownership = await requireOwnedSession(sid, clientId, branchId, pool);
  if (!ownership.ok) return ownership.response;
  const { session } = ownership;

  const rateWindowSeconds = Number(process.env.RATE_WINDOW_SECONDS ?? 60);
  const [windowCount, dailyClientCount, dailyGlobalCount] = await Promise.all([
    countClientEvents(clientId, rateWindowSeconds, pool),
    countClientEvents(clientId, 86400, pool),
    countGlobalStageEvents(86400, pool),
  ]);
  const rejection =
    checkRateLimit(windowCount, Number(process.env.RATE_MAX_PER_WINDOW ?? 8), rateWindowSeconds) ??
    checkDailyClientCap(dailyClientCount, Number(process.env.DAILY_STAGES_PER_CLIENT ?? 200)) ??
    checkGlobalCap(dailyGlobalCount, Number(process.env.DAILY_STAGES_GLOBAL ?? 2000)) ??
    checkSessionCap(session.stage_count, Number(process.env.MAX_STAGES_PER_SESSION ?? 60));
  if (rejection) {
    await recordUsageEvent({ clientId, threadId: branchId, kind: "rejected-limit" }, pool);
    return NextResponse.json(rejection, { status: 429 });
  }

  const graph = getGraph();
  const config = { configurable: { thread_id: branchId, checkpoint_id: fromCheckpointId } };

  const fromSnapshot = await graph.getState(config);
  const fromCheckpointExists =
    Object.keys(fromSnapshot.values as object).length > 0 || fromSnapshot.next.length > 0;
  if (!fromCheckpointExists) {
    return jsonError(404, "not-found", "That checkpoint no longer exists.");
  }

  // Best-effort double-advance backstop (spec FR-059) — the primary guard is
  // the client-side Web Lock (research R11). A checkpoint that already has a
  // successful (non-stage-failure) child means this request is redundant.
  const siblingHistory: { parentCheckpointId: string | null; outcome: State["outcome"] }[] = [];
  for await (const snapshot of graph.getStateHistory({ configurable: { thread_id: branchId } })) {
    siblingHistory.push({
      parentCheckpointId:
        (snapshot.parentConfig?.configurable as { checkpoint_id?: string } | undefined)
          ?.checkpoint_id ?? null,
      outcome: (snapshot.values as State).outcome,
    });
  }
  const alreadyAdvanced = siblingHistory.some(
    (entry) => entry.parentCheckpointId === fromCheckpointId && entry.outcome !== "stage-failure",
  );
  if (alreadyAdvanced) {
    return jsonError(409, "already-advanced", "This step was already advanced.");
  }

  let state: State;
  try {
    state = await graph.invoke(null, { ...config, signal: request.signal });
  } catch (err) {
    if (request.signal.aborted) {
      // Cancelled (spec FR-072-074): writes nothing; the client's own fetch
      // is already aborted and will disregard whatever we send back.
      return new NextResponse(null, { status: 499 });
    }

    if (isProviderCapError(err)) {
      // Spec FR-064/FR-066: treated like the global cap — nothing is written.
      return NextResponse.json(providerCapEnvelope(), { status: 429 });
    }

    const failedStage = fromSnapshot.next[0];
    if (!failedStage) throw err; // fromCheckpointId was terminal — shouldn't happen

    // Stage-failure checkpoint (research R4): attributed to the stage that
    // was attempted, targeting fromCheckpointId's still-childless slot — safe.
    await graph.updateState(
      config,
      { outcome: "stage-failure", failureReason: errorMessage(err) },
      failedStage,
    );
    const failureSnapshot = await graph.getState({ configurable: { thread_id: branchId } });
    const branches = await getBranchesForSession(sid, pool);
    const timeline = await buildTimeline(graph, branches);
    return NextResponse.json({
      branchId,
      checkpointId: failureSnapshot.config.configurable?.checkpoint_id,
      state: failureSnapshot.values,
      next: failureSnapshot.next,
      kind: "stage-failure",
      timeline,
    });
  }

  const { capped } = await incrementStageCount(
    sid,
    Number(process.env.MAX_STAGES_PER_SESSION ?? 60),
    pool,
  );
  void capped;
  await recordUsageEvent({ clientId, threadId: branchId, kind: "stage" }, pool);

  const completedStage = fromSnapshot.next[0];
  const title = completedStage ? titleForStage(completedStage, state) : null;
  if (title) await updateSessionTitle(sid, title, pool);

  const snapshot = await graph.getState({ configurable: { thread_id: branchId } });
  const branches = await getBranchesForSession(sid, pool);
  const timeline = await buildTimeline(graph, branches);

  return NextResponse.json({
    branchId,
    checkpointId: snapshot.config.configurable?.checkpoint_id,
    state,
    next: snapshot.next,
    kind: stageKind(state.outcome),
    timeline,
  });
}
