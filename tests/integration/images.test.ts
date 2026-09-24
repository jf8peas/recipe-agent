import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { startTestDb, type TestDb } from "../helpers/test-db";
import { getPool } from "../../lib/db/pool";
import { insertSession } from "../../lib/db/sessions";
import { insertBranch } from "../../lib/db/branches";
import { insertImage, getImageById } from "../../lib/db/images";
import { updateSessionThumbnail } from "../../lib/db/sessions";
import { mintThreadId } from "../../lib/ids";
import type { DishImage } from "../../lib/agent/state";

// A committed, valid, tiny 1x1 PNG (same fixture `lib/agent/fake-model.ts`
// uses) — the fake model's own image response, so this suite exercises the
// real `finalize` node (and, for T030, a real multi-node graph run) against
// a real (pglite) DB, not a plain SQL stub.
const FIXED_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const FIXED_FINAL_RECIPE = {
  title: "Spinach Frittata",
  servings: 2,
  ingredients: [],
  steps: [],
  toBuy: [],
  scaledServings: 2,
  nutrition: { calories: 200, protein: 10, carbs: 5, fat: 10, note: "approximate" as const },
};

// A per-node-name scripted response queue (matches tests/integration/graph.test.ts
// and tests/unit/fork-replay.test.ts's own convention) — T030 needs to drive
// a real multi-node graph run, not just a single direct `finalize()` call,
// so every node's text call has to be individually scriptable.
type Responder = () => unknown;
const responders = new Map<string, Responder[]>();
function queueResponse(nodeName: string, respond: Responder) {
  const queue = responders.get(nodeName) ?? [];
  queue.push(respond);
  responders.set(nodeName, queue);
}
function resetResponders() {
  responders.clear();
}

const IMAGE_RESPONDER_KEY = "__image__";
function queueImageSuccess() {
  queueResponse(IMAGE_RESPONDER_KEY, () => ({
    content: [
      { type: "text", text: JSON.stringify({ focalX: 0.5, focalY: 0.5 }) },
      { type: "image", url: `data:image/png;base64,${FIXED_IMAGE_BASE64}` },
    ],
  }));
}

vi.mock("../../lib/agent/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/agent/models")>();
  return {
    ...actual,
    createChatModel: vi.fn((_modelId: string, options?: { timeoutMs?: number }) => {
      // `finalize`'s image call is the only caller passing a second
      // argument (research R3) — mirrors `lib/agent/fake-model.ts`'s real split.
      if (options) {
        return {
          invoke: async () => {
            const queue = responders.get(IMAGE_RESPONDER_KEY);
            const respond = queue?.shift();
            if (!respond) throw new Error("no scripted response queued for the finalize image call");
            return respond();
          },
        };
      }
      return {
        withStructuredOutput: (_schema: unknown, opts: { name: string }) => ({
          invoke: async () => {
            const queue = responders.get(opts.name);
            const respond = queue?.shift();
            if (!respond) throw new Error(`no scripted response queued for node "${opts.name}"`);
            return respond();
          },
        }),
      };
    }),
  };
});

import { finalize } from "../../lib/agent/nodes/finalize";
import { INITIAL_STATE, toRawIngredient } from "../../lib/agent/state";
import { signImageUrl } from "../../lib/image-url";
import { GET as imagesGET } from "../../app/api/images/[imageId]/route";
import { buildGraph, NODE_NAMES } from "../../lib/agent/graph";
import { forkReplay } from "../../lib/fork-replay";

let testDb: TestDb;
let deletePOST: typeof import("../../app/api/recipe/[sid]/delete/route").POST;
let purgeGET: typeof import("../../app/api/cron/purge/route").GET;

beforeAll(async () => {
  testDb = await startTestDb();
  await testDb.migrate();
  process.env.DATABASE_URL = testDb.connectionString;
  process.env.IMAGE_URL_SECRET = "test-secret";
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.SESSION_PURGE_DAYS = "90";
  ({ POST: deletePOST } = await import("../../app/api/recipe/[sid]/delete/route"));
  ({ GET: purgeGET } = await import("../../app/api/cron/purge/route"));
});

afterEach(() => {
  resetResponders();
});

afterAll(async () => {
  await getPool().end();
  await testDb.stop();
});

async function seedBranch(sessionId: string, clientId: string): Promise<string> {
  const pool = getPool();
  const threadId = mintThreadId();
  await insertSession({ sessionId, clientId, rootThreadId: threadId }, pool);
  await insertBranch({ threadId, sessionId }, pool);
  return threadId;
}

