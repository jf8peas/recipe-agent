import type { Pool } from "pg";
import { getPool } from "./pool";
import { BranchRowSchema, type BranchRow } from "./schema";

export async function insertBranch(
  params: {
    threadId: string;
    sessionId: string;
    parentThreadId?: string | null;
    forkedFromCheckpointId?: string | null;
  },
  pool: Pool = getPool(),
): Promise<BranchRow> {
  const { rows } = await pool.query(
    `INSERT INTO branches (thread_id, session_id, parent_thread_id, forked_from_checkpoint_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      params.threadId,
      params.sessionId,
      params.parentThreadId ?? null,
      params.forkedFromCheckpointId ?? null,
    ],
  );
  return BranchRowSchema.parse(rows[0]);
}

export async function getBranch(
  threadId: string,
  pool: Pool = getPool(),
): Promise<BranchRow | null> {
  const { rows } = await pool.query("SELECT * FROM branches WHERE thread_id = $1", [threadId]);
  return rows[0] ? BranchRowSchema.parse(rows[0]) : null;
}

export async function getBranchesForSession(
  sessionId: string,
  pool: Pool = getPool(),
): Promise<BranchRow[]> {
  const { rows } = await pool.query(
    "SELECT * FROM branches WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId],
  );
  return rows.map((r) => BranchRowSchema.parse(r));
}
