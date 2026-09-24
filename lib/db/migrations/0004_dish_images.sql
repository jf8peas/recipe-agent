-- Dish images (feature 007). Bytes live here, not in graph state or a
-- checkpoint (constitution Principle II) — State only ever holds a
-- reference (image_id) plus crop metadata. `id` (bigserial) is an internal
-- ordinal never exposed externally, used only to give "which image is
-- newer" a deterministic answer independent of timestamptz precision
-- (data-model.md §3) — same shape as usage_events' own bigserial-plus-
-- natural-key pattern.
CREATE TABLE IF NOT EXISTS images (
  id          bigserial PRIMARY KEY,
  image_id    text UNIQUE NOT NULL,
  thread_id   text NOT NULL REFERENCES branches(thread_id) ON DELETE CASCADE,
  bytes       bytea NOT NULL,
  mime        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS images_thread_id_idx ON images (thread_id);

-- Denormalized "current best thumbnail" per session (data-model.md §5) —
-- avoids scanning every branch's checkpoints on every /mine request.
-- ON DELETE SET NULL (not CASCADE): if an image row is ever removed while
-- its session survives, don't leave a dangling pointer; the real
-- deletion/purge path removes the session row itself in the same
-- statement anyway (data-model.md §3).
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS thumbnail_image_id text NULL REFERENCES images(image_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_focal_x   real NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_focal_y   real NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_zoom      real NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_alt       text NULL;
