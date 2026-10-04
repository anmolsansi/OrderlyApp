-- ST-02: server-issued guest identity.
--
-- Guest ownership is additive. Existing carts/orders keep their historical
-- session_id values and are not adopted into a guest automatically.

CREATE TABLE IF NOT EXISTS guest_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_expires_at
  ON guest_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_active_expiry
  ON guest_sessions(expires_at)
  WHERE revoked_at IS NULL;
