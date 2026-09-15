import { NextResponse } from "next/server";
import { getClientId, jsonError } from "../../../../lib/api-helpers";
import { getPool } from "../../../../lib/db/pool";
import { getByOwner } from "../../../../lib/db/sessions";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Owner-scoped session list, used to rebuild the on-device list (spec
 * FR-004/FR-032) — never returns another owner's sessions (spec FR-060). */
export async function GET(request: Request): Promise<NextResponse> {
  const clientId = getClientId(request);
  if (!clientId) return jsonError(401, "missing-client-id", "X-Client-Id header is required.");

  const rows = await getByOwner(clientId, getPool());
  const sessions = rows.map((row) => ({
    sessionId: row.session_id,
    title: row.title,
    lastActivity: row.last_activity.toISOString(),
    status: row.status,
  }));

  return NextResponse.json({ sessions });
}
