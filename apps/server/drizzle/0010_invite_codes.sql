CREATE TABLE IF NOT EXISTS invite_codes (
  code text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_wallet_address text NOT NULL DEFAULT '',
  claimed_account_id text REFERENCES accounts(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS invite_codes_claimed_wallet_idx
  ON invite_codes (claimed_wallet_address);

CREATE INDEX IF NOT EXISTS invite_codes_claimed_at_idx
  ON invite_codes (claimed_at);
