CREATE TABLE IF NOT EXISTS crypto_purchase_events (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  wallet_address text NOT NULL,
  character_id text REFERENCES characters(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'chain' CHECK (source IN ('chain', 'manual')),
  chain_id integer NOT NULL DEFAULT 0,
  contract_address text NOT NULL DEFAULT '',
  tx_hash text NOT NULL DEFAULT '',
  log_index integer NOT NULL DEFAULT 0,
  token_id text NOT NULL DEFAULT '',
  payment_token text NOT NULL DEFAULT '',
  payment_amount_wei text NOT NULL DEFAULT '0',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'revoked')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS crypto_purchase_events_chain_log_idx
  ON crypto_purchase_events (chain_id, tx_hash, log_index)
  WHERE tx_hash <> '';

CREATE INDEX IF NOT EXISTS crypto_purchase_events_wallet_idx
  ON crypto_purchase_events (wallet_address, product_id, created_at);

CREATE INDEX IF NOT EXISTS crypto_purchase_events_status_idx
  ON crypto_purchase_events (product_id, status, created_at);
