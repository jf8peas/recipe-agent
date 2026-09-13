import type { Pool } from "pg";
import { getPool } from "./pool";
import { UsageEventKindSchema, type UsageEventKind } from "./schema";

export async function recordUsageEvent(
  params: { clientId: string; threadId?: string | null; kind: UsageEventKind },
  pool: Pool = getPool(),
): Promise<void> {
  const kind = UsageEventKindSchema.parse(params.kind);
  await pool.query(
    `INSERT INTO usage_events (client_id, thread_id, kind) VALUES ($1, $2, $3)`,
    [params.clientId, params.threadId ?? null, kind],
  );
}

/**
 * Count of `start`/`stage` events for one client within the last `windowSeconds`
 * (data-model.md § usage_events — used for both the short rate window and the
 * 24h per-client cap; the caller picks the window).
 */
export async function countClientEvents(
  clientId: string,
  windowSeconds: number,
  pool: Pool = getPool(),
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM usage_events
     WHERE client_id = $1
       AND kind IN ('start', 'stage')
       AND created_at > now() - ($2 || ' seconds')::interval`,
    [clientId, windowSeconds],
  );
  return Number(rows[0]?.count ?? 0);
}

/** Global count of `stage` events within the last 24h, vs `DAILY_STAGES_GLOBAL`. */
export async function countGlobalStageEvents(
  windowSeconds: number,
  pool: Pool = getPool(),
): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM usage_events
     WHERE kind = 'stage'
       AND created_at > now() - ($1 || ' seconds')::interval`,
    [windowSeconds],
  );
  return Number(rows[0]?.count ?? 0);
}
