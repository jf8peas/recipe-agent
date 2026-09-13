CREATE TABLE IF NOT EXISTS usage_events (
  id          bigserial PRIMARY KEY,
  client_id   text NOT NULL,
  thread_id   text,
  kind        text NOT NULL CHECK (kind IN ('start', 'stage', 'rejected-limit')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_client_id_created_at_idx
  ON usage_events (client_id, created_at);

CREATE INDEX IF NOT EXISTS usage_events_kind_created_at_idx
  ON usage_events (kind, created_at);
