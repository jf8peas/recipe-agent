-- App-level session. NOT a LangGraph thread id (constitution v3.0.0) — a
-- session can span multiple branches, each its own LangGraph thread; see
-- 0003_branches.sql. root_thread_id is a convenience pointer to the session's
-- first branch.
CREATE TABLE IF NOT EXISTS sessions (
  session_id     text PRIMARY KEY,
  client_id      text NOT NULL,
  root_thread_id text NOT NULL,
  title          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_activity  timestamptz NOT NULL DEFAULT now(),
  stage_count    integer NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'capped'))
);

CREATE INDEX IF NOT EXISTS sessions_client_id_last_activity_idx
  ON sessions (client_id, last_activity DESC);
