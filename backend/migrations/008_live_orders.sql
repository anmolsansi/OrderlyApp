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

-- Guest visibility can expire independently of restaurant-owned order history.
CREATE TABLE live_guest_access (
    restaurant_id TEXT NOT NULL,
    order_id UUID NOT NULL,
    guest_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
    revoked_at TIMESTAMPTZ NULL,
    PRIMARY KEY (restaurant_id, order_id, guest_id),
    FOREIGN KEY (restaurant_id, order_id)
        REFERENCES live_orders(restaurant_id, id) ON DELETE RESTRICT
);

-- Operational events are append-only and versions are unique per restaurant/order.
-- Payment actions may also advance an order version, so event versions need not
-- be contiguous.
CREATE TABLE live_order_events (
    restaurant_id TEXT NOT NULL,
    order_id UUID NOT NULL,
    id UUID NOT NULL,
    version BIGINT NOT NULL,
    from_status TEXT NULL,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (restaurant_id, id),
    UNIQUE (restaurant_id, order_id, version),
    FOREIGN KEY (restaurant_id, order_id)
        REFERENCES live_orders(restaurant_id, id) ON DELETE RESTRICT
);

-- Payment ledger is a record of at-restaurant payments, not online settlement.
-- A reversal must refer to an event for the SAME restaurant and SAME order.
-- Full-payment and reversal eligibility are later service-level locked-order checks.
CREATE TABLE live_payment_events (
    restaurant_id TEXT NOT NULL,
    order_id UUID NOT NULL,
    id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('recorded', 'reversed')),
    reverses_id UUID NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    currency TEXT NOT NULL CHECK (currency = 'INR'),
    method TEXT NULL CHECK (method IN ('cash', 'upi', 'card', 'other')),
    actor TEXT NOT NULL,
    reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (restaurant_id, id),
    UNIQUE (restaurant_id, order_id, id),
    UNIQUE (restaurant_id, reverses_id),
    FOREIGN KEY (restaurant_id, order_id)
        REFERENCES live_orders(restaurant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (restaurant_id, order_id, reverses_id)
        REFERENCES live_payment_events(restaurant_id, order_id, id) ON DELETE RESTRICT
);
