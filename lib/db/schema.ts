import { z } from "zod";

export const SessionStatusSchema = z.enum(["active", "capped"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// `session_id` is an app-level id — NOT a LangGraph thread id (constitution
// v3.0.0). A session can have many branches, each its own LangGraph thread;
// see BranchRowSchema below.
export const SessionRowSchema = z.object({
  session_id: z.string(),
  client_id: z.string(),
  root_thread_id: z.string(),
  title: z.string().nullable(),
  created_at: z.coerce.date(),
  last_activity: z.coerce.date(),
  stage_count: z.number().int().nonnegative(),
  status: SessionStatusSchema,
  // Denormalized "current best thumbnail" (feature 007, data-model.md §5) —
  // set by updateSessionThumbnail, read by GET /mine. All null until the
  // session's first branch finalizes with a usable image.
  thumbnail_image_id: z.string().nullable(),
  thumbnail_focal_x: z.number().nullable(),
  thumbnail_focal_y: z.number().nullable(),
  thumbnail_zoom: z.number().nullable(),
  thumbnail_alt: z.string().nullable(),
});
export type SessionRow = z.infer<typeof SessionRowSchema>;

// One row per branch; `thread_id` is the LangGraph thread realizing it
// (research R3). `parent_thread_id` + `forked_from_checkpoint_id` are null
// for a session's root branch.
export const BranchRowSchema = z.object({
  thread_id: z.string(),
  session_id: z.string(),
  parent_thread_id: z.string().nullable(),
  forked_from_checkpoint_id: z.string().nullable(),
  created_at: z.coerce.date(),
});
export type BranchRow = z.infer<typeof BranchRowSchema>;

// One row per generated dish image (feature 007) — `id` is an internal
// ordinal never exposed externally, used only to give "most recently
// finalized" a deterministic tie-break (data-model.md §3); `image_id` is
// the opaque, unguessable external-facing reference held in graph state and
// signed image URLs. `bytes` comes back from `pg` as a Buffer.
export const ImageRowSchema = z.object({
  id: z.coerce.number(),
  image_id: z.string(),
  thread_id: z.string(),
  bytes: z.instanceof(Buffer),
  mime: z.string(),
  created_at: z.coerce.date(),
});
export type ImageRow = z.infer<typeof ImageRowSchema>;

export const UsageEventKindSchema = z.enum(["start", "stage", "rejected-limit"]);
export type UsageEventKind = z.infer<typeof UsageEventKindSchema>;

export const UsageEventRowSchema = z.object({
  id: z.coerce.number(),
  client_id: z.string(),
  thread_id: z.string().nullable(),
  kind: UsageEventKindSchema,
  created_at: z.coerce.date(),
});
export type UsageEventRow = z.infer<typeof UsageEventRowSchema>;
