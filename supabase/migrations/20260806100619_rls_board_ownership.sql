-- M2-08 · Rewrite RLS in terms of board ownership. HIGH RISK.
--
-- This migration IS the authorization boundary. Until now a row on `columns`
-- or `todos` belonged to whoever was named in its user_id; from here it
-- belongs to whoever owns its board. Nothing else in Milestone 2 changes who
-- can see what — this does.
--
-- ============================================================================
-- PRECONDITIONS — all three, in order.
-- ============================================================================
--
--   1. M2-06 applied and verified. Every row needs a board_id, because
--      board_id is about to become the only thing the policies look at. A row
--      with a NULL board_id becomes invisible to everyone the moment this
--      runs — `null in (select ...)` is NULL, which USING treats as failure.
--
--   2. M2-07 applied. NOT NULL is what makes "no row has a NULL board_id" an
--      invariant rather than a hope.
--
--   3. M2-11 deployed. Same reason M2-07 needs it, plus one more that is
--      specific to this migration and easy to miss — see the upsert note
--      below.
--
--
-- ⚠ THE UPSERT PATH — read this before applying.
--
-- reorderTodos upserts { id, position, column_id } and reorderColumns upserts
-- { id, position }. Neither sends board_id. PostgREST turns an upsert into
-- INSERT ... ON CONFLICT (id) DO UPDATE, and the INSERT policy's WITH CHECK is
-- evaluated against the PROPOSED row — whose board_id, absent from the payload
-- and without a column default, is NULL.
--
-- So after this migration those upserts fail the INSERT policy, on top of
-- already failing M2-07's NOT NULL. M2-11 must add board_id to both reorder
-- payloads.
--
-- M0-07 hit the same shape and solved it with a column default
-- (`columns.user_id default auth.uid()`). That escape hatch does not exist
-- here: board_id depends on which board, not which user, so the database
-- cannot infer it. The client has to send it.
--
-- This is the failure mode M0-07's comments warned about — a policy that
-- rejects a write does not raise anything the user sees, it just drops it.
-- It surfaces as drags that revert on refresh. M1-07's toasts are what make
-- it visible; without them this would be silent.
--
--
-- BACKUP
--
--   supabase db dump --db-url "$PROD_URL" \
--     -f backups/pre-m2-08-$(date +%Y%m%d-%H%M).sql
--
--   Policy changes touch no data, but each CREATE POLICY takes a brief lock
--   on its table.
--
--
-- MIGRATION
--
--   Branch database first, full multi-user test, then production during low
--   traffic. Watch the browser network tab for 403s for fifteen minutes
--   after. A too-tight policy shows up as silent write failures, not errors.


-- 1. The predicate, in one place ---------------------------------------------
--
-- Every policy below defers to this function. That is deliberate: M3 replaces
-- owner-only access with board_members, and when it does, the change is this
-- function's body — not eight policy definitions that have to be kept in step
-- with each other.
--
-- Returns a SET rather than taking a board_id and returning boolean. The
-- difference matters for the query plan: a no-argument STABLE function is
-- independent of the row being checked, so `board_id in (select ...)` is
-- planned as an InitPlan and evaluated ONCE per statement. The boolean form
-- would be called once per row, which on a board-load of a few hundred todos
-- is a few hundred index lookups instead of one.
--
-- SECURITY DEFINER because the policies on `columns` and `todos` need to read
-- `boards` to reach a verdict. As SECURITY INVOKER that read would itself be
-- filtered by the policies on `boards`, nesting policy evaluation inside
-- policy evaluation. It happens to work for owner-only access, but it stops
-- working in M3: a board_members policy that reads board_members recurses.
-- Establishing the pattern now means M3 changes a body, not a strategy.
--
-- STABLE, per the review checklist, and with an explicit empty search_path so
-- the body cannot be redirected by a caller's search_path — the standard
-- hardening for a SECURITY DEFINER function. Every reference inside is
-- schema-qualified as a result.

create or replace function public.accessible_board_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
  from public.boards b
  where b.owner_id = (select auth.uid());
$$;

comment on function public.accessible_board_ids() is
  'Board ids the current user may access. Single swap point for the RLS '
  'predicate: M3 widens this to board_members without touching any policy.';


-- 2. Function grants ---------------------------------------------------------
--
-- A function is granted EXECUTE to PUBLIC by default, so the revoke is the
-- part that does the work. anon reaching this would get auth.uid() = NULL and
-- therefore no rows, but a SECURITY DEFINER function should not be callable by
-- a role that has no business calling it.

revoke all on function public.accessible_board_ids() from public, anon;
grant execute on function public.accessible_board_ids() to authenticated;
grant execute on function public.accessible_board_ids() to service_role;


-- 3. Retire the user_id policies ---------------------------------------------
--
-- These must be dropped, not merely superseded. Postgres policies are
-- PERMISSIVE by default, which means they are OR'd together: leaving the old
-- ones in place would keep user_id as a second, independent route to every
-- row, and the ownership migration would be cosmetic.
--
-- Their exact definitions are preserved in the rollback section at the bottom
-- of this file. They stay recoverable only while user_id still exists on these
-- tables — M2-13 drops it, and at that moment these policies become
-- unrestorable. That is one of the reasons M2-13 is last.

drop policy if exists "Users select own todos" on public.todos;
drop policy if exists "Users insert own todos" on public.todos;
drop policy if exists "Users update own todos" on public.todos;
drop policy if exists "Users delete own todos" on public.todos;

drop policy if exists "Users select own columns" on public.columns;
drop policy if exists "Users insert own columns" on public.columns;
drop policy if exists "Users update own columns" on public.columns;
drop policy if exists "Users delete own columns" on public.columns;


