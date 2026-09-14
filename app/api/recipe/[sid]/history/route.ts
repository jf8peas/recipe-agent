import { NextResponse } from "next/server";
import { getClientId, jsonError, requireOwnedSession } from "../../../../../lib/api-helpers";
import { getPool } from "../../../../../lib/db/pool";
import { bumpActivity } from "../../../../../lib/db/sessions";
import { getBranchesForSession } from "../../../../../lib/db/branches";
import { getGraph } from "../../../../../lib/agent/runtime";
import { buildTimeline } from "../../../../../lib/history";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sid: string }> },
): Promise<NextResponse> {
  const { sid } = await params;
  const clientId = getClientId(request);
  if (!clientId) return jsonError(401, "missing-client-id", "X-Client-Id header is required.");

  const pool = getPool();
  const ownership = await requireOwnedSession(sid, clientId, null, pool);
  if (!ownership.ok) return ownership.response;

  await bumpActivity(sid, pool);

  const branchRows = await getBranchesForSession(sid, pool);
  const timeline = await buildTimeline(getGraph(), branchRows);
  const branches = branchRows.map((b) => ({
    threadId: b.thread_id,
    parentThreadId: b.parent_thread_id,
    forkedFromCheckpointId: b.forked_from_checkpoint_id,
  }));

  return NextResponse.json({ branches, timeline });
}
