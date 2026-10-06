# ST-04 canonical catalog authority

ST-04 makes the backend catalog the authority for restaurant availability, menu-item availability, modifier validity, names, and item/option prices. C4 write inputs reject browser-submitted labels and prices. Canonical output comes from the catalog.

## Contract

ST-04 provides C3, schema version 1.

Catalog reads:

- `GET /v1/restaurants?q=&cuisine=&sort=&open_now=`
- `GET /v1/restaurants/{restaurant_id}`
- legacy `/restaurants` aliases remain available during stabilization
- legacy `query=` remains accepted as a compatibility alias when `q` is empty

The catalog response exposes:

- restaurant `is_open`
- menu-item `available`
- modifier-option `available`
- modifier-group `min_selected` and `max_selected`
- required single-choice `default_option_id`
- canonical item `price_cents`
- canonical modifier `price_delta_cents`
- canonical `delivery_fee_cents`

The current C4 write shape accepts IDs, quantities, selections and instructions. `name` and `base_price_cents` are output fields; submitting them returns 422. The legacy internal validator also replaces those values from the catalog.

## Architecture

`backend/app/catalog.py` is the domain boundary for C3. One logical request builds one `CatalogSnapshot` with indexed restaurant and menu-item lookups. Search, cart validation, and canonical item pricing operate against that same snapshot.

`backend/app/store.py` owns catalog loading. With `DATABASE_URL` configured, PostgreSQL is authoritative. JSON catalog data is used only when the project is explicitly running without the database, including the isolated test mode. API mode without PostgreSQL configuration fails closed instead of silently switching catalog authority.

`backend/app/main.py` loads one snapshot for each catalog/cart/pricing/order operation and passes it through the shared validation and pricing functions.

## Catalog normalization

Legacy rows are normalized into explicit C3 semantics.

Required single-choice groups use:

- `min_selected = 1`
- `max_selected = 1`
- an explicit `default_option_id`

When legacy seeded data has a required single-choice group with options but no explicit default, the migration and seed normalization use the first existing available option as the default. This preserves existing IDs and presentation order. Runtime cart validation does not silently add that default to a submitted cart. A missing required selection is still rejected.

Multiple-choice groups receive explicit bounds. Existing configured bounds are preserved and checked. Modifier-option availability defaults to `true` for legacy data.

Malformed authoritative catalog structures fail as catalog configuration errors rather than becoming permissive validation.

## Cart validation

The shared validator accepts at most 50 cart lines. Each line must have:

- a unique line ID
- one known restaurant shared by the whole cart
- an open restaurant
- a known and available menu item
- an integer quantity from 1 through 10
- special instructions no longer than 500 characters
- unique modifier-group entries
- only known modifier groups
- unique option IDs inside a group
- only known and available options
- selections satisfying each group's minimum and maximum

Invalid cart requests return HTTP 422 with code `invalid_cart`. `error.fields` contains stable machine-readable paths such as:

```text
items.0.menu_item_id
items.0.modifiers.1.group_id
items.0.modifiers.0.option_ids.1
items.1.restaurant_id
```

Validation errors are returned before cart/order persistence. There is no partial write.

## Canonicalization and pricing

After validation, the server rebuilds each accepted line from the catalog:

1. Keep the caller's stable line ID, quantity, selected modifier IDs, and bounded special instructions.
2. Replace the submitted item name with the canonical catalog name.
3. Replace the submitted base price with canonical `price_cents`.
4. Validate every modifier ID against the same snapshot.
5. Calculate the item unit price from canonical item price plus canonical selected option deltas.

The pricing path never falls back to submitted `base_price_cents` when a catalog lookup fails. A mismatched pricing `restaurant_id` is rejected.

ST-06 still owns the final promotion, fee, tax, and immutable receipt policy. ST-04 only establishes catalog-derived item and modifier price authority.

## Search behavior

Search keeps the existing behavior while moving it onto the canonical snapshot:

- text search checks restaurant name, cuisine, menu-item name, and menu-item description
- cuisine keeps the existing exact cuisine/tag behavior and existing all-filter aliases
- `sort=rating` sorts highest rating first
- `sort=fee` sorts lowest delivery fee first
- `sort=recommended` preserves catalog order
- `open_now=true` uses explicit `restaurant.is_open`, not menu length
- `q` and `cuisine` are bounded to 100 characters

## Database migration

`backend/migrations/003_catalog_validation.sql` is additive.

It:

- adds `restaurants.is_open BOOLEAN NOT NULL DEFAULT TRUE`
- adds `menu_items.available BOOLEAN NOT NULL DEFAULT TRUE`
- backfills missing modifier min/max/default semantics inside `modifier_groups` JSONB
- backfills missing modifier-option `available=true`
- preserves existing restaurant, item, group, and option IDs

The SQL uses `ADD COLUMN IF NOT EXISTS` and only fills missing JSON semantics, so the transformation is safe to rerun. The migration runner still records the migration in `schema_migrations` and normally applies it once.

Catalog seeding remains explicit. Runtime requests never reseed the catalog.

## Failure behavior

- missing restaurant: HTTP 404 `restaurant_not_found`
- invalid cart/catalog choice: HTTP 422 `invalid_cart`
- malformed request payload: HTTP 422 with stable field paths
- malformed authoritative catalog: HTTP 503 `catalog_unavailable`
- configured PostgreSQL failure propagates as failure; catalog reads do not switch to JSON behind the caller's back

Request IDs remain present in API error envelopes. Error fields do not include client-provided names, database details, secrets, or catalog payload contents.

## Verification

The focused ST-04 suite is `backend/tests/test_catalog.py`. It covers:

- quantity 0, 1, 10, 11, and fractional input
- special-instruction length
- required single-choice default/min/max normalization
- duplicate line/group/option IDs
- unknown groups/options
- unavailable restaurant/item/option cases
- mixed restaurants
- canonical replacement of spoofed name/base price
- no write side effect after rejected validation
- search/cuisine/open/sort behavior
- one catalog load for a search operation
- real PostgreSQL availability/search behavior
- C3 `restaurant_not_found` error semantics

The executable C3 fixture is `tests/fixtures/contracts/c3.json` and contains positive canonical authority data plus adversarial field-path examples.

Before merge, run the repository's existing ST-01 validation interfaces through GitHub Actions:

- contract fixture checks
- frontend unit/type/build checks
- backend tests with PostgreSQL
- Chromium runtime proof
- existing product E2E regression suite

## Rollback and recovery

The schema additions are backward-readable. Do not roll back to a write path that trusts submitted item names or prices.

If a catalog-validation deployment must be rolled back while the older service would restore client price authority, stop affected cart/order writes until a safe compatible version is deployed. Preserve the additive columns and catalog backup. Do not automatically import or reseed catalog data during rollback.

## Deferred work

ST-04 does not implement:

- revisioned durable carts or removal of Redis/JSON cart authority, owned by ST-05
- final promotion/tax/receipt snapshot rules, owned by ST-06
- atomic idempotent checkout, owned by ST-07
- frontend catalog/cart adapter cutover, owned by ST-08
- final checkout/profile/receipt UX hardening, owned by ST-09/ST-10

## Current acceptance

See [ST-04–ST-06 acceptance](qa/st04-st06-acceptance/acceptance.md). All fifteen C3 negative fixtures contain executable requests and are checked over HTTP for exact fields and unchanged accepted PostgreSQL baskets. The complete C3 catalog feeds C4 canonicalization and the exact C5 receipt fixture.