-- 4. Board-ownership policies ------------------------------------------------
--
-- Four verbs spelled out separately rather than one FOR ALL, for the reason
-- M0-07 recorded: an upsert is checked against the INSERT policy's WITH CHECK
-- (proposed row), the UPDATE policy's USING (existing row) and the UPDATE
-- policy's WITH CHECK (updated row). All three must pass, and a missing UPDATE
-- policy fails silently rather than loudly.
--
-- UPDATE carries both USING and WITH CHECK deliberately. USING alone would let
-- a user move a row OUT of their board and into someone else's by updating
-- board_id — the old row passes, and nothing checks the new one. WITH CHECK
-- closes that.

create policy "Board owner selects todos" on public.todos
  for select to authenticated
  using (board_id in (select public.accessible_board_ids()));

create policy "Board owner inserts todos" on public.todos
  for insert to authenticated
  with check (board_id in (select public.accessible_board_ids()));

create policy "Board owner updates todos" on public.todos
  for update to authenticated
  using (board_id in (select public.accessible_board_ids()))
  with check (board_id in (select public.accessible_board_ids()));

create policy "Board owner deletes todos" on public.todos
  for delete to authenticated
  using (board_id in (select public.accessible_board_ids()));


create policy "Board owner selects columns" on public.columns
  for select to authenticated
  using (board_id in (select public.accessible_board_ids()));

create policy "Board owner inserts columns" on public.columns
  for insert to authenticated
  with check (board_id in (select public.accessible_board_ids()));

create policy "Board owner updates columns" on public.columns
  for update to authenticated
  using (board_id in (select public.accessible_board_ids()))
  with check (board_id in (select public.accessible_board_ids()));

create policy "Board owner deletes columns" on public.columns
  for delete to authenticated
  using (board_id in (select public.accessible_board_ids()));


-- 5. What is deliberately NOT changed ----------------------------------------
--
-- `boards` keeps the owner-based policies from M2-01. The task says so, and
-- routing them through accessible_board_ids() would be circular — that
-- function reads boards.
--
-- `profiles` keeps its baseline policy. Board sharing makes other users'
-- profiles readable (M3 needs names and avatars for members), but widening
-- profiles is a change with its own blast radius and belongs to the milestone
-- that needs it.
--
-- The user_id columns and their indexes stay. Nothing reads them for
-- authorization after this, but they are the rollback path and the source of
-- truth M2-13 will drop.


-- AFTER APPLYING -------------------------------------------------------------
--
-- The task's tests. The curl ones are the only real proof — the UI proves
-- nothing about RLS, because it never asks for rows it does not expect.
--
--   -- as the owner: the whole Smoke checklist, then specifically
--   -- drag a card and drag a column. Those are the upsert paths, and they
--   -- are what a missing UPDATE or INSERT policy breaks silently.
--
--   -- as user B, with B's real token, against A's board:
--   curl "$URL/rest/v1/columns?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $B_JWT"
--   curl "$URL/rest/v1/todos?select=*"   -H "apikey: $ANON" -H "Authorization: Bearer $B_JWT"
--   -- expect [] for both, not A's rows
--
--   curl -X PATCH "$URL/rest/v1/todos?id=eq.<A's todo id>" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $B_JWT" \
--     -H "Content-Type: application/json" -d '{"title":"pwned"}'
--   -- expect 0 rows affected, and A's title unchanged
--
--   curl -X POST "$URL/rest/v1/todos" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $B_JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"title":"x","board_id":"<A''s board id>","column_id":"<A''s column>"}'
--   -- expect 42501 row-level security violation
--
--   curl -X DELETE "$URL/rest/v1/todos?id=eq.<A's todo id>" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $B_JWT"
--   -- expect 0 rows affected, and A's todo still present
--
-- An empty array from a SELECT is a pass, not an inconclusive result: it means
-- the policy filtered the rows out. A 200 with A's data in it is the failure.


-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, put the following in a NEW migration. These are
-- the M0-07 definitions verbatim, and they are valid only while user_id still
-- exists on both tables:
--
--   drop policy if exists "Board owner selects todos" on public.todos;
--   drop policy if exists "Board owner inserts todos" on public.todos;
--   drop policy if exists "Board owner updates todos" on public.todos;
--   drop policy if exists "Board owner deletes todos" on public.todos;
--   drop policy if exists "Board owner selects columns" on public.columns;
--   drop policy if exists "Board owner inserts columns" on public.columns;
--   drop policy if exists "Board owner updates columns" on public.columns;
--   drop policy if exists "Board owner deletes columns" on public.columns;
--
--   create policy "Users select own todos" on public.todos
--     for select to authenticated
--     using (user_id = (select auth.uid()));
--   create policy "Users insert own todos" on public.todos
--     for insert to authenticated
--     with check (user_id = (select auth.uid()));
--   create policy "Users update own todos" on public.todos
--     for update to authenticated
--     using (user_id = (select auth.uid()))
--     with check (user_id = (select auth.uid()));
--   create policy "Users delete own todos" on public.todos
--     for delete to authenticated
--     using (user_id = (select auth.uid()));
--
--   create policy "Users select own columns" on public.columns
--     for select to authenticated
--     using (user_id = (select auth.uid()));
--   create policy "Users insert own columns" on public.columns
--     for insert to authenticated
--     with check (user_id = (select auth.uid()));
--   create policy "Users update own columns" on public.columns
--     for update to authenticated
--     using (user_id = (select auth.uid()))
--     with check (user_id = (select auth.uid()));
--   create policy "Users delete own columns" on public.columns
--     for delete to authenticated
--     using (user_id = (select auth.uid()));
--
--   drop function if exists public.accessible_board_ids();
--
-- Reverting restores a working boundary, not an open one — M0-07's model was
-- correct for a single-user application. It only stops being correct once
-- boards are shared, which is M3.
