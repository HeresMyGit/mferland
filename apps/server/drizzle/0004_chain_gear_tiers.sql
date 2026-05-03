ALTER TABLE character_inventory
  ADD COLUMN IF NOT EXISTS chain_tier integer NOT NULL DEFAULT 1;

ALTER TABLE character_equipment
  ADD COLUMN IF NOT EXISTS chain_tier integer NOT NULL DEFAULT 1;
