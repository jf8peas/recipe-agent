import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientId, jsonError, requireOwnedSession } from "../../../../../../lib/api-helpers";
import { getPool } from "../../../../../../lib/db/pool";
import { getBranchesForSession } from "../../../../../../lib/db/branches";
import { getGraph } from "../../../../../../lib/agent/runtime";
import { buildTimeline } from "../../../../../../lib/history";
import { StateSchema } from "../../../../../../lib/agent/state";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  branchId: z.string(),
  fromCheckpointId: z.string(),
  heldState: StateSchema,
});

const MAX_ATTEMPTS = 3;

/** Persists a stage result the client is holding after a `202` (spec FR-080).
 * Retries ONLY the checkpoint write via `updateState` — the node is never
 * re-invoked, so no extra `usage_events` row and no repeat model spend
 * (spec FR-082; contracts/api.md `/step/commit`). */
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
  const { branchId, fromCheckpointId, heldState } = body.data;

  const pool = getPool();
  const ownership = await requireOwnedSession(sid, clientId, branchId, pool);
  if (!ownership.ok) return ownership.response;

  const graph = getGraph();
  const config = { configurable: { thread_id: branchId, checkpoint_id: fromCheckpointId } };
  const fromSnapshot = await graph.getState(config);
  const asNode = fromSnapshot.next[0];
  if (!asNode) return jsonError(404, "not-found", "That checkpoint no longer exists.");

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      await graph.updateState(config, heldState, asNode);
      const snapshot = await graph.getState({ configurable: { thread_id: branchId } });
      const branches = await getBranchesForSession(sid, pool);
      const timeline = await buildTimeline(graph, branches);
      return NextResponse.json({
        checkpointId: snapshot.config.configurable?.checkpoint_id,
        timeline,
      });
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
      }
    }
  }

  void lastError;
  return NextResponse.json({ pendingSave: true }, { status: 202 });
}
