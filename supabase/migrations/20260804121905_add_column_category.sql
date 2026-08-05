-- Run once in the Supabase SQL editor.
--
-- Category is a fixed 3-value enum, so it lives on `columns` as a constrained
-- text field — no lookup table. The colours are presentation and stay in the
-- frontend (src/constants/columns.ts), so retuning the palette or adding a
-- dark-mode variant never needs a migration.

alter table columns
  add column if not exists category text not null default 'todo';

alter table columns
  drop constraint if exists columns_category_check;

alter table columns
  add constraint columns_category_check
  check (category in ('todo', 'in_progress', 'done'));

-- Backfill the four columns seeded at signup ('To Do' already defaults right).
update columns set category = 'in_progress' where title in ('In Progress', 'In Review');
update columns set category = 'done'        where title = 'Done';
