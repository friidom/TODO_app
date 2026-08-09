-- M2-14 · Migrate todos.id from integer identity to uuid. HIGH RISK. BREAKING.
--
-- todos.id was the last integer key in the schema — columns.id, profiles.id,
-- boards.id are all uuid. Three things follow from the mismatch:
--
--   1. Optimistic inserts had to mint a fake id with Date.now(), which lives in
--      the same space as the real sequence, which is why the row needed an
--      isOptimistic flag to be told apart from a real one.
--   2. Sequential ids leak the total row count.
--   3. Under M6 realtime, a client-generated uuid makes echo suppression an
--      identity match instead of bespoke de-duplication.
--
-- The whole swap runs in one transaction — the CLI wraps each migration in one,
-- which is why there is no explicit begin/commit here. A partial primary-key
-- swap leaves the table unusable, so it either completes or it does not.
--
-- Deploy the frontend half in the same window. There is no version of the app
-- that tolerates both id types.
--
-- NO legacy_id. The plan offers one to keep `KAN-{id}` stable for existing
-- users, but M2-21 lands immediately after this and replaces that label with a
-- per-board key. Preserving the integer would mean carrying a column whose only
-- reader is deleted in the next migration.


-- 1. Preflight: nothing may reference todos.id --------------------------------
--
-- This is precisely why the plan puts this task in M2. Once M7 adds
-- comments.todo_id, every referencing table needs the same swap in the same
-- transaction and this stops being a twenty-line migration.

do $$
declare
  refs text;
begin
  select string_agg(conrelid::regclass::text || '.' || conname, ', ')
  into refs
  from pg_constraint
  where contype = 'f'
    and confrelid = 'public.todos'::regclass;

  if refs is not null then
    raise exception
      'M2-14: foreign keys still reference todos.id: %. Swap them in this '
      'same transaction or this migration is not safe.', refs;
  end if;
end $$;


-- 2. Mint a uuid for every existing row ---------------------------------------
--
-- gen_random_uuid() is VOLATILE, so the default is evaluated per row and the
-- table is rewritten — which is what makes this a genuine backfill rather than
-- every row sharing one value. Core since PG13; no pgcrypto needed.

alter table public.todos
  add column id_new uuid not null default gen_random_uuid();


-- 3. Swap the primary key -----------------------------------------------------
--
-- Dropping the old column takes the identity sequence (public.todos_id_seq)
-- and its grants with it, since the sequence is owned by the column.
--
-- The new id lands last in the column order rather than first. That is
-- cosmetic — PostgREST selects by name — and correcting it would mean
-- rewriting the table a second time.

alter table public.todos drop constraint todos_pkey;
alter table public.todos drop column id;
alter table public.todos rename column id_new to id;
alter table public.todos add constraint todos_pkey primary key (id);


-- The default stays -----------------------------------------------------------
--
-- The client now supplies the id on insert — that is the point of the change,
-- and it is what lets the optimistic row and the server row be the same row.
-- The default remains as the backstop for any insert that omits it (the M2-21
-- trigger, psql, a future RPC), so an omitted id is a valid row rather than a
-- not-null violation.


-- Rollback --------------------------------------------------------------------
--
-- None. The integer ids are gone the moment step 3 drops the column, and
-- nothing on the row records what they were — that is the deliberate
-- consequence of skipping legacy_id. Recovery is PITR or the dump.


-- Verification -----------------------------------------------------------------
--
--   select data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'todos' and column_name = 'id';
--   -- expect: uuid
--
--   select count(*) = count(distinct id) from public.todos;
--   -- expect: true
--
--   select count(*) from public.todos where id is null;
--   -- expect: 0
--
-- Then in the browser: every existing card still renders, and create, rename,
-- delete, drag within a column and drag across columns all still work.
