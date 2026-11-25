-- RS-04 / CON-04: additive live-v1 identity storage.
-- Existing mock identity and restaurant activation are unchanged.
CREATE TABLE live_memberships (
    restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
    clerk_user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'order_staff', 'cashier')),
    active BOOLEAN NOT NULL DEFAULT true,
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (restaurant_id, clerk_user_id)
);
