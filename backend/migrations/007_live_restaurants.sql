-- RS-02 / CON-02: additive live-v1 restaurant configuration.
-- No live restaurant is provisioned or activated by this migration.
-- Existing mock restaurants, carts and receipts remain independent.
-- Hours validation is the responsibility of the future Pydantic write boundary (RS-09).
CREATE TABLE live_restaurants (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE RESTRICT,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  catalog_version BIGINT NOT NULL DEFAULT 1 CHECK (catalog_version > 0),
  brand_label TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata' CHECK (timezone = 'Asia/Kolkata'),
  hours JSONB NOT NULL DEFAULT '[]'::jsonb,
  ordering_enabled BOOLEAN NOT NULL DEFAULT false,
  pricing_version BIGINT NOT NULL DEFAULT 1,
  pricing_profile JSONB NULL,
  synthetic BOOLEAN NOT NULL DEFAULT false,
  demo_owner_id TEXT NULL REFERENCES guest_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tables are tenant-scoped by composite identity; no cross-restaurant uniqueness
-- is imposed on table UUIDs or labels.
CREATE TABLE live_tables (
  restaurant_id TEXT NOT NULL REFERENCES live_restaurants(restaurant_id) ON DELETE RESTRICT,
  id UUID NOT NULL,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 30),
  active BOOLEAN NOT NULL DEFAULT true,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (restaurant_id, id),
  UNIQUE (restaurant_id, label)
);
