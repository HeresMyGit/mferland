CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  session_id text NOT NULL DEFAULT '',
  character_id text REFERENCES characters(id) ON DELETE SET NULL,
  identity_type text NOT NULL DEFAULT '',
  wallet_hash text NOT NULL DEFAULT '',
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx
  ON analytics_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_character_created_idx
  ON analytics_events (character_id, created_at DESC)
  WHERE character_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_wallet_created_idx
  ON analytics_events (wallet_hash, created_at DESC)
  WHERE wallet_hash <> '';

CREATE INDEX IF NOT EXISTS analytics_events_session_created_idx
  ON analytics_events (session_id, created_at DESC)
  WHERE session_id <> '';
