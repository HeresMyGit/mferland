CREATE TABLE IF NOT EXISTS fishing_pond_catches (
  catch_id text PRIMARY KEY,
  character_id text REFERENCES characters(id) ON DELETE SET NULL,
  wallet_address text NOT NULL,
  attempt_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'voucher_issued', 'tx_submitted', 'confirmed', 'expired', 'failed')),
  chain_id integer NOT NULL,
  contract_address text NOT NULL,
  token_standard text NOT NULL CHECK (token_standard IN ('ERC721', 'ERC1155')),
  collection_address text NOT NULL,
  token_id text NOT NULL,
  amount text NOT NULL DEFAULT '1',
  pond_entry_id text NOT NULL,
  metadata_name text NOT NULL DEFAULT '',
  metadata_description text NOT NULL DEFAULT '',
  metadata_image text NOT NULL DEFAULT '',
  metadata_uri text NOT NULL DEFAULT '',
  voucher_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  tx_hash text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  tx_submitted_at timestamptz,
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS fishing_pond_catches_wallet_idx
  ON fishing_pond_catches (wallet_address, created_at);

CREATE INDEX IF NOT EXISTS fishing_pond_catches_status_idx
  ON fishing_pond_catches (status, created_at);

CREATE INDEX IF NOT EXISTS fishing_pond_catches_tx_hash_idx
  ON fishing_pond_catches (chain_id, tx_hash)
  WHERE tx_hash <> '';
