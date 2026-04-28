CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  privy_user_id text UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_wallets (
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  wallet_address text PRIMARY KEY,
  wallet_type text NOT NULL DEFAULT 'external',
  primary_wallet boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_wallets_account_id_idx ON account_wallets(account_id);

CREATE TABLE IF NOT EXISTS characters (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  avatar_seed integer NOT NULL,
  level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  talent_points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS characters_account_id_idx ON characters(account_id);

CREATE TABLE IF NOT EXISTS character_quests (
  character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id text NOT NULL,
  status text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  required integer NOT NULL DEFAULT 1,
  flags text NOT NULL DEFAULT '',
  completed_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, quest_id)
);

CREATE TABLE IF NOT EXISTS character_inventory (
  character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, item_id)
);

CREATE TABLE IF NOT EXISTS character_talents (
  character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tree text NOT NULL,
  node_id text NOT NULL,
  rank integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, tree, node_id)
);
