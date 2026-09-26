import { NextResponse } from "next/server";
import { getClientId, jsonError, requireOwnedSession } from "../../../../../lib/api-helpers";
import { getPool } from "../../../../../lib/db/pool";
import { getGraph } from "../../../../../lib/agent/runtime";
import { stageKind } from "../../../../../lib/stage-kind";
import { dishImageUrl } from "../../../../../lib/image-url";
import { resolveLiveDishImage } from "../../../../../lib/dish-image-fallback";
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

  // Only for the branch's actual current tip — an older checkpoint keeps
  // showing its own recorded image unchanged (FR-009a). Determined by
  // re-reading state with no checkpoint override rather than trusting the
  // caller's own intent, matching how this route already treats every other
  // piece of derived truth.
  const liveTip = await graph.getState({ configurable: { thread_id: branchId } });
  const isLiveTip = liveTip.config.configurable?.checkpoint_id === checkpointId;
  const dishImage = isLiveTip
    ? await resolveLiveDishImage(sid, branchId, state.dishImage, pool)
    : state.dishImage;

  return NextResponse.json({
    checkpointId: snapshot.config.configurable?.checkpoint_id,
    state: { ...state, dishImage },
    dishImageUrl: dishImageUrl(dishImage),
    next: snapshot.next,
    kind: stageKind(state.outcome),
  });
}
