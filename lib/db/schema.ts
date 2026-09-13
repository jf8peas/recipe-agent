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