describe("images table", () => {
  it("round-trips real bytes via insertImage/getImageById", async () => {
    const pool = getPool();
    const threadId = await seedBranch("sess-roundtrip", "client-a");

    const bytes = Buffer.from(FIXED_IMAGE_BASE64, "base64");
    const inserted = await insertImage({ imageId: "img-roundtrip", threadId, bytes, mime: "image/png" }, pool);
    expect(inserted.image_id).toBe("img-roundtrip");
    expect(inserted.thread_id).toBe(threadId);

    const fetched = await getImageById("img-roundtrip", pool);
    expect(fetched).not.toBeNull();
    expect(fetched?.bytes.equals(bytes)).toBe(true);
    expect(fetched?.mime).toBe("image/png");
  });

  it("returns null for an unknown imageId", async () => {
    expect(await getImageById("does-not-exist", getPool())).toBeNull();
  });

  it("inserts exactly one images row per successful finalize call (FR-006 — the thumbnail is never a second generation)", async () => {
    const pool = getPool();
    const threadId = await seedBranch("sess-finalize-once", "client-b");

    queueResponse("finalize", () => ({ finalRecipe: FIXED_FINAL_RECIPE }));
    queueImageSuccess();
    const result = await finalize(INITIAL_STATE, { configurable: { thread_id: threadId } });
    expect(result.dishImage).not.toBeNull();

    const { rows } = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM images WHERE thread_id = $1",
      [threadId],
    );
    expect(rows[0]?.count).toBe(1);
  });
});

