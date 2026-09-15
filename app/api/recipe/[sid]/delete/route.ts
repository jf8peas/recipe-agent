import { NextResponse } from "next/server";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getClientId, jsonError, requireOwnedSession } from "../../../../../lib/api-helpers";
import { getPool } from "../../../../../lib/db/pool";
import { getBranchesForSession } from "../../../../../lib/db/branches";
import { deleteSession } from "../../../../../lib/db/sessions";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Permanently deletes a session: every branch's checkpoints, then the
 * `sessions` row (cascades `branches` via FK). Idempotent — a 404 (unknown/
 * not-owned) is the only failure mode; deleting twice both 200s the first
 * time and 404s the second, once the session no longer exists (spec
 * FR-055/FR-056/FR-058). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sid: string }> },
): Promise<NextResponse> {
  const { sid } = await params;
  const clientId = getClientId(request);
  if (!clientId) return jsonError(401, "missing-client-id", "X-Client-Id header is required.");

  const pool = getPool();
  const ownership = await requireOwnedSession(sid, clientId, null, pool);
  if (!ownership.ok) return ownership.response;

  const branches = await getBranchesForSession(sid, pool);
  const checkpointer = new PostgresSaver(pool);
  for (const branch of branches) {
    await checkpointer.deleteThread(branch.thread_id);
  }

  await deleteSession(sid, pool);

  return NextResponse.json({ deleted: true });
}
