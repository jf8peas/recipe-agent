import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { backfillImageWebp } from "../../scripts/backfill-image-webp";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { insertSession } from "../../lib/db/sessions";
import { insertBranch } from "../../lib/db/branches";
import { insertImage } from "../../lib/db/images";

// A committed, valid, tiny 1x1 PNG (the same fixture used elsewhere in this
// suite) — `sharp` needs real, decodable image bytes, not a placeholder.
const REAL_TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("backfillImageWebp", () => {
  let testDb: TestDb;
  let pool: Pool;

  beforeAll(async () => {
    testDb = await startTestDb();
    await testDb.migrate();
    pool = new Pool({ connectionString: testDb.connectionString });
    await insertSession({ sessionId: "s1", clientId: "client-a", rootThreadId: "t1" }, pool);
    await insertBranch({ threadId: "t1", sessionId: "s1" }, pool);
  });

  afterAll(async () => {
    await pool.end();
    await testDb.stop();
  });

  it("re-encodes a non-WebP image in place, and is a no-op on re-run", async () => {
    const pngBytes = Buffer.from(REAL_TINY_PNG_BASE64, "base64");
    await insertImage({ imageId: "img-1", threadId: "t1", bytes: pngBytes, mime: "image/png" }, pool);

    const first = await backfillImageWebp(testDb.connectionString, () => {}, pool);
    expect(first.converted).toBe(1);
    expect(first.failed).toBe(0);

    const { rows } = await pool.query<{ mime: string; bytes: Buffer }>(
      "SELECT mime, bytes FROM images WHERE image_id = $1",
      ["img-1"],
    );
    expect(rows[0]!.mime).toBe("image/webp");
    // Different bytes (re-encoded), but the row identity (image_id, and
    // therefore every dishImage/thumbnail reference to it) is unchanged.
    expect(rows[0]!.bytes.equals(pngBytes)).toBe(false);

    // Idempotent: nothing left to convert.
    const second = await backfillImageWebp(testDb.connectionString, () => {}, pool);
    expect(second.converted).toBe(0);
    expect(second.failed).toBe(0);
  });

  it("logs and skips a row it can't decode, without touching it", async () => {
    await insertImage(
      { imageId: "img-corrupt", threadId: "t1", bytes: Buffer.from("not an image"), mime: "image/png" },
      pool,
    );

    const messages: string[] = [];
    const result = await backfillImageWebp(testDb.connectionString, (msg) => messages.push(msg), pool);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => m.includes("FAILED img-corrupt"))).toBe(true);

    const { rows } = await pool.query<{ mime: string }>("SELECT mime FROM images WHERE image_id = $1", [
      "img-corrupt",
    ]);
    expect(rows[0]!.mime).toBe("image/png"); // left as-is, not silently dropped
  });
});
