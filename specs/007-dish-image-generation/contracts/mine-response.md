# Contract change: `GET /api/recipe/mine`

Additive only — every existing field, status code, and error shape is
unchanged. Same auth/ownership rules as today (`X-Client-Id` required;
returns only the caller's own sessions).

## Response — before

```json
{
  "sessions": [
    { "sessionId": "…", "title": "Spinach Frittata", "lastActivity": "2026-…", "status": "active" }
  ]
}
```

## Response — after

```json
{
  "sessions": [
    {
      "sessionId": "…",
      "title": "Spinach Frittata",
      "lastActivity": "2026-…",
      "status": "active",
      "thumbnail": {
        "imageId": "img_…",
        "url": "/api/images/img_…?exp=1758…&sig=…",
        "focalX": 0.62,
        "focalY": 0.41,
        "zoom": 1.15,
        "alt": "Photo of Spinach Frittata"
      }
    },
    {
      "sessionId": "…",
      "title": "Untitled session",
      "lastActivity": "2026-…",
      "status": "active",
      "thumbnail": null
    }
  ]
}
```

`thumbnail` is `null` for a session with no finalized branch, or whose most
recently finalized branch's image generation failed (FR-005) — the client
renders the same neutral placeholder either way; the response doesn't (and
doesn't need to) distinguish those cases.

`url` is a fully-formed, ready-to-use signed URL (see
[image-route.md](image-route.md)) — the client drops it directly into
`<img src>`, no further client-side computation. It's freshly signed on
every `/mine` call (not stored), so it's never stale relative to whatever
TTL is configured, regardless of how long ago the image itself was
generated.

## Equivalent shape from the on-device path

`hooks/useSessionList.ts`'s `LocalSessionEntry.thumbnail` is shaped
identically (`{ imageId, url, focalX, focalY, zoom, alt } | null`), so
`components/SessionList.tsx`/`components/ui/ListRow.tsx` render both sources
through one code path with no branching on where the data came from
(FR-014's "must work in both").
