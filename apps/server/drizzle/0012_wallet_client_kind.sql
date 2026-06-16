ALTER TABLE account_wallets
  ADD COLUMN IF NOT EXISTS registered_client_kind text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS account_wallets_registered_client_kind_idx
  ON account_wallets (registered_client_kind);
