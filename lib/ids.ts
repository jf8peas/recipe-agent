import { randomBytes, randomUUID } from "node:crypto";

/** App-level session id: 32-byte base64url, minted by `/start` (data-model.md § 3). */
export function mintSessionId(): string {
  return randomBytes(32).toString("base64url");
}

/** A LangGraph `thread_id` realizing one branch (constitution v3.0.0). */
export function mintThreadId(): string {
  return randomUUID();
}
