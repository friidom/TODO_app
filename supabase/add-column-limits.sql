-- Run once in the Supabase SQL editor, after add-column-category.sql.
--
-- Both limits are nullable: NULL means "No limit set". They are advisory only
-- — breaching one shows a warning in the column header, it never blocks a drop.

alter table columns add column if not exists min_limit integer;
alter table columns add column if not exists max_limit integer;

alter table columns drop constraint if exists columns_limits_check;

alter table columns
  add constraint columns_limits_check
  check (
    (min_limit is null or min_limit >= 0)
    and (max_limit is null or max_limit >= 0)
    and (min_limit is null or max_limit is null or min_limit <= max_limit)
  );
