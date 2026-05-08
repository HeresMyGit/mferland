ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS name_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS appearance_traits jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE characters
SET name_locked_at = COALESCE(name_locked_at, created_at)
WHERE name_locked_at IS NULL;
