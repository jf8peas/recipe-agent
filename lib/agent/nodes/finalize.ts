import { z } from "zod";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ChatCompletionModality } from "openai/resources/chat/completions";
import { insertImage } from "../../db/images";
import { mintImageId } from "../../ids";
import { createChatModel, MODELS } from "../models";
import { dishImagePrompt, finalizePrompt } from "../prompts";
import { DishImageSchema, FinalRecipeSchema, type DishImage, type FinalRecipe, type State } from "../state";

const OutputSchema = z.object({ finalRecipe: FinalRecipeSchema });

/** The crop JSON asked for by `dishImagePrompt` — a narrower, all-but-`imageId`
 * shape than `DishImageSchema` (research R2): the model can omit `zoom`, and
 * has no way to supply `imageId`/`alt`, which the node fills in itself once
 * the image is actually stored. */
const DishImageCropSchema = z.object({
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  zoom: z.number().min(1).optional(),
});

// research.md R3 — not re-derived or re-guessed anywhere else. `SAFETY_MARGIN_MS`
// covers the image-row insert and the LangGraph checkpoint write that still
// have to happen after the image call returns; `MIN_IMAGE_BUDGET_MS` is the
// floor below which there's no plausible time left to get anything back.
export const SAFETY_MARGIN_MS = 5000;
export const MIN_IMAGE_BUDGET_MS = 5000;

// Matches every route's own `export const maxDuration = 60` (Next.js requires
// that as a literal at each route module's top level, so it can't be imported
// from here) — the same 60s Vercel function ceiling `finalize` already runs
// under today.
const MAX_DURATION_MS = 60_000;

// The text call's own hard ceiling — everything up to the same safety
// margin the image call reserves, so a slow/retrying text call can never by
// itself exceed the function's 60s limit (`createChatModel()` sets
// `maxRetries: 2` on every model unconditionally, and per-attempt
// `STAGE_TIMEOUT_MS` × up to 3 attempts can otherwise add up to well past
// 60s with nothing bounding the total — observed in production: a Vercel
// platform-level timeout with the recipe still fine afterwards, meaning the
// *image* call's own budget-aware abort worked, but nothing was bounding
// the text call the same way). A text-call timeout still fails the stage
// exactly as any other text-call error already does — this only makes sure
// that failure happens with enough time left for the route's own
// stage-failure handling to actually run, instead of Vercel hard-killing
// the whole function first.
export const TEXT_DEADLINE_MS = MAX_DURATION_MS - SAFETY_MARGIN_MS;

function parseDataUrl(url: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(url);
  const mime = match?.[1];
  const base64 = match?.[2];
  if (!mime || !base64) return null;
  return { mime, bytes: Buffer.from(base64, "base64") };
}

async function tryGenerateDishImage(
  finalRecipe: FinalRecipe,
  imageDeadlineMs: number,
  threadId: string | undefined,
  config: LangGraphRunnableConfig | undefined,
): Promise<DishImage | null> {
  if (imageDeadlineMs < MIN_IMAGE_BUDGET_MS || !threadId) return null;

  try {
    const model = createChatModel(MODELS.image, {
      // OpenRouter's `"image"` modality isn't in the upstream `openai`
      // package's own `ChatCompletionModality` union (research R1) — the cast
      // lives here, the one call site that needs it.
      modalities: ["image", "text"] as ChatCompletionModality[],
      timeoutMs: imageDeadlineMs,
    });
    const combinedSignal = config?.signal
      ? AbortSignal.any([config.signal, AbortSignal.timeout(imageDeadlineMs)])
      : AbortSignal.timeout(imageDeadlineMs);

    // Deliberately NOT spreading `...config` here (unlike the text call
    // below, which passes it exactly like every other node always has) —
    // `config` carries LangGraph's own internal callbacks/run-tree
    // metadata, which this second, independent model call has no business
    // participating in; it only needs the abort signal. (This turned out
    // not to be the cause of a separate, pre-existing retry artifact
    // documented in tests/e2e/dish-image.spec.ts's US4 test — kept anyway
    // as the more correct, minimal config to pass.)
    const response = await model.invoke(dishImagePrompt(finalRecipe), {
      signal: combinedSignal,
    });

    const content = response.content;
    if (!Array.isArray(content)) return null;
    const textBlock = content.find(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text",
    );
    const imageBlock = content.find(
      (block): block is { type: "image"; url: string } =>
        typeof block === "object" && block !== null && (block as { type?: unknown }).type === "image",
    );
    if (!textBlock || !imageBlock) return null;

    const crop = DishImageCropSchema.parse(JSON.parse(textBlock.text));
    const parsed = parseDataUrl(imageBlock.url);
    if (!parsed) return null;

    const imageId = mintImageId();
    await insertImage({ imageId, threadId, bytes: parsed.bytes, mime: parsed.mime });

    return DishImageSchema.parse({
      imageId,
      focalX: crop.focalX,
      focalY: crop.focalY,
      zoom: crop.zoom ?? null,
      alt: `Photo of ${finalRecipe.title}`,
    });
  } catch {
    // Network error, timeout/abort, invalid JSON, or an out-of-range crop —
    // all treated identically (research R2/R3): an image failure never
    // becomes a stage failure or loses the recipe text (FR-003/004).
    return null;
  }
}

export async function finalize(
  state: State,
  config?: LangGraphRunnableConfig,
): Promise<Partial<State>> {
  const startedAt = Date.now();

  const textModel = createChatModel(MODELS.default, { timeoutMs: TEXT_DEADLINE_MS }).withStructuredOutput(
    OutputSchema,
    { name: "finalize" },
  );
  const textSignal = config?.signal
    ? AbortSignal.any([config.signal, AbortSignal.timeout(TEXT_DEADLINE_MS)])
    : AbortSignal.timeout(TEXT_DEADLINE_MS);
  const result = await textModel.invoke(
    finalizePrompt(state.recipeDraft, state.constraints),
    { ...config, signal: textSignal },
  );
  const { finalRecipe } = OutputSchema.parse(result);

  const elapsedMs = Date.now() - startedAt;
  const imageDeadlineMs = MAX_DURATION_MS - elapsedMs - SAFETY_MARGIN_MS;
  const threadId = config?.configurable?.thread_id as string | undefined;
  const dishImage = await tryGenerateDishImage(finalRecipe, imageDeadlineMs, threadId, config);

  return { finalRecipe, dishImage, outcome: "finalized" };
}
