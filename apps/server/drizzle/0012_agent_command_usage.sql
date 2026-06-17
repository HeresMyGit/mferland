CREATE TABLE agent_command_usage (
  wallet_address text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  used_seconds integer NOT NULL DEFAULT 0,
  reserved_seconds integer NOT NULL DEFAULT 0,
  reservation_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_command_usage_window_idx
  ON agent_command_usage (window_started_at);

CREATE INDEX agent_command_usage_reservation_expires_idx
  ON agent_command_usage (reservation_expires_at);
