-- M5-x · Work type on todos. SAFE. Tier A.
--
-- The card and the create form have carried a work-type control since the M3 UI
-- pass, backed by nothing — `todos` has no column for it, so the icon was
-- hard-coded and the dropdown was inert. This adds the column the UI already
-- assumes.
--
-- Four static values, so a CHECK constraint rather than a lookup table — the
-- same shape `todos.priority` (M2-03) and `columns.category` use. A table for
-- four values that never change would be a join on every board load and a
-- migration to add a fifth either way.
--
-- Not an enum type either, for the reason the rest of the schema avoids them:
-- adding a value to a Postgres enum cannot run inside a transaction with other
-- DDL in older versions, and removing one is not supported at all. A CHECK is
-- edited by dropping and re-adding it, which a forward-only migration can do.


-- 1. The column ----------------------------------------------------------------
--
-- Added with its default in one statement. In Postgres 11+ that is a
-- catalog-only change — the "fast default" optimisation means existing rows are
-- not rewritten and the table is not scanned, so the ACCESS EXCLUSIVE lock is
-- held for microseconds regardless of how many rows exist.
--
-- The default is what populates existing rows: every one of them reads 'Task'
-- immediately, which is exactly the backfill this task asks for. A separate
-- `update ... set type = 'Task'` would be a full table rewrite achieving the
-- same result more slowly, so it is deliberately not here.
--
-- NOT NULL is safe in the same statement for the same reason: the default
-- guarantees no row can be null at any point, so the constraint has nothing to
-- reject.
--
-- Values are capitalised — 'Bug', 'Task', 'Story', 'Feature' — because that is
-- how the product names them and how they are rendered. `priority` chose
-- lowercase; the inconsistency is real but harmless, and normalising priority
-- would be an unrelated data migration.

alter table public.todos
  add column if not exists type text not null default 'Task';


-- 2. Allowed values -------------------------------------------------------------
--
-- Drop-then-add rather than an inline constraint: `add column if not exists`
-- skips the entire statement when the column is already present, which would
-- silently skip an inline CHECK too and leave the column unconstrained. Naming
-- it explicitly also pins the name Postgres would otherwise generate.
--
-- Unlike `todos_priority_check` this rejects NULL implicitly — the column is
-- NOT NULL, so "unset" is not a state work type has. Every work item is
-- something; a task with no type is a task.

alter table public.todos drop constraint if exists todos_type_check;

alter table public.todos
  add constraint todos_type_check
  check (type in ('Bug', 'Task', 'Story', 'Feature'));


-- 3. What is deliberately NOT changed --------------------------------------------
--
-- RLS. `type` is covered by the existing policies exactly as every other column
-- is: M3-05 gates INSERT/UPDATE/DELETE on `board_role(board_id) in ('owner',
-- 'admin','editor')` for the whole row, and policies are not per-column. An
-- editor may set a work type because an editor may edit the card; there is no
-- new rule here and no policy to write.
--
-- Grants. `authenticated` already holds INSERT/UPDATE on todos from M0-07, and
-- privileges are table-level, so a new column needs none of its own.
--
-- No index. Four values across a board's worth of rows is not selective enough
-- for one to be used, and nothing queries by type — the board fetch is
-- `where board_id = ...` and filters client-side.


-- Rollback ------------------------------------------------------------------------
--
-- Forward-fix in a NEW migration:
--
--   alter table public.todos drop constraint if exists todos_type_check;
--   alter table public.todos drop column if exists type;
--
-- Dropping the column destroys every work type ever set, which is data rather
-- than structure — so this is Tier A to apply and closer to Tier B to reverse.
-- Reverse only while the UI still tolerates the column's absence.


-- Verification ----------------------------------------------------------------------
--
--   -- the column exists, is NOT NULL, and defaults to Task
--   select column_name, is_nullable, column_default, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'todos' and column_name = 'type';
--   -- expect: type | NO | 'Task'::text | text
--
--   -- every existing row was populated
--   select count(*) from public.todos where type is null;          -- expect 0
--   select type, count(*) from public.todos group by type;         -- expect all Task
--
--   -- the constraint rejects anything else
--   insert into public.todos (id, board_id, title, type)
--   values (gen_random_uuid(), '<board>', 'x', 'Epic');
--   -- expect: new row violates check constraint "todos_type_check"
--
--   -- and accepts the four
--   update public.todos set type = 'Bug' where id = '<a card>';    -- expect: 1 row
--
-- AFTER APPLYING: run `npm run db:types`. Until then src/types/database.ts is
-- ahead of the database — the column is declared there so the UI compiles, and
-- regenerating is what makes that declaration authoritative rather than assumed.
