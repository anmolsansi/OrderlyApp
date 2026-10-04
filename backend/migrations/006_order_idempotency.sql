-- ST-07: guest-scoped idempotency ledger for atomic C6 checkout.
--
-- The ledger is additive and retained with accepted guest orders so a client can
-- safely recover an unknown outcome by replaying the exact same key and body.

CREATE TABLE IF NOT EXISTS order_idempotency (
  owner_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES guest_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  CONSTRAINT order_idempotency_key_length
    CHECK (char_length(idempotency_key) BETWEEN 1 AND 64),
  CONSTRAINT order_idempotency_key_uuid
    CHECK (idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CONSTRAINT order_idempotency_payload_sha256
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_order_idempotency_order
  ON order_idempotency(order_id);
