import { NextResponse } from "next/server";
import { getClientId, jsonError, requireOwnedSession } from "../../../../../lib/api-helpers";
import { getPool } from "../../../../../lib/db/pool";
import { getGraph } from "../../../../../lib/agent/runtime";
import { stageKind } from "../../../../../lib/stage-kind";
import type { State } from "../../../../../lib/agent/state";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sid: string }> },
): Promise<NextResponse> {
  const { sid } = await params;
  const clientId = getClientId(request);
  if (!clientId) return jsonError(401, "missing-client-id", "X-Client-Id header is required.");

  const url = new URL(request.url);
  const branchId = url.searchParams.get("branchId");
  const checkpointId = url.searchParams.get("checkpointId");
  if (!branchId || !checkpointId) {
    return jsonError(400, "invalid-request", "branchId and checkpointId query params are required.");
  }

  const pool = getPool();
  const ownership = await requireOwnedSession(sid, clientId, branchId, pool);
  if (!ownership.ok) return ownership.response;

  const graph = getGraph();
  const snapshot = await graph.getState({
    configurable: { thread_id: branchId, checkpoint_id: checkpointId },
  });
  const exists = Object.keys(snapshot.values as object).length > 0 || snapshot.next.length > 0;
  if (!exists) {
    return jsonError(400, "unknown-checkpoint", "That checkpoint does not exist on this branch.");
  }

  const state = snapshot.values as State;
  return NextResponse.json({
    checkpointId: snapshot.config.configurable?.checkpoint_id,
    state,
    next: snapshot.next,
    kind: stageKind(state.outcome),
  });
}
