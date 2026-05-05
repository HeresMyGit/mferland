CREATE TABLE IF NOT EXISTS crypto_market_quotes (
  id text PRIMARY KEY,
  token_symbol text NOT NULL,
  token_address text NOT NULL,
  chain_id text NOT NULL,
  quote_symbol text NOT NULL,
  source text NOT NULL DEFAULT 'dexscreener' CHECK (source IN ('dexscreener')),
  dex_id text NOT NULL DEFAULT '',
  pair_address text NOT NULL DEFAULT '',
  pair_url text NOT NULL DEFAULT '',
  price_native text NOT NULL CHECK (price_native <> ''),
  price_usd text NOT NULL DEFAULT '',
  liquidity_usd text NOT NULL DEFAULT '',
  volume_24h text NOT NULL DEFAULT '',
  fetched_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  raw_json text NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS crypto_market_quotes_token_idx
  ON crypto_market_quotes (chain_id, token_address, quote_symbol);

CREATE INDEX IF NOT EXISTS crypto_market_quotes_fetched_idx
  ON crypto_market_quotes (fetched_at);
