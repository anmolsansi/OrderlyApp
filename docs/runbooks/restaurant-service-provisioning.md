# Provision a disabled live restaurant

This runbook describes the RS-67 operator command. It creates a new compatibility restaurant row and a matching `live_restaurants` row in one PostgreSQL transaction. The new live row is always created with `ordering_enabled=false`.

The command does not create an owner, copy menu items, import fixture catalog data, create tables, configure pricing, send messages, accept orders, or activate a restaurant.

## Prerequisites

- The target PostgreSQL database is the intended environment and already has the RS-02 migration `007_live_restaurants.sql` applied.
- `DATABASE_URL` points to that PostgreSQL database. It is the actual connection target.
- `ORDERLY_ENVIRONMENT` is explicitly set to the operator's environment label. This is a required declaration, not a database router or proof that `DATABASE_URL` points to the same environment. Verify both independently.
- The operator has permission to write the `restaurants` and `live_restaurants` tables.
- The input file contains only the fields listed below. Do not put secrets, credentials, customer contact details, or payment data in it.

Do not use JSON-store mode. The command requires PostgreSQL and refuses `ORDERLY_FORCE_JSON_STORE=1`.

## Input file

Create a UTF-8 JSON object outside the repository. Keep it private. On macOS/Linux, restrict its permissions before running the command:

```sh
chmod 600 /secure/path/restaurant.json
```

Example:

```json
{
  "restaurant_id": "rs67-demo-001",
  "name": "Demo Restaurant",
  "cuisine": "North Indian",
  "brand_label": "Demo Kitchen",
  "timezone": "Asia/Kolkata",
  "hours": [
    { "day": 1, "opens_minute": 540, "closes_minute": 1320 },
    { "day": 2, "opens_minute": 540, "closes_minute": 1320 },
    { "day": 3, "opens_minute": 540, "closes_minute": 1320 },
    { "day": 4, "opens_minute": 540, "closes_minute": 1320 },
    { "day": 5, "opens_minute": 540, "closes_minute": 1320 }
  ]
}
```

The accepted fields are exact. Unknown fields are rejected.

| Field | Rule |
|---|---|
| `restaurant_id` | Required string, 1–100 characters. Must not already exist in `restaurants`. |
| `name` | Required nonblank string, 1–120 characters. |
| `cuisine` | Required nonblank string. |
| `brand_label` | Required nonblank string, 1–60 characters. |
| `timezone` | Required and exactly `Asia/Kolkata`. |
| `hours` | Required array with 0–14 entries. |

Each Hours entry has `day` (ISO weekday 1–7), `opens_minute` (0–1439), and `closes_minute` (1–1440). All values must be JSON integers. `opens_minute` must be less than `closes_minute`. Entries for the same day cannot overlap. Adjacent intervals are allowed. Represent an interval that crosses midnight as two entries on consecutive days.

An empty `hours` array is valid. It does not enable ordering.

The complete input file is limited to 64 KiB. Invalid UTF-8, malformed JSON, duplicate keys, non-object JSON, unknown fields, and invalid values fail before SQL is executed.

## Run the command

Set the environment label and PostgreSQL connection using the approved environment/secret mechanism. Do not paste connection strings into source files, JSON input, tickets, or logs.

```sh
export ORDERLY_ENVIRONMENT=development
# Set DATABASE_URL through the approved local secret/configuration mechanism.
python backend/scripts/provision_live_restaurant.py --input /secure/path/restaurant.json
```

On success, stdout contains only the new `restaurant_id`. The command exits with status 0.

The command does not apply migrations. If migration 007 is missing, stop and follow the project's migration/deployment process. Do not run migrations against an unverified database as part of provisioning.

## What gets written

The command performs these writes in one database transaction:

1. Insert one `restaurants` compatibility row using the input ID, name, and cuisine.
2. Set the compatibility placeholders exactly as required by RS-67: `rating=0`, `delivery_minutes="Not offered"`, `delivery_fee_cents=0`, `image_emoji=""`, and `tags=[]`.
3. Insert one `live_restaurants` row with the input brand label, Asia/Kolkata timezone, and validated Hours.
4. Explicitly set `ordering_enabled=false`. Other DB-A fields retain their schema defaults.

No `menu_items`, `live_tables`, owner memberships, orders, payments, or provider records are created. Existing mock restaurants and their menu rows are not read or copied.

The command does not accept `synthetic`, `ordering_enabled`, pricing, owner, or menu fields. Do not use it to create a demo/synthetic-marked tenant or activate ordering. Any need to change those defaults requires an architect-approved contract change.

## Failure behavior and recovery

- Existing `restaurant_id`: exits nonzero with a safe duplicate-ID message. It never updates or adopts the existing row.
- Invalid or oversized input: exits nonzero before connecting to PostgreSQL. Error output contains field names or a safe reason, not the input contents.
- Missing environment or PostgreSQL configuration: exits nonzero before writing.
- PostgreSQL failure: exits nonzero with a generic safe error. SQL details and connection strings are not printed.
- Failure during the second insert: PostgreSQL rolls back the first insert as part of the same transaction.

The command has no delete or overwrite mode. If the wrong restaurant was provisioned, leave it disabled and escalate for an approved remediation. Do not manually delete rows or edit applied migrations.

If the process loses its connection after the database commits but before the operator receives stdout, treat the result as uncertain. Reconcile using the original `restaurant_id` by checking both `restaurants` and `live_restaurants`, and verify `ordering_enabled=false`. Do not retry with a different ID. If only one row exists, stop and investigate rather than attempting a repair through this command.

## Verification

Run the focused PostgreSQL-backed test file against an explicitly selected isolated test database:

```sh
python -m pytest backend/tests/test_live_provisioning.py
```

Run the complete backend suite for final review:

```sh
python -m pytest backend/tests
```

The test fixture requires a real PostgreSQL database in CI. A local run that skips PostgreSQL tests is not evidence for transaction rollback or tenant persistence.

Manual check:

1. Use a disposable database with migration 007 applied.
2. Provision a new synthetic test ID and verify one row exists in each table.
3. Verify `ordering_enabled=false` and that no menu item was created for the new ID.
4. Run the same input again and verify the command refuses the duplicate without changing either row.
5. Verify an existing mock restaurant and its menu rows are unchanged.
6. Confirm stdout contains only the new ID on success and errors contain no database details.

## Downstream boundary

Owner bootstrap belongs to RS-04 and is not implemented here. This runbook does not authorize an owner, grant staff permissions, or enable ordering. The restaurant remains unavailable for live orders until the later approved configuration, owner bootstrap, integration, and release gates pass.
