import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import sharp from "sharp";
import { IMAGE_MAX_DIMENSION_PX, IMAGE_WEBP_QUALITY } from "../lib/agent/nodes/finalize";

/**
 * One-off backfill for images stored before `finalize.ts` started
 * re-encoding to WebP (specs/007-dish-image-generation/research.md R11) —
 * re-encodes every non-WebP row in place, using the exact same resize/
 * quality settings new images already get. `image_id` never changes, so
 * nothing else needs updating: `dishImage.imageId` in graph state and
 * `sessions.thumbnail_image_id` both keep pointing at the same row.
 *
 * Idempotent — filters on `mime <> 'image/webp'`, so a re-run only touches
 * whatever's left (nothing, once it's all converted). Safe to interrupt and
 * re-run; each row is its own transaction.
 *
 * `existingPool`, if given, is used as-is and left open for the caller to
 * manage (tests share one pool against the same PGlite instance across
 * several calls — repeatedly opening/closing a *separate* pool alongside it
 * triggers a harmless but noisy teardown race in `pglite-socket`). The real
 * CLI entry point below never passes one, so it keeps opening and cleanly
 * closing its own, exactly as before.
 */
export async function backfillImageWebp(
  connectionString: string,
  log: (msg: string) => void = console.log,
  existingPool?: Pool,
): Promise<{ converted: number; failed: number; bytesBefore: number; bytesAfter: number }> {
  const pool = existingPool ?? new Pool({ connectionString });
  let converted = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  try {
    const { rows } = await pool.query<{ image_id: string; bytes: Buffer; mime: string }>(
      `SELECT image_id, bytes, mime FROM images WHERE mime <> 'image/webp' ORDER BY created_at`,
    );
    log(`${rows.length} image(s) to convert.`);

    for (const row of rows) {
      try {
        const optimized = await sharp(row.bytes)
          .resize(IMAGE_MAX_DIMENSION_PX, IMAGE_MAX_DIMENSION_PX, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: IMAGE_WEBP_QUALITY })
          .toBuffer();

        await pool.query(`UPDATE images SET bytes = $2, mime = 'image/webp' WHERE image_id = $1`, [
          row.image_id,
          optimized,
        ]);

        bytesBefore += row.bytes.length;
        bytesAfter += optimized.length;
        converted += 1;
        log(
          `converted ${row.image_id}: ${(row.bytes.length / 1024).toFixed(0)}KB (${row.mime}) -> ` +
            `${(optimized.length / 1024).toFixed(0)}KB (image/webp)`,
        );
      } catch (err) {
        failed += 1;
        log(`FAILED ${row.image_id}: ${err instanceof Error ? err.message : err} — left as-is`);
      }
    }

    log(
      `Done. ${converted} converted, ${failed} failed. ` +
        `${(bytesBefore / 1024 / 1024).toFixed(1)}MB -> ${(bytesAfter / 1024 / 1024).toFixed(1)}MB.`,
    );
    return { converted, failed, bytesBefore, bytesAfter };
  } finally {
    if (!existingPool) await pool.end();
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
      break;
    } catch {
      // missing locally is fine — env vars may come from the shell/CI
    }
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  backfillImageWebp(connectionString)
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
