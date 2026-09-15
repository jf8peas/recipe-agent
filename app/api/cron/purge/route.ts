import { NextResponse } from "next/server";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getPool } from "../../../../lib/db/pool";
import { findStaleSessionIds, deleteSession } from "../../../../lib/db/sessions";
import { getBranchesForSession } from "../../../../lib/db/branches";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Vercel Cron target (`vercel.json`): purges sessions inactive past
 * `SESSION_PURGE_DAYS` — every branch's checkpoints, then the session row
 * (spec FR-057). Guarded by `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pool = getPool();
  const purgeDays = Number(process.env.SESSION_PURGE_DAYS ?? 90);
  const staleSessionIds = await findStaleSessionIds(purgeDays, pool);

  const checkpointer = new PostgresSaver(pool);
  for (const sessionId of staleSessionIds) {
    const branches = await getBranchesForSession(sessionId, pool);
    for (const branch of branches) {
      await checkpointer.deleteThread(branch.thread_id);
    }
    await deleteSession(sessionId, pool);
  }

  return NextResponse.json({ purged: staleSessionIds.length });
}
