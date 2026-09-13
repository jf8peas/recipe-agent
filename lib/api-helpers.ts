import { NextResponse } from "next/server";
import type { Pool } from "pg";
import { getPool } from "./db/pool";
import { getSessionById } from "./db/sessions";
import { getBranch } from "./db/branches";
import type { SessionRow, BranchRow } from "./db/schema";

export function jsonError(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, message, ...extra }, { status });
}

/** Extracts `X-Client-Id`; returns null (and the caller should 401) if missing/blank. */
export function getClientId(request: Request): string | null {
  const clientId = request.headers.get("x-client-id");
  return clientId && clientId.trim().length > 0 ? clientId : null;
}

export type OwnershipOk = { ok: true; session: SessionRow; branch: BranchRow | null };
export type OwnershipFail = { ok: false; response: NextResponse };

/**
 * Ownership guard (contracts/api.md § Common): `sessions.client_id` must equal
 * the header, else 404 (never 403 — a mismatch and an unknown session look
 * identical to the caller). When `branchId` is given, also verifies
 * `branches.session_id === sid`, 404-ing the same way on mismatch.
 */
export async function requireOwnedSession(
  sid: string,
  clientId: string,
  branchId?: string | null,
  pool: Pool = getPool(),
): Promise<OwnershipOk | OwnershipFail> {
  const session = await getSessionById(sid, pool);
  if (!session || session.client_id !== clientId) {
    return { ok: false, response: jsonError(404, "not-found", "Session not found.") };
  }

  if (!branchId) {
    return { ok: true, session, branch: null };
  }

  const branch = await getBranch(branchId, pool);
  if (!branch || branch.session_id !== sid) {
    return { ok: false, response: jsonError(404, "not-found", "Session not found.") };
  }

  return { ok: true, session, branch };
}
