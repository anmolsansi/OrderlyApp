-- ST-06: immutable C5 receipts for verified guest owners.
--
-- New receipts are stored separately from the legacy `orders(session_id, ...)`
-- table. Legacy incomplete rows are preserved offline and are never adopted or
-- backfilled with current catalog/profile data.

CREATE TABLE IF NOT EXISTS guest_orders (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT guest_orders_snapshot_id_matches
    CHECK ((snapshot->>'id')::uuid = id),
  CONSTRAINT guest_orders_snapshot_owner_hidden
    CHECK (NOT (snapshot ? 'owner_id'))
);

CREATE INDEX IF NOT EXISTS idx_guest_orders_owner_created
  ON guest_orders(owner_id, created_at DESC, id DESC);
