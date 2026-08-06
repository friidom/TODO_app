-- M0-07 · Close the authorization holes recorded in docs/RLS_AUDIT.md.
--
-- Before this migration `todos` and `columns` had row-level security disabled
-- while granting ALL to `anon` — the publishable key that ships inside the
-- client bundle. Every row in both tables was readable, writable and deletable
-- by anyone, with no account required.
--
-- Interim ownership model: a row belongs to the user named in its `user_id`.
-- M3 replaces this with board-membership policies.
--
-- `service_role` is unaffected throughout: it carries the BYPASSRLS attribute,
-- so policies are never consulted for it. Its grants are left intact.
--
-- Every statement is idempotent, so this is safe to re-run against a database
-- where part of it already landed. It runs in a single transaction, so a
-- failure at any point leaves the previous security posture unchanged.


-- 1. Remove anonymous access -------------------------------------------------
--
-- Nothing in the application talks to the database unauthenticated: every read
-- and write goes through an authenticated Supabase client.
--
-- `profiles` is left alone deliberately — it is already protected by RLS, and
-- signUp() writes to it, so revoking there is a separate change with its own
-- blast radius. `authenticated` keeps its grants, including USAGE on the
-- sequence, which INSERT into `todos` needs.

revoke all on table public.todos from anon;
revoke all on table public.columns from anon;
revoke all on sequence public.todos_id_seq from anon;


-- 2. Fix the columns.user_id default -----------------------------------------
--
-- MUST come before the policies below: it is load-bearing, not cosmetic.
--
-- reorderColumns() upserts `{ id, position }` and reorderTodos() upserts
-- `{ id, position, column_id }` — neither sends `user_id`. PostgREST turns
-- those into INSERT ... ON CONFLICT (id) DO UPDATE, and Postgres evaluates the
-- INSERT policy's WITH CHECK against the *proposed* row, whose `user_id`
-- therefore comes from the column default.
--
-- `todos.user_id` already defaults to auth.uid(), so it passes. `columns`
-- defaulted to gen_random_uuid() — a value that can never equal auth.uid() —
-- so enabling RLS without this line would make every column drag fail the
-- INSERT check and silently revert.
--
-- NOT NULL and the missing foreign key to auth.users are deliberately NOT
-- added here: those are contract-phase changes that can fail on pre-existing
-- rows, and belong in their own migration per the expand/backfill/contract
-- rule.

alter table public.columns alter column user_id set default auth.uid();


-- 3. Enable row-level security -----------------------------------------------
--
-- Until this runs, the policies below are inert: Postgres does not consult
-- policies on a table whose RLS is disabled. Takes a brief ACCESS EXCLUSIVE
-- lock on each table.

alter table public.todos enable row level security;
alter table public.columns enable row level security;


-- 4. Owner policies ----------------------------------------------------------
--
-- The four verbs are spelled out separately rather than as one FOR ALL policy,
-- because the upsert paths need to be explicit: an upsert is checked against
-- the INSERT policy's WITH CHECK (proposed row), the UPDATE policy's USING
-- (existing row) and the UPDATE policy's WITH CHECK (updated row). All three
-- must pass. A missing UPDATE policy does not raise an error — it silently
-- drops the write, surfacing as drags that revert on refresh.
--
-- `(select auth.uid())` rather than a bare `auth.uid()`: the sub-select is
-- evaluated once per statement as an InitPlan instead of once per row.
--
-- A NULL `user_id` (possible on `columns`, which is nullable) yields NULL from
-- the comparison, which both USING and WITH CHECK treat as failure — such rows
-- are invisible and unwritable. That is the intended deny-by-default.

drop policy if exists "Users select own todos" on public.todos;
create policy "Users select own todos" on public.todos
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users insert own todos" on public.todos;
create policy "Users insert own todos" on public.todos
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users update own todos" on public.todos;
create policy "Users update own todos" on public.todos
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users delete own todos" on public.todos;
create policy "Users delete own todos" on public.todos
  for delete to authenticated
  using (user_id = (select auth.uid()));


drop policy if exists "Users select own columns" on public.columns;
create policy "Users select own columns" on public.columns
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users insert own columns" on public.columns;
create policy "Users insert own columns" on public.columns
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users update own columns" on public.columns;
create policy "Users update own columns" on public.columns
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users delete own columns" on public.columns;
create policy "Users delete own columns" on public.columns
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- 5. Indexes backing the policy predicates -----------------------------------
--
-- Every policy above filters on `user_id`, and the database had no index on
-- either column — only primary keys. Without these, each RLS check is a
-- sequential scan. fetchTodos() also filters on `user_id` directly.
--
-- Created non-concurrently on purpose: CONCURRENTLY cannot run inside a
-- transaction, and these tables are small enough that the brief lock is
-- cheaper than splitting the migration.

create index if not exists todos_user_id_idx on public.todos (user_id);
create index if not exists columns_user_id_idx on public.columns (user_id);


-- Rollback -------------------------------------------------------------------
--
-- Forward-only, per the migration strategy: to reverse, put the following in a
-- NEW migration. It restores the exact prior state, which had no policies on
-- either table and RLS disabled on both.
--
--   drop policy if exists "Users select own todos"   on public.todos;
--   drop policy if exists "Users insert own todos"   on public.todos;
--   drop policy if exists "Users update own todos"   on public.todos;
--   drop policy if exists "Users delete own todos"   on public.todos;
--   drop policy if exists "Users select own columns" on public.columns;
--   drop policy if exists "Users insert own columns" on public.columns;
--   drop policy if exists "Users update own columns" on public.columns;
--   drop policy if exists "Users delete own columns" on public.columns;
--
--   alter table public.todos   disable row level security;
--   alter table public.columns disable row level security;
--
--   alter table public.columns alter column user_id set default gen_random_uuid();
--
--   grant all on table public.todos      to anon;
--   grant all on table public.columns    to anon;
--   grant all on sequence public.todos_id_seq to anon;
--
--   drop index if exists public.todos_user_id_idx;
--   drop index if exists public.columns_user_id_idx;
--
-- Reversing re-opens the unauthenticated hole. Prefer fixing forward.
