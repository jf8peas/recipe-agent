import type { Pool } from "pg";
import { getPool } from "./pool";
import { ImageRowSchema, type ImageRow } from "./schema";

/** Inserts one generated dish image's bytes (feature 007, data-model.md §3).
 * `threadId` satisfies the `images.thread_id` FK to `branches` — deletion/
 * purge cascade from there, no separate cleanup path needed. */
export async function insertImage(
  params: { imageId: string; threadId: string; bytes: Buffer; mime: string },
  pool: Pool = getPool(),
): Promise<ImageRow> {
  const { rows } = await pool.query(
    `INSERT INTO images (image_id, thread_id, bytes, mime)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.imageId, params.threadId, params.bytes, params.mime],
  );
  return ImageRowSchema.parse(rows[0]);
}

export async function getImageById(
  imageId: string,
  pool: Pool = getPool(),
): Promise<ImageRow | null> {
  const { rows } = await pool.query("SELECT * FROM images WHERE image_id = $1", [imageId]);
  return rows[0] ? ImageRowSchema.parse(rows[0]) : null;
}
