"""Verify the actual login role, not a SET ROLE simulation, at the staff boundary."""
from .staff_memberships import unavailable


def assert_staff_runtime_role(conn):
    row = conn.execute("""
        SELECT current_user = session_user
          AND NOT (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
          AND NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid)
          AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
          AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
          AND NOT EXISTS (SELECT 1 FROM pg_database d WHERE d.datname = current_database() AND d.datdba = r.oid)
          AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = 'public' AND c.relname IN ('live_membership_audit', 'live_restaurants', 'restaurants') AND c.relowner = r.oid)
          AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.proname = 'live_reject_history_mutation' AND p.proowner = r.oid)
          AND NOT has_table_privilege(current_user, 'public.live_membership_audit', 'DELETE,TRUNCATE,TRIGGER')
          AND NOT has_any_column_privilege(current_user, 'public.live_membership_audit', 'UPDATE')
          AND has_table_privilege(current_user, 'public.live_membership_audit', 'INSERT')
          -- Exact reviewed CON-09 allowlist. The compatibility row is also
          -- protected against broad or inherited writes; activation/scope/pricing
          -- and all other columns remain forbidden.
          AND NOT EXISTS (
              SELECT 1 FROM (VALUES
                ('public.restaurants', 'name'), ('public.restaurants', 'is_open'),
                ('public.live_restaurants', 'version'), ('public.live_restaurants', 'brand_label'),
                ('public.live_restaurants', 'hours'), ('public.live_restaurants', 'updated_at')
              ) AS allowed(table_name, column_name)
              WHERE NOT has_column_privilege(current_user, allowed.table_name, allowed.column_name, 'UPDATE')
          )
          AND NOT EXISTS (
              SELECT 1 FROM (VALUES ('public.live_restaurants'), ('public.restaurants')) AS target(table_name)
              WHERE has_table_privilege(current_user, target.table_name, 'UPDATE,DELETE,TRUNCATE,TRIGGER')
                 OR has_any_column_privilege(current_user, target.table_name, 'INSERT')
          )
          AND NOT EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attnum > 0 AND NOT a.attisdropped
                AND ((a.attrelid = 'public.live_restaurants'::regclass
                      AND a.attname NOT IN ('version','brand_label','hours','updated_at'))
                  OR (a.attrelid = 'public.restaurants'::regclass
                      AND a.attname NOT IN ('name','is_open')))
                AND has_column_privilege(current_user, a.attrelid, a.attnum, 'UPDATE')
          )
          AS safe
        FROM pg_roles r WHERE r.rolname = current_user
        """).fetchone()
    if row is None or not row["safe"]:
        raise unavailable()
