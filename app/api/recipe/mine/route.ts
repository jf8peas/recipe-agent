import { NextResponse } from "next/server";
import { getClientId, jsonError } from "../../../../lib/api-helpers";
import { getPool } from "../../../../lib/db/pool";
import { getByOwner } from "../../../../lib/db/sessions";
import { signImageUrl } from "../../../../lib/image-url";

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
    // `null` for a session with no finalized branch, or whose most recently
    // finalized branch's image generation failed (FR-005) — the client
    // renders the same neutral placeholder either way (feature 007,
    // data-model.md §6). Freshly signed on every call, never stored.
    thumbnail: row.thumbnail_image_id
      ? {
          imageId: row.thumbnail_image_id,
          url: signImageUrl(row.thumbnail_image_id),
          focalX: row.thumbnail_focal_x!,
          focalY: row.thumbnail_focal_y!,
          zoom: row.thumbnail_zoom,
          alt: row.thumbnail_alt!,
        }
      : null,
  }));

  return NextResponse.json({ sessions });
}
