-- One LangGraph thread per branch (constitution v3.0.0, research R3): a
-- session can have many branches; each branch is realized as its own
-- LangGraph thread_id. This table links branches to each other and to their
-- owning session.
CREATE TABLE IF NOT EXISTS branches (
  thread_id                  text PRIMARY KEY,
  session_id                 text NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  parent_thread_id           text NULL REFERENCES branches(thread_id),
  forked_from_checkpoint_id  text NULL,
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branches_session_id_idx
  ON branches (session_id);
