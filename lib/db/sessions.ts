import type { Pool } from "pg";
import { getPool } from "./pool";
import { SessionRowSchema, type SessionRow } from "./schema";

export async function insertSession(
  params: { sessionId: string; clientId: string; rootThreadId: string; title?: string | null },
  pool: Pool = getPool(),
): Promise<SessionRow> {
  const { rows } = await pool.query(
    `INSERT INTO sessions (session_id, client_id, root_thread_id, title)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.sessionId, params.clientId, params.rootThreadId, params.title ?? null],
  );
  return SessionRowSchema.parse(rows[0]);
}

export async function getSessionById(
  sessionId: string,
  pool: Pool = getPool(),
): Promise<SessionRow | null> {
  const { rows } = await pool.query("SELECT * FROM sessions WHERE session_id = $1", [sessionId]);
  return rows[0] ? SessionRowSchema.parse(rows[0]) : null;
}

export async function getByOwner(clientId: string, pool: Pool = getPool()): Promise<SessionRow[]> {
  const { rows } = await pool.query(
    "SELECT * FROM sessions WHERE client_id = $1 ORDER BY last_activity DESC",
    [clientId],
  );
  return rows.map((r) => SessionRowSchema.parse(r));
}

export async function bumpActivity(sessionId: string, pool: Pool = getPool()): Promise<void> {
  await pool.query("UPDATE sessions SET last_activity = now() WHERE session_id = $1", [sessionId]);
}

/** Returns the new stage_count and whether the session just became capped. */
export async function incrementStageCount(
  sessionId: string,
  maxStagesPerSession: number,
  pool: Pool = getPool(),
): Promise<{ stageCount: number; capped: boolean }> {
  const { rows } = await pool.query(
    `UPDATE sessions
     SET stage_count = stage_count + 1,
         last_activity = now(),
         status = CASE WHEN stage_count + 1 >= $2 THEN 'capped' ELSE status END
     WHERE session_id = $1
     RETURNING stage_count, status`,
    [sessionId, maxStagesPerSession],
  );
  const row = rows[0] as { stage_count: number; status: string };
  return { stageCount: row.stage_count, capped: row.status === "capped" };
}

export async function setCapped(sessionId: string, pool: Pool = getPool()): Promise<void> {
  await pool.query("UPDATE sessions SET status = 'capped' WHERE session_id = $1", [sessionId]);
}

/** Cascades to `branches` via FK (ON DELETE CASCADE) — caller must still
 * delete each branch's LangGraph checkpoints first (constitution v3.0.0). */
export async function deleteSession(sessionId: string, pool: Pool = getPool()): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE session_id = $1", [sessionId]);
}

export async function findStaleSessionIds(
  purgeDays: number,
  pool: Pool = getPool(),
): Promise<string[]> {
  const { rows } = await pool.query<{ session_id: string }>(
    `SELECT session_id FROM sessions WHERE last_activity < now() - ($1 || ' days')::interval`,
    [purgeDays],
  );
  return rows.map((r) => r.session_id);
}
