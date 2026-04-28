ALTER TABLE character_inventory
  ADD COLUMN IF NOT EXISTS chain_token_id text NOT NULL DEFAULT '';

ALTER TABLE character_equipment
  ADD COLUMN IF NOT EXISTS chain_token_id text NOT NULL DEFAULT '';

ALTER TABLE character_inventory
  DROP CONSTRAINT IF EXISTS character_inventory_pkey;

ALTER TABLE character_inventory
  ADD PRIMARY KEY (character_id, item_id, chain_token_id);
