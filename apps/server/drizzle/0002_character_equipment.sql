CREATE TABLE IF NOT EXISTS character_equipment (
  character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot text NOT NULL,
  item_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, slot)
);
