-- ST-04 canonical catalog validation fields.
-- Additive and safe to rerun. Existing IDs and catalog rows are preserved.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT TRUE;

-- Make legacy modifier JSON explicit without changing existing IDs, names, or prices.
-- Runtime validation still rejects malformed groups. This backfill only supplies
-- missing semantics needed by C3.
UPDATE menu_items AS item
SET modifier_groups = COALESCE(
  (
    SELECT jsonb_agg(
      normalized.group_value
      ORDER BY normalized.group_ordinality
    )
    FROM (
      SELECT
        groups.group_ordinality,
        groups.group_value
          || CASE
               WHEN NOT (groups.group_value ? 'min_selected') THEN
                 jsonb_build_object(
                   'min_selected',
                   CASE
                     WHEN COALESCE((groups.group_value ->> 'required')::boolean, FALSE) THEN 1
                     ELSE 0
                   END
                 )
               ELSE '{}'::jsonb
             END
          || CASE
               WHEN NOT (groups.group_value ? 'max_selected')
                    AND groups.group_value ->> 'type' = 'single' THEN
                 jsonb_build_object('max_selected', 1)
               WHEN NOT (groups.group_value ? 'max_selected')
                    AND groups.group_value ->> 'type' = 'multiple'
                    AND jsonb_array_length(COALESCE(groups.group_value -> 'options', '[]'::jsonb)) > 0 THEN
                 jsonb_build_object(
                   'max_selected',
                   jsonb_array_length(COALESCE(groups.group_value -> 'options', '[]'::jsonb))
                 )
               ELSE '{}'::jsonb
             END
          || CASE
               WHEN groups.group_value ->> 'type' = 'single'
                    AND COALESCE((groups.group_value ->> 'required')::boolean, FALSE)
                    AND NOT (groups.group_value ? 'default_option_id')
                    AND jsonb_array_length(COALESCE(groups.group_value -> 'options', '[]'::jsonb)) > 0 THEN
                 jsonb_build_object(
                   'default_option_id',
                   (
                     SELECT default_option.option_value ->> 'id'
                     FROM jsonb_array_elements(
                       COALESCE(groups.group_value -> 'options', '[]'::jsonb)
                     ) WITH ORDINALITY AS default_option(option_value, option_ordinality)
                     WHERE COALESCE(
                       (default_option.option_value ->> 'available')::boolean,
                       TRUE
                     )
                     ORDER BY default_option.option_ordinality
                     LIMIT 1
                   )
                 )
               ELSE '{}'::jsonb
             END
          || jsonb_build_object(
               'options',
               COALESCE(
                 (
                   SELECT jsonb_agg(
                     options.option_value
                       || CASE
                            WHEN options.option_value ? 'available' THEN '{}'::jsonb
                            ELSE jsonb_build_object('available', TRUE)
                          END
                     ORDER BY options.option_ordinality
                   )
                   FROM jsonb_array_elements(
                     COALESCE(groups.group_value -> 'options', '[]'::jsonb)
                   ) WITH ORDINALITY AS options(option_value, option_ordinality)
                 ),
                 '[]'::jsonb
               )
             ) AS group_value
      FROM jsonb_array_elements(
        COALESCE(item.modifier_groups, '[]'::jsonb)
      ) WITH ORDINALITY AS groups(group_value, group_ordinality)
    ) AS normalized
  ),
  '[]'::jsonb
);
