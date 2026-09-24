import { createHmac, timingSafeEqual } from "node:crypto";
import type { DishImage } from "./agent/state";

/**
 * Signs/verifies short-lived image URLs (research R4, feature 007) — how
 * `<img src>` reaches a device-private image without an `X-Client-Id`
 * header, which `<img>` can't send. The signature is the whole
 * authorization boundary: it's minted only by code that already resolved a
 * `dishImage`/`thumbnail` object via an ownership-checked route, never by
 * the client. Node's built-in `crypto` only — no new dependency.
 */

function requireSecret(): string {
  const secret = process.env.IMAGE_URL_SECRET;
  if (!secret) {
    throw new Error("IMAGE_URL_SECRET is not set — required to sign/verify image URLs.");
  }
  return secret;
}

function computeSignature(imageId: string, exp: number): string {
  return createHmac("sha256", requireSecret()).update(`${imageId}.${exp}`).digest("hex");
}

/** Builds a ready-to-use `<img src>` value, e.g. from a `/step`/`/mine`/
 * `/fork`/`/state` response — never computed client-side. */
export function signImageUrl(imageId: string, ttlSeconds = 86_400): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = computeSignature(imageId, exp);
  return `/api/images/${imageId}?exp=${exp}&sig=${sig}`;
}

/** The one-liner every `state`-returning route repeats (data-model.md §6):
 * `null` in, `null` out, so callers never need their own conditional. */
export function dishImageUrl(dishImage: DishImage | null): string | null {
  return dishImage ? signImageUrl(dishImage.imageId) : null;
}

/** Used only by `GET /api/images/[imageId]` itself. Constant-time compare
 * (`timingSafeEqual`) so signature verification isn't a timing oracle. */
export function verifyImageUrl(imageId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return false;
  const expected = computeSignature(imageId, exp);
  const expectedBuf = Buffer.from(expected, "hex");
  const sigBuf = Buffer.from(sig, "hex");
  if (expectedBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(expectedBuf, sigBuf);
}
