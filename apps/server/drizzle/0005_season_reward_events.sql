CREATE TABLE IF NOT EXISTS season_reward_events (
  id text PRIMARY KEY,
  season_id text NOT NULL,
  character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  points integer NOT NULL CHECK (points > 0),
  status text NOT NULL DEFAULT 'pending',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  distributed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS season_reward_events_unique_source_idx
  ON season_reward_events (season_id, character_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS season_reward_events_wallet_idx
  ON season_reward_events (season_id, wallet_address, created_at);

CREATE INDEX IF NOT EXISTS season_reward_events_status_idx
  ON season_reward_events (season_id, status, created_at);
