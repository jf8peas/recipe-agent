import { ChatOpenAI } from "@langchain/openai";
import type { ChatCompletionModality } from "openai/resources/chat/completions";
import { createFakeChatModel } from "./fake-model";

/**
 * All model IDs resolve only here (constitution Principle I). All three are
 * OpenRouter model IDs consumed via `@langchain/openai` pointed at
 * OpenRouter's base URL — never a provider-specific SDK. Fallback IDs (R5)
 * keep the app runnable if an operator forgets to set the env var.
 */
const DEFAULT_FALLBACK = "openai/gpt-4.1-mini";
const CRITIQUE_FALLBACK = "anthropic/claude-sonnet-5";
// Feature 007 — image generation, never text. See contracts/finalize-node.md
// for why `finalize` uses this key (not MODELS.default) for its image call.
const IMAGE_FALLBACK = "google/gemini-2.5-flash-image";

export const MODELS = {
  get default(): string {
    return process.env.MODEL_DEFAULT ?? DEFAULT_FALLBACK;
  },
  get critique(): string {
    return process.env.MODEL_CRITIQUE ?? CRITIQUE_FALLBACK;
  },
  get image(): string {
    return process.env.MODEL_IMAGE ?? IMAGE_FALLBACK;
  },
};

export interface CreateChatModelOptions {
  /** OpenRouter's `"image"` modality isn't in the upstream `openai` SDK's
   * own `ChatCompletionModality` union (`'text' | 'audio'`) — it's an
   * OpenRouter extension `@langchain/openai` already forwards verbatim and
   * already parses `message.images[]` out of (research R1). The caller casts
   * `"image"` in; nothing here needs to. */
  modalities?: ChatCompletionModality[];
  /** Per-call override of the client timeout, independent of the shared
   * `STAGE_TIMEOUT_MS` default — used by `finalize`'s image call to fit
   * whatever budget remains after the text call (research R3), never by any
   * other node. */
  timeoutMs?: number;
}

/**
 * Every node's model call goes through this — the only place OpenRouter is
 * wired up (research R5). Cancellation goes through the `signal` in the
 * RunnableConfig passed to `.invoke()`, not a constructor option (research R6).
 *
 * `RECIPE_AGENT_FAKE_MODEL=1` swaps in a deterministic fixture model
 * (`./fake-model.ts`) instead of a real OpenRouter call — set only by the
 * e2e test server (`scripts/e2e-server.ts`), never in production.
 */
export function createChatModel(
  modelId: string,
  options?: CreateChatModelOptions,
): ChatOpenAI | ReturnType<typeof createFakeChatModel> {
  if (process.env.RECIPE_AGENT_FAKE_MODEL === "1") {
    return createFakeChatModel();
  }
  return new ChatOpenAI({
    model: modelId,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.PUBLIC_URL ?? "",
        "X-Title": "Recipe Agent",
      },
    },
    modalities: options?.modalities,
    timeout: options?.timeoutMs ?? Number(process.env.STAGE_TIMEOUT_MS ?? 45000),
    maxRetries: 2,
  });
}
