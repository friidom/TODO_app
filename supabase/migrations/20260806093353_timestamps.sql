-- M2-04 · created_at / updated_at everywhere, plus the shared trigger.
--
-- docs/ARCHITECTURE.md requires id / created_at / updated_at on every entity.
-- updated_at is not bookkeeping: M6 uses it as the conflict-resolution input
-- when two clients touch the same row, so a column that is NULL or stale is a
-- column that silently loses that comparison.
--
-- State going in:
--
--   boards   created_at ✓  updated_at ✓   both not null default now() (M2-01)
--   columns  created_at ✓  updated_at ✗   created_at from the baseline
--   todos    created_at ✓  updated_at ✓   updated_at bare, added by M2-03
--
-- So this migration adds one column, normalises one default, and wires the
-- trigger to all three tables.


-- 1. columns.created_at ------------------------------------------------------
--
-- Already present from the baseline schema as `timestamptz not null default
-- now()`, so this is a no-op guard rather than a change. It is written out
-- because the task specifies the column and a reader comparing plan to
-- migration should not have to go digging to find out why it is missing.

alter table public.columns
  add column if not exists created_at timestamptz not null default now();


-- 2. columns.updated_at ------------------------------------------------------
--
-- Shaped like boards.updated_at. Adding NOT NULL together with a default is a
-- catalog-only change in Postgres 11+, so existing rows are filled with the
-- migration timestamp without a table rewrite. That start value is a lie about
-- when each row last changed, but it is a bounded one — every row is stamped
-- no later than the truth, and the trigger below corrects it on first write.

alter table public.columns
  add column if not exists updated_at timestamptz not null default now();


-- 3. todos.updated_at default ------------------------------------------------
--
-- M2-03 added this column bare, per its task description. Without a default,
-- every freshly inserted todo carries updated_at = NULL — precisely the rows
-- most likely to be involved in a concurrent edit, and exactly the case M6
-- needs the column for. A default fixes inserts declaratively, without paying
-- for a trigger invocation on every insert.
--
-- NOT NULL is deliberately NOT set here. Existing rows are still NULL, so
-- adding it would require backfilling them first — a data migration, which
-- belongs in its own file under the expand/backfill/contract rule rather than
-- smuggled into a schema migration. Left for the contract phase.

alter table public.todos
  alter column updated_at set default now();


-- 4. The shared trigger function ---------------------------------------------
--
-- A moddatetime-style function rather than the moddatetime extension: it is
-- four lines, it keeps the behaviour visible in this repository instead of in
-- an extension's version, and it needs no CREATE EXTENSION on a fresh project.
--
-- `set search_path = ''` pins resolution so the function cannot be redirected
-- by a caller's search_path. The body only calls now(), which lives in
-- pg_catalog and is always resolvable, so nothing needs qualifying.
--
-- Not SECURITY DEFINER — it runs as the invoker, which is correct: the trigger
-- only stamps a column on a row the invoker was already permitted to update.
-- Trigger functions are also necessarily VOLATILE, so the STABLE preference in
-- the review checklist does not apply.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- 5. Wire it to the three tables ---------------------------------------------
--
-- BEFORE UPDATE only. Inserts are covered by the column defaults above.
--
-- Fires on every UPDATE, including one that changes nothing — which matters
-- because reorderTodos and reorderColumns upsert the whole array, so a drag
-- stamps every row in the affected columns, not just the card that moved. That
-- is the plain moddatetime behaviour and it is what this task asks for. If M6
-- finds the write amplification meaningful, the fix is a
-- `when (old.* is distinct from new.*)` clause on these triggers, which is a
-- one-line change per trigger and needs no data migration.
--
-- Trigger names are table-prefixed so they are greppable and so dropping one
-- cannot be ambiguous.

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
  before update on public.boards
  for each row execute function public.set_updated_at();

drop trigger if exists columns_set_updated_at on public.columns;
create trigger columns_set_updated_at
  before update on public.columns
  for each row execute function public.set_updated_at();

drop trigger if exists todos_set_updated_at on public.todos;
create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();


-- RLS and grants -------------------------------------------------------------
--
-- Untouched. The new column is covered by the existing table-level grants on
-- columns, and by M0-07's table-level revoke of anon.
--
-- The trigger function needs no grant: a function returning `trigger` cannot
-- be invoked directly, only by the trigger machinery, so it is unreachable
-- from PostgREST regardless of who holds EXECUTE on it.


-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, put the following in a NEW migration:
--
--   drop trigger if exists todos_set_updated_at   on public.todos;
--   drop trigger if exists columns_set_updated_at on public.columns;
--   drop trigger if exists boards_set_updated_at  on public.boards;
--
--   drop function if exists public.set_updated_at();
--
--   alter table public.todos alter column updated_at drop default;
--   alter table public.columns drop column if exists updated_at;
--
-- columns.created_at is not listed: this migration did not create it, the
-- baseline did, and dropping it here would destroy data this task never added.
