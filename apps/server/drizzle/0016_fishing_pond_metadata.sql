ALTER TABLE fishing_pond_catches
  ADD COLUMN IF NOT EXISTS metadata_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata_image text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata_uri text NOT NULL DEFAULT '';
