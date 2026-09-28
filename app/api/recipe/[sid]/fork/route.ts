import { NextResponse } from "next/server";
import { z } from "zod";
import { getClientId, jsonError, requireOwnedSession } from "../../../../../lib/api-helpers";
import { getPool } from "../../../../../lib/db/pool";
import { getBranchesForSession, insertBranch } from "../../../../../lib/db/branches";
import { updateSessionThumbnail, updateSessionTitle } from "../../../../../lib/db/sessions";
import { bestAvailableTitle } from "../../../../../lib/session-title";
import { getGraph } from "../../../../../lib/agent/runtime";
import { buildTimeline } from "../../../../../lib/history";
import { forkReplay } from "../../../../../lib/fork-replay";
import { dishImageUrl } from "../../../../../lib/image-url";
import {
  EDITABLE_FIELDS,
  FIELD_SCHEMAS,
  earliestReplayStage,
  type EditableField,
} from "../../../../../lib/field-consumers";
import { mintThreadId } from "../../../../../lib/ids";
import type { State } from "../../../../../lib/agent/state";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  branchId: z.string(),
  checkpointId: z.string(),
  patch: z.record(z.string(), z.unknown()),
});

/**
 * Edit a past checkpoint and fork (spec FR-026, FR-044): realized as a
 * brand-new LangGraph thread via `lib/fork-replay.ts`, never a second child
 * within `branchId`'s own thread (constitution v3.0.0, research R3).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sid: string }> },
): Promise<NextResponse> {
  // No model calls happen anywhere in this route (forkReplay is pure
  // `updateState` replay, per its own doc comment) — so a 60s platform
  // timeout here can only come from the DB/network side, not a slow LLM
  // call. This route had zero timing diagnostics, unlike every other one
  // already instrumented this session (`start`, `step`) — added after a
  // real production timeout on `/fork` had no logging to pinpoint which
  // specific operation actually stalled.
  const requestStartedAt = Date.now();
  const { sid } = await params;
  const clientId = getClientId(request);
  if (!clientId) return jsonError(401, "missing-client-id", "X-Client-Id header is required.");

  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(400, "invalid-request", "Request body did not match the expected shape.");
  }
  const { branchId, checkpointId, patch } = body.data;

  const pool = getPool();
  const ownership = await requireOwnedSession(sid, clientId, branchId, pool);
  if (!ownership.ok) return ownership.response;
  const { session } = ownership;
  console.log(`[fork] ownership check done at ${Date.now() - requestStartedAt}ms`);

  const patchFields = Object.keys(patch);
  if (patchFields.length === 0) {
    return jsonError(400, "invalid-edit", "Patch must include at least one field.", { field: null });
  }
  for (const field of patchFields) {
    if (!EDITABLE_FIELDS.has(field as EditableField)) {
      return jsonError(400, "invalid-edit", `"${field}" is not an editable field.`, { field });
    }
  }
  const editableFields = patchFields as EditableField[];

  for (const field of editableFields) {
    const result = FIELD_SCHEMAS[field].safeParse(patch[field]);
    if (!result.success) {
      return jsonError(400, "invalid-edit", `"${field}" is not valid.`, { field });
    }
  }

  if (editableFields.includes("ingredients")) {
    const maxIngredients = Number(process.env.MAX_INGREDIENTS ?? 50);
    const ingredients = patch.ingredients as unknown[];
    if (ingredients.length > maxIngredients) {
      return jsonError(400, "too-many-ingredients", `Enter at most ${maxIngredients} ingredients.`, {
        max: maxIngredients,
      });
    }
  }

  if (session.status === "capped") {
    return jsonError(409, "session-capped", "This session has reached its step limit.");
  }

  const replayFromStage = earliestReplayStage(editableFields);
  const newThreadId = mintThreadId();
  const graph = getGraph();

  console.log(`[fork] calling forkReplay at ${Date.now() - requestStartedAt}ms`);
  let replay;
  try {
    replay = await forkReplay(graph, {
      sourceThreadId: branchId,
      checkpointId,
      newThreadId,
      patch: patch as Partial<State>,
    });
  } catch (err) {
    console.error(
      `[fork] forkReplay threw after ${Date.now() - requestStartedAt}ms:`,
      err instanceof Error ? `${err.name}: ${err.message}` : err,
    );
    return jsonError(404, "not-found", "That checkpoint no longer exists.");
  }
  console.log(`[fork] forkReplay returned at ${Date.now() - requestStartedAt}ms`);

  await insertBranch(
    { threadId: newThreadId, sessionId: sid, parentThreadId: branchId, forkedFromCheckpointId: checkpointId },
    pool,
  );
  console.log(`[fork] insertBranch done at ${Date.now() - requestStartedAt}ms`);

  // A fork's patch can jump straight to editing any of the three
  // title-bearing fields, not necessarily one stage at a time, so the
  // title is recomputed from whatever's now in `replay.state` rather than
  // gated on a single "just-completed" stage (lib/session-title.ts).
  const title = bestAvailableTitle(replay.state);
  if (title) await updateSessionTitle(sid, title, pool);
  if (replay.state.outcome === "finalized" && replay.state.dishImage) {
    await updateSessionThumbnail(sid, replay.state.dishImage, pool);
  }
  console.log(`[fork] title/thumbnail updates done at ${Date.now() - requestStartedAt}ms`);

  const branches = await getBranchesForSession(sid, pool);
  const timeline = await buildTimeline(graph, branches);
  console.log(`[fork] buildTimeline done at ${Date.now() - requestStartedAt}ms`);

  return NextResponse.json({
    branchId: newThreadId,
    checkpointId: replay.checkpointId,
    state: replay.state,
    dishImageUrl: dishImageUrl(replay.state.dishImage),
    replayFromStage,
    timeline,
  });
}
