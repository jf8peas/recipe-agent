import { randomBytes, randomUUID } from "node:crypto";

/** App-level session id: 32-byte base64url, minted by `/start` (data-model.md § 3). */
export function mintSessionId(): string {
  return randomBytes(32).toString("base64url");
}

/** A LangGraph `thread_id` realizing one branch (constitution v3.0.0). */
export function mintThreadId(): string {
  return randomUUID();
}

/** A dish image's opaque id — random, never derived from `session_id`/
 * `thread_id` (feature 007, research R4), so it carries no session identity
 * on its own; access is gated by `lib/image-url.ts`'s signed URL instead. */
export function mintImageId(): string {
  return randomUUID();
}
