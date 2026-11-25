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

-- Membership history belongs to the restaurant, not a guest session.
CREATE TABLE live_membership_audit (
    id UUID PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
    subject TEXT NOT NULL,
    actor TEXT NOT NULL,
    old_role TEXT NULL,
    new_role TEXT NOT NULL,
    old_active BOOLEAN NULL,
    new_active BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX live_membership_audit_restaurant
    ON live_membership_audit (restaurant_id, created_at, id);

CREATE TRIGGER live_membership_audit_immutable
    BEFORE UPDATE OR DELETE ON live_membership_audit
    FOR EACH ROW EXECUTE FUNCTION live_reject_history_mutation();
