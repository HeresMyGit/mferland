CREATE TABLE IF NOT EXISTS season_referrals (
  id text PRIMARY KEY,
  season_id text NOT NULL,
  referrer_wallet_address text NOT NULL,
  referrer_character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  referee_wallet_address text NOT NULL,
  referee_character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  post_activation_base_points integer NOT NULL DEFAULT 0 CHECK (post_activation_base_points >= 0),
  referrer_bonus_points integer NOT NULL DEFAULT 0 CHECK (referrer_bonus_points >= 0),
  referee_bonus_points integer NOT NULL DEFAULT 0 CHECK (referee_bonus_points >= 0),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS season_referrals_referee_unique_idx
  ON season_referrals (season_id, referee_wallet_address);

CREATE INDEX IF NOT EXISTS season_referrals_referrer_idx
  ON season_referrals (season_id, referrer_wallet_address, created_at);
