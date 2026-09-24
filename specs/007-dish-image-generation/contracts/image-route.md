# Contract: `GET /api/images/[imageId]`

New route. Serves one image's raw bytes. Deliberately **not** gated by
`X-Client-Id` (an `<img src>` cannot send it) — gated instead by a
short-lived HMAC signature minted only by code that already did the normal
ownership check (R4).

`export const runtime = "nodejs"` (touches `pg`), `export const maxDuration = 60`
(constitution Principle III) — even though this route is trivial and fast,
every route in this app carries both exports uniformly.

## Request

```
GET /api/images/{imageId}?exp={unixSeconds}&sig={hex}
```

No headers required. No body.

## Signature scheme (`lib/image-url.ts`, new — Node's built-in `crypto` only)

```ts
export function signImageUrl(imageId: string, ttlSeconds = 86_400): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", requireSecret())
    .update(`${imageId}.${exp}`)
    .digest("hex");
  return `/api/images/${imageId}?exp=${exp}&sig=${sig}`;
}

export function verifyImageUrl(imageId: string, exp: number, sig: string): boolean {
  if (Date.now() / 1000 > exp) return false;
  const expected = createHmac("sha256", requireSecret()).update(`${imageId}.${exp}`).digest("hex");
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); // constant-time compare
}
```

`requireSecret()` reads `IMAGE_URL_SECRET` and throws a clear startup-style
error if unset — same "fail fast on a missing required var" posture the
constitution already mandates for `OPENROUTER_API_KEY`/`DATABASE_URL`.

`signImageUrl` is called **only** from server code that already resolved a
`dishImage`/`thumbnail` object via an ownership-checked path (`/step`,
`/fork`, `/state`, `/mine`) — never callable by the client, never taking a
client-supplied expiry.

## Response

- **`200`**, `Content-Type: <images.mime>`, body = the raw bytes
  (`images.bytes`). `Cache-Control: private, max-age=86400` (matches the
  signature's own default TTL — no point telling a cache to keep something
  the signature itself will reject just as long).
- **`403 { error: "invalid-signature" }`** — `sig` doesn't match, or is
  missing/malformed. Deliberately generic; doesn't distinguish "expired"
  from "never valid" in the response body (nothing legitimate should be
  probing this to find out which).
- **`404 { error: "not-found" }`** — signature valid, but no `images` row
  with that `image_id` (deleted, purged, or never existed).

## Explicitly not in scope for this route

- No `X-Client-Id` check, no `sessions`/`branches` join at request time —
  the signature alone is the authorization boundary, by design (R4).
- No range requests / partial content — images are small enough (R5) that
  this isn't needed, and it isn't required by any FR/SC.
- No cross-image listing endpoint — an image is only ever reached via a
  `dishImage`/`thumbnail` object handed out by an existing ownership-checked
  route, never enumerated directly.
