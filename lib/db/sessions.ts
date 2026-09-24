import type { Pool } from "pg";
import { getPool } from "./pool";
import { SessionRowSchema, type SessionRow } from "./schema";
import type { DishImage } from "../agent/state";

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

/** Sets a session's denormalized "current best thumbnail" (feature 007,
 * data-model.md §5) — but only if `image` is actually newer than whatever
 * the session already points at, using `images.id`'s ordinal (not
 * `created_at`, which isn't precise enough to be a deterministic tie-break
 * on its own) so "most recently finalized branch wins" (spec FR-009) is
 * race-safe as one atomic statement, not a read-then-write. A no-op if a
 * newer image is already set — callers don't need to check first. */
export async function updateSessionThumbnail(
  sessionId: string,
  image: DishImage,
  pool: Pool = getPool(),
): Promise<void> {
  // A `LEFT JOIN ... ON` in an `UPDATE ... FROM` can't reference the update
  // target (`s`) in its `ON` clause — real Postgres rejects that with
  // "invalid reference to FROM-clause entry", not just a PGlite quirk (this
  // was caught by tests/contract/step.test.ts, feature 007, driving a real
  // finalize through pglite). A correlated `NOT EXISTS` is the standard
  // rewrite: "no existing thumbnail whose `images.id` is already >= the new
  // one's" is exactly equivalent to the original "cur_img.id IS NULL OR
  // new_img.id > cur_img.id", and a subquery's `WHERE` can freely reference
  // the outer UPDATE target.
  await pool.query(
    `UPDATE sessions s
     SET thumbnail_image_id = $2, thumbnail_focal_x = $3, thumbnail_focal_y = $4,
         thumbnail_zoom = $5, thumbnail_alt = $6
     FROM images new_img
     WHERE s.session_id = $1
       AND new_img.image_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM images cur_img
         WHERE cur_img.image_id = s.thumbnail_image_id
           AND cur_img.id >= new_img.id
       )`,
    [sessionId, image.imageId, image.focalX, image.focalY, image.zoom, image.alt],
  );
}

/** Titles a session once a real recipe name is known (`lib/session-title.ts`
 * decides the title text; this just writes it). Called after `selectDirection`,
 * `draftRecipe`, and `finalize` complete, so the title gets progressively
 * more accurate as the run advances. */
export async function updateSessionTitle(
  sessionId: string,
  title: string,
  pool: Pool = getPool(),
): Promise<void> {
  await pool.query("UPDATE sessions SET title = $2 WHERE session_id = $1", [sessionId, title]);
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
