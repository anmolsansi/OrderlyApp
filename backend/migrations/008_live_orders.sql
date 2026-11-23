-- RS-03 / CON-03: additive restaurant-owned order, receipt and command schema.
-- Existing guest/mock catalog, cart, order, receipt and idempotency storage is untouched.
-- No live tenant, money flow, provider or endpoint is enabled by this migration.
-- Only guest-scoped cart/access may be removed on guest deletion.

CREATE TABLE live_carts (
    restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
    guest_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (restaurant_id, guest_id)
);

-- Operational orders are durable restaurant-owned history, not guest-owned mock orders.
CREATE TABLE live_orders (
    restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
    id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'Submitted', 'Accepted', 'Preparing', 'Ready',
        'Completed', 'Rejected', 'Cancelled'
    )),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (restaurant_id, id)
);

-- The JSON receipt is a one-per-order snapshot bound to the same tenant/order.
-- Historical receipts are never joined to a guest_sessions row.
CREATE TABLE live_receipts (
    restaurant_id TEXT NOT NULL,
    id UUID NOT NULL,
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    PRIMARY KEY (restaurant_id, id),
    FOREIGN KEY (restaurant_id, id)
        REFERENCES live_orders(restaurant_id, id) ON DELETE RESTRICT,
    CHECK (snapshot->>'id' = id::text),
    CHECK (snapshot->>'restaurant_id' = restaurant_id)
);
