-- ST-05: durable revisioned carts for verified guest owners.
--
-- This table is intentionally separate from legacy `carts(session_id)` rows.
-- Browser-era session identifiers are not adopted into server-issued guest
-- ownership. The migration is additive; legacy rows remain offline.

CREATE TABLE IF NOT EXISTS guest_carts (
  owner_id TEXT PRIMARY KEY REFERENCES guest_sessions(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  items JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
