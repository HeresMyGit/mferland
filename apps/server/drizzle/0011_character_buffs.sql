CREATE TABLE IF NOT EXISTS character_buffs (
  character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  buff_id text NOT NULL,
  started_at bigint NOT NULL DEFAULT 0,
  expires_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, buff_id)
);

CREATE INDEX IF NOT EXISTS character_buffs_expires_at_idx
  ON character_buffs (expires_at);