describe("GET /api/images/[imageId]", () => {
  async function seedImage(imageId: string): Promise<void> {
    const pool = getPool();
    const threadId = await seedBranch(`sess-route-${imageId}`, "client-route");
    await insertImage(
      { imageId, threadId, bytes: Buffer.from(FIXED_IMAGE_BASE64, "base64"), mime: "image/png" },
      pool,
    );
  }

  function req(url: string): Request {
    return new Request(url);
  }

  it("200s with the right bytes/mime for a valid signed URL", async () => {
    await seedImage("img-route-ok");
    const signedUrl = signImageUrl("img-route-ok");

    const res = await imagesGET(req(`http://localhost${signedUrl}`), {
      params: Promise.resolve({ imageId: "img-route-ok" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(Buffer.from(FIXED_IMAGE_BASE64, "base64"))).toBe(true);
  });

  it("403s for a tampered signature", async () => {
    await seedImage("img-route-tampered");
    const signedUrl = signImageUrl("img-route-tampered");
    const tampered = signedUrl.replace(/sig=[0-9a-f]+/, "sig=0000000000000000000000000000000000000000000000000000000000000000");

    const res = await imagesGET(req(`http://localhost${tampered}`), {
      params: Promise.resolve({ imageId: "img-route-tampered" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("invalid-signature");
  });

  it("403s for an expired signature", async () => {
    await seedImage("img-route-expired");
    // A signature computed for a timestamp already in the past.
    const expiredUrl = signImageUrl("img-route-expired", -1);

    const res = await imagesGET(req(`http://localhost${expiredUrl}`), {
      params: Promise.resolve({ imageId: "img-route-expired" }),
    });
    expect(res.status).toBe(403);
  });

  it("404s for an unknown imageId despite a validly-signed URL", async () => {
    const signedUrl = signImageUrl("img-route-does-not-exist");

    const res = await imagesGET(req(`http://localhost${signedUrl}`), {
      params: Promise.resolve({ imageId: "img-route-does-not-exist" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not-found");
  });
});

describe("fork reuses a recorded dishImage (US4, T030)", () => {
  let checkpointer: PostgresSaver;
  let app: ReturnType<ReturnType<typeof buildGraph>["compile"]>;

  const usableIngredient = {
    ...toRawIngredient("2 eggs"),
    name: "egg",
    quantity: "2",
    usable: true,
  };
  const direction = { title: "Frittata", summary: "eggy bake", whyItFits: "uses the eggs" };
  const directionSelection = {
    selectedIndex: 0,
    explanation: "Frittata makes the best use of the ingredients.",
    clearFavorite: true,
  };
  const draft = {
    title: "Spinach Frittata",
    servings: 2,
    ingredients: [{ name: "eggs", quantity: "2" }],
    steps: [{ order: 1, text: "Whisk eggs", minutes: 2, technique: null }],
    toBuy: [],
  };
  const nonBlockingCritique = {
    feasibility: "fine",
    flavorBalance: "fine",
    missingOrUnclear: [],
    blocking: false,
  };

  beforeAll(async () => {
    checkpointer = PostgresSaver.fromConnString(testDb.connectionString);
    await checkpointer.setup();
    app = buildGraph().compile({ checkpointer, interruptAfter: [...NODE_NAMES] });
  });

  afterAll(async () => {
    await checkpointer.end();
  });

  it("forking from a checkpoint after a recorded finalize reuses that checkpoint's dishImage.imageId verbatim, inserting no new images row", async () => {
    const sourceThreadId = await seedBranch("sess-fork-reuse-image", "client-fork-reuse");
    const config = { configurable: { thread_id: sourceThreadId } };

    queueResponse("parseIngredients", () => ({ ingredients: [usableIngredient] }));
    queueResponse("proposeDirections", () => ({
      directions: [direction, { ...direction, title: "Omelet" }],
    }));
    queueResponse("selectDirection", () => ({ directionSelection }));
    queueResponse("draftRecipe", () => ({ recipeDraft: draft }));
    queueResponse("critique", () => ({ critique: nonBlockingCritique }));
    queueResponse("finalize", () => ({ finalRecipe: { ...draft, ...FIXED_FINAL_RECIPE } }));
    queueImageSuccess();

    let result = await app.invoke(
      { ...INITIAL_STATE, ingredients: [toRawIngredient("2 eggs")] },
      config,
    );
    while (result.outcome === "in-progress") {
      result = await app.invoke(null, config);
    }
    expect(result.outcome).toBe("finalized");
    expect(result.dishImage).not.toBeNull();
    const originalImageId = result.dishImage!.imageId;

    const pool = getPool();
    const beforeCount = (
      await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM images")
    ).rows[0]!.count;

    const finalizeCheckpoint = await app.getState(config);
    const finalizeCheckpointId = finalizeCheckpoint.config.configurable!.checkpoint_id as string;

    const newThreadId = mintThreadId();
    // The image responder queue is already empty at this point (consumed
    // once, by the real run above) — `forkReplay` making any model call at
    // all, including a second image call, would throw ("no scripted
    // response queued") rather than silently succeed, so this resolving
    // without error already proves no extra image call happened (matches
    // fork-replay.test.ts's own "no model call during replay" assertion,
    // just via the mock's own failure mode instead of a call counter).
    const replay = await forkReplay(app, {
      sourceThreadId,
      checkpointId: finalizeCheckpointId,
      newThreadId,
      patch: {},
    });

    expect(replay.state.dishImage).not.toBeNull();
    expect(replay.state.dishImage!.imageId).toBe(originalImageId);

    const afterCount = (
      await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM images")
    ).rows[0]!.count;
    expect(afterCount).toBe(beforeCount);
  });
});

describe("updateSessionThumbnail race-safety across branches (US4, T032, FR-009)", () => {
  function dishImage(imageId: string): DishImage {
    return { imageId, focalX: 0.5, focalY: 0.5, zoom: null, alt: "Photo of Spinach Frittata" };
  }

  it("ends up pointing at whichever image has the higher `images.id` ordinal, regardless of call order — newer-finalized-first", async () => {
    const pool = getPool();
    const sessionId = "sess-thumb-race-newer-first";
    const threadId = await seedBranch(sessionId, "client-thumb-race-a");

    const older = await insertImage(
      { imageId: "img-race-a-older", threadId, bytes: Buffer.from(FIXED_IMAGE_BASE64, "base64"), mime: "image/png" },
      pool,
    );
    const newer = await insertImage(
      { imageId: "img-race-a-newer", threadId, bytes: Buffer.from(FIXED_IMAGE_BASE64, "base64"), mime: "image/png" },
      pool,
    );
    expect(newer.id).toBeGreaterThan(older.id);

    // Newer (higher ordinal) arrives first, older arrives second.
    await updateSessionThumbnail(sessionId, dishImage(newer.image_id), pool);
    await updateSessionThumbnail(sessionId, dishImage(older.image_id), pool);

    const { rows } = await pool.query<{ thumbnail_image_id: string }>(
      "SELECT thumbnail_image_id FROM sessions WHERE session_id = $1",
      [sessionId],
    );
    expect(rows[0]?.thumbnail_image_id).toBe(newer.image_id);
  });

  it("ends up pointing at whichever image has the higher `images.id` ordinal, regardless of call order — older-finalized-first", async () => {
    const pool = getPool();
    const sessionId = "sess-thumb-race-older-first";
    const threadId = await seedBranch(sessionId, "client-thumb-race-b");

    const older = await insertImage(
      { imageId: "img-race-b-older", threadId, bytes: Buffer.from(FIXED_IMAGE_BASE64, "base64"), mime: "image/png" },
      pool,
    );
    const newer = await insertImage(
      { imageId: "img-race-b-newer", threadId, bytes: Buffer.from(FIXED_IMAGE_BASE64, "base64"), mime: "image/png" },
      pool,
    );
    expect(newer.id).toBeGreaterThan(older.id);

    // Older (lower ordinal) arrives first, newer arrives second — the
    // "expected" order, included so this test suite doesn't only cover the
    // out-of-order case.
    await updateSessionThumbnail(sessionId, dishImage(older.image_id), pool);
    await updateSessionThumbnail(sessionId, dishImage(newer.image_id), pool);

    const { rows } = await pool.query<{ thumbnail_image_id: string }>(
      "SELECT thumbnail_image_id FROM sessions WHERE session_id = $1",
      [sessionId],
    );
    expect(rows[0]?.thumbnail_image_id).toBe(newer.image_id);
  });
});

describe("deletion and purge cascade to images (US5, T034/T035/T036, FR-015/016)", () => {
  async function seedSessionWithImage(sessionId: string, clientId: string): Promise<string> {
    const pool = getPool();
    const threadId = await seedBranch(sessionId, clientId);
    await insertImage(
      { imageId: `img-${sessionId}`, threadId, bytes: Buffer.from(FIXED_IMAGE_BASE64, "base64"), mime: "image/png" },
      pool,
    );
    return threadId;
  }

  it("deleting a session via its real API route leaves no images row for that session's threads (T034)", async () => {
    const sessionId = "sess-delete-cascade";
    await seedSessionWithImage(sessionId, "client-delete-cascade");
    expect(await getImageById(`img-${sessionId}`, getPool())).not.toBeNull();

    const res = await deletePOST(
      new Request(`http://localhost/api/recipe/${sessionId}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Client-Id": "client-delete-cascade" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ sid: sessionId }) },
    );
    expect(res.status).toBe(200);

    expect(await getImageById(`img-${sessionId}`, getPool())).toBeNull();
  });

  it("the cron-purge flow leaves no images row for a session aged past SESSION_PURGE_DAYS (T035)", async () => {
    const pool = getPool();
    const staleSessionId = "sess-purge-cascade-stale";
    const freshSessionId = "sess-purge-cascade-fresh";
    await seedSessionWithImage(staleSessionId, "client-purge-cascade-stale");
    await seedSessionWithImage(freshSessionId, "client-purge-cascade-fresh");

    await pool.query("UPDATE sessions SET last_activity = now() - interval '91 days' WHERE session_id = $1", [
      staleSessionId,
    ]);

    const res = await purgeGET(
      new Request("http://localhost/api/cron/purge", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);

    expect(await getImageById(`img-${staleSessionId}`, pool)).toBeNull();
    // The fresh session's image is untouched.
    expect(await getImageById(`img-${freshSessionId}`, pool)).not.toBeNull();
  });

  it("after deleting a session via its real API route, GET /api/images/[imageId] for that session's former image now 404s (T036)", async () => {
    const sessionId = "sess-delete-then-image-route";
    await seedSessionWithImage(sessionId, "client-delete-image-route");
    const imageId = `img-${sessionId}`;
    const signedUrl = signImageUrl(imageId);

    // Confirmed reachable before deletion.
    const before = await imagesGET(new Request(`http://localhost${signedUrl}`), {
      params: Promise.resolve({ imageId }),
    });
    expect(before.status).toBe(200);

    await deletePOST(
      new Request(`http://localhost/api/recipe/${sessionId}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Client-Id": "client-delete-image-route" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ sid: sessionId }) },
    );

    const after = await imagesGET(new Request(`http://localhost${signedUrl}`), {
      params: Promise.resolve({ imageId }),
    });
    expect(after.status).toBe(404);
    expect((await after.json()).error).toBe("not-found");
  });
});
