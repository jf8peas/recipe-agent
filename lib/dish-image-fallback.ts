import type { Pool } from "pg";
import { getSessionById } from "./db/sessions";
import { getImageThreadId } from "./db/images";
import { DishImageSchema, type DishImage } from "./agent/state";

/**
 * The live tip's own `dishImage` channel is occasionally lost to a confirmed
 * `@langchain/langgraph-checkpoint-postgres` bug (specs/001-recipe-agent/
 * research.md's second production addendum): every "Generate photo" retry
 * shares one parent checkpoint with every prior attempt (structurally
 * required — a finalized checkpoint is terminal, so there's nowhere else to
 * branch a retry from), and multiple `invoke()`-created siblings of that one
 * parent can independently compute the same channel-version number for
 * `dishImage`. Only one write survives at that storage key, so a later read
 * of "the current state" can come back `null` even though a real image
 * exists.
 *
 * `sessions.thumbnail_*` is immune to this — `updateSessionThumbnail` writes
 * it directly from each attempt's own in-memory result the moment it
 * happens, never by re-reading it back from the checkpoint store, and only
 * ever moves it forward (never regresses to an older image). When viewing a
 * branch's actual current tip (never for history — FR-009a still means an
 * older checkpoint keeps showing its own recorded image, unchanged) and that
 * thumbnail's image belongs to THIS SAME branch (never a sibling fork's,
 * which the plain session-level thumbnail doesn't distinguish on its own),
 * prefer it over whatever the checkpoint itself reports.
 */
export async function resolveLiveDishImage(
  sessionId: string,
  branchId: string,
  checkpointDishImage: DishImage | null,
  pool: Pool,
): Promise<DishImage | null> {
  const session = await getSessionById(sessionId, pool);
  if (!session?.thumbnail_image_id) return checkpointDishImage;

  const thumbnailThreadId = await getImageThreadId(session.thumbnail_image_id, pool);
  if (thumbnailThreadId !== branchId) return checkpointDishImage;

  return DishImageSchema.parse({
    imageId: session.thumbnail_image_id,
    focalX: session.thumbnail_focal_x,
    focalY: session.thumbnail_focal_y,
    zoom: session.thumbnail_zoom,
    alt: session.thumbnail_alt,
  });
}
