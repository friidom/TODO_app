-- M3-05 · Columns and todos RLS via membership helpers. HIGH RISK.
--
-- The other half of the boundary. M3-04 let a member see the board row; this
-- lets them see what is on it, and decides who may change it.
--
-- The spec, IMPLEMENTATION_PLAN.md line 1008:
--
--     "Read for any member; write for `editor` and above; `viewer` read-only."
--
--
-- ⚠ BLAST RADIUS — larger than M3-04's, in the other direction.
--
-- M3-04 could only fail to GRANT: a mistake there left a board invisible to a
-- member who should have seen it. A mistake here REVOKES — a wrong
-- accessible_board_ids() takes every column and every card away from the
-- owner of every board. The read path of the entire application runs through
-- the function replaced in section 2.
--
--
-- SCOPE
--
--   · accessible_board_ids() is widened. That alone widens all four SELECT
--     policies, because their predicate already defers to it — the "single
--     swap point M3 widens without touching a policy" M2-08 built. Confirmed
--     before writing this: those eight policies are the ONLY callers of the
--     function anywhere in the schema or the application.
--   · The four SELECT policies are RENAMED, not recreated. Their predicate is
--     already correct; only their names ("Board owner selects todos") become
--     false. ALTER POLICY ... RENAME TO changes the name without retyping an
--     authorization rule, which is the whole point — six write policies are
--     enough opportunity to mistype one.
--   · The six write policies are replaced with role-gated predicates.
--
-- NOT in scope: boards RLS (M3-04, complete), board_members' own policy (still
-- M3-01's self-read; M3-07 needs it widened and no task owns that yet),
-- profiles (M2-08 deferred it; M3-07 needs it too), and the UI (M3-09).
--
--
-- PRECONDITIONS
--
--   1. M3-04 applied and verified. A member can already SELECT the board row.
--   2. public.board_role(uuid) exists with EXECUTE granted to `authenticated`.
--      UNVERIFIED AT RUNTIME so far — see the preflight in Verification. If
--      that grant is missing, every write to columns and todos fails for every
--      user including owners, the moment this applies.
--   3. M3-03 verified: every board has an owner membership row. That is what
--      makes the union in section 2 a superset of the old behaviour rather
--      than a replacement of it.
--
--
-- BACKUP — NOT TAKEN. No dump (Docker unavailable, no connection string),
-- PITR is NOT enabled on this project, no branch-database rehearsal.
--
--   As in M3-04, the requirement that actually governs reversal was met
--   instead: section 1 captures the exact prior state, and rollback is
--   forward-fix SQL, not a restore — no row is written, read or deleted here.
--   State the asymmetry plainly though: a bad M3-04 cost the visibility of a
--   board shell; a bad M3-05 costs an owner the entire contents of their board
--   until it is reverted. Apply off-peak and check an owner's board first.


-- 1. Captured pre-change state -------------------------------------------------
--
-- Verbatim, so reversal is copy-paste rather than reconstruction.
--
--   create or replace function public.accessible_board_ids()
--   returns setof uuid
--   language sql
--   stable
--   security definer
--   set search_path = ''
--   as $$
--     select b.id
--     from public.boards b
--     where b.owner_id = (select auth.uid());
--   $$;
--
-- And the eight policies, all carrying the identical predicate
-- `board_id in (select public.accessible_board_ids())`:
--
--   "Board owner selects todos"    select   using
--   "Board owner inserts todos"    insert   with check
--   "Board owner updates todos"    update   using + with check
--   "Board owner deletes todos"    delete   using
--   "Board owner selects columns"  select   using
--   "Board owner inserts columns"  insert   with check
--   "Board owner updates columns"  update   using + with check
--   "Board owner deletes columns"  delete   using


-- 2. Widen the swap point ------------------------------------------------------
--
-- The read half of this migration, in one function body. Nothing below it
-- changes a SELECT policy, because none needs changing.
--
-- The owner branch is KEPT rather than replaced by the membership branch, for
-- the reason M3-04 recorded and the same one applies here: after M3-03 every
-- board has an owner membership row, so it is redundant today — but it is the
-- only path back from a lost one. A membership-only definition means a board
-- whose owner row is deleted has contents nobody can see, including the owner,
-- with no UI able to repair it. `union` (not `union all`) deduplicates the
-- overlap, which for an owner is every one of their boards.
--
-- CREATE OR REPLACE preserves ownership and privileges, so M2-08's grants —
-- revoked from public and anon, granted to authenticated and service_role —
-- survive untouched. The signature is unchanged, so this replaces the function
-- rather than adding an overload, and no type regeneration is needed.

create or replace function public.accessible_board_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
  from public.boards b
  where b.owner_id = (select auth.uid())
  union
  select m.board_id
  from public.board_members m
  where m.user_id = (select auth.uid());
$$;

comment on function public.accessible_board_ids() is
  'Board ids the current user may READ: boards they own, union boards they '
  'hold any membership on. Row-independent and set-returning, so policies '
  'using it plan as an InitPlan evaluated once per statement. Read only — '
  'write access is role-gated through board_role() in the policies.';


-- 3. Rename the four SELECT policies -------------------------------------------
--
-- Names only. "Board owner selects todos" describing a policy that returns a
-- viewer's rows is worse than no name; M2-08 set this convention when it
-- renamed the M0-07 policies for the same reason.
--
-- ALTER POLICY ... RENAME TO deliberately, not drop-and-create: the predicate
-- is already right, and retyping `board_id in (select ...)` four times to
-- change a string is four chances to get an authorization rule wrong for no
-- benefit. There is no IF EXISTS form, which is correct here — if one of these
-- is missing, something is wrong and the migration should stop.

alter policy "Board owner selects todos"
  on public.todos rename to "Members select todos";

alter policy "Board owner selects columns"
  on public.columns rename to "Members select columns";


-- 4. Replace the six write policies --------------------------------------------
--
-- board_role() rather than is_board_member(): this is the one place in M3
-- where the answer depends on WHICH role, so it is the one place the
-- role-returning helper is the right tool.
--
-- A non-member gets NULL from board_role(), and `null in ('owner','admin',
-- 'editor')` is NULL, which USING and WITH CHECK both treat as failure. So
-- denial falls out of the same expression that grants, with no separate null
-- branch to forget. A viewer gets 'viewer', which is simply not in the list.
--
-- USING vs WITH CHECK, since both appear on UPDATE and the distinction is what
-- makes the rule sound:
--
--   USING      is tested against the row AS IT EXISTS. It answers "may you
--              touch this row at all", and filters rows out invisibly.
--   WITH CHECK is tested against the row AS PROPOSED. It answers "may the
--              result exist", and raises 42501 when violated.
--
-- UPDATE needs both. USING alone would let an editor on board A move a card
-- INTO board B by updating board_id — the existing row passes, and nothing
-- examines the new one. WITH CHECK closes that, and requires write access on
-- the destination too. INSERT has no existing row, so it takes WITH CHECK
-- only; DELETE produces no new row, so it takes USING only.
--
-- The role list is spelled out six times because a policy cannot be
-- parameterised. If the writable set ever changes, that is six edits to a
-- security rule — and that is the point at which a `writable_board_ids()`
-- set-returning helper mirroring accessible_board_ids() earns its place. It
-- would also restore InitPlan evaluation on bulk upserts; see Verification.

drop policy if exists "Board owner inserts todos" on public.todos;
create policy "Editors and above insert todos" on public.todos
  for insert to authenticated
  with check (public.board_role(board_id) in ('owner', 'admin', 'editor'));

drop policy if exists "Board owner updates todos" on public.todos;
create policy "Editors and above update todos" on public.todos
  for update to authenticated
  using      (public.board_role(board_id) in ('owner', 'admin', 'editor'))
  with check (public.board_role(board_id) in ('owner', 'admin', 'editor'));

drop policy if exists "Board owner deletes todos" on public.todos;
create policy "Editors and above delete todos" on public.todos
  for delete to authenticated
  using (public.board_role(board_id) in ('owner', 'admin', 'editor'));


drop policy if exists "Board owner inserts columns" on public.columns;
create policy "Editors and above insert columns" on public.columns
  for insert to authenticated
  with check (public.board_role(board_id) in ('owner', 'admin', 'editor'));

drop policy if exists "Board owner updates columns" on public.columns;
create policy "Editors and above update columns" on public.columns
  for update to authenticated
  using      (public.board_role(board_id) in ('owner', 'admin', 'editor'))
  with check (public.board_role(board_id) in ('owner', 'admin', 'editor'));

drop policy if exists "Board owner deletes columns" on public.columns;
create policy "Editors and above delete columns" on public.columns
  for delete to authenticated
  using (public.board_role(board_id) in ('owner', 'admin', 'editor'));


-- 5. Why this cannot recurse ---------------------------------------------------
--
--   select * from public.todos
--     → todos SELECT policy → accessible_board_ids()  [SECURITY DEFINER]
--     → reads public.boards and public.board_members as the owner, RLS not
--       applied to either → returns a set of uuids
--
--   update public.todos ...
--     → todos UPDATE policy → board_role(board_id)    [SECURITY DEFINER]
--     → reads public.board_members as the owner → returns text
--
-- Neither re-enters policy evaluation, so neither can cycle.
--
-- The subtle one, worth stating because it is new as of M3-04:
-- accessible_board_ids() reads `boards`, and boards now has a policy that
-- calls is_board_member(). Because accessible_board_ids() is SECURITY DEFINER,
-- that read is not policy-filtered and M3-04's policy is never evaluated
-- inside it. As SECURITY INVOKER it would still terminate — is_board_member()
-- is itself DEFINER — but it would nest policy evaluation inside policy
-- evaluation on every row. Definer rights keep the whole graph one level deep.
--
-- No policy in this file queries board_members directly. That is not because
-- columns and todos would recurse if they did — they would not — but because
-- the direct sub-select is the pattern that recurses the moment it is copied
-- onto board_members itself, which M3-07 will need to do.


-- Rollback ----------------------------------------------------------------------
--
-- Forward-only. To reverse, put this in a NEW migration:
--
--   create or replace function public.accessible_board_ids()
--   returns setof uuid language sql stable security definer set search_path = ''
--   as $$
--     select b.id from public.boards b where b.owner_id = (select auth.uid());
--   $$;
--
--   alter policy "Members select todos"   on public.todos   rename to "Board owner selects todos";
--   alter policy "Members select columns" on public.columns rename to "Board owner selects columns";
--
--   drop policy if exists "Editors and above insert todos" on public.todos;
--   create policy "Board owner inserts todos" on public.todos
--     for insert to authenticated
--     with check (board_id in (select public.accessible_board_ids()));
--   -- ... and the same shape for update (using + with check), delete, and the
--   -- three column equivalents, all with the identical predicate.
--
-- Reverting the function alone is enough to stop the bleeding in an incident:
-- it immediately restores owner-only reads AND owner-only writes, because the
-- role-gated policies still consult board_role(), which for an owner returns
-- 'owner'. The policy rollback is then cleanup rather than emergency.


-- Verification --------------------------------------------------------------------
--
-- PREFLIGHT — run BEFORE applying. The first is the total-failure case.
--
--   select has_function_privilege('authenticated', 'public.board_role(uuid)',
--            'EXECUTE');                                     -- expect true
--   select has_function_privilege('authenticated',
--            'public.accessible_board_ids()', 'EXECUTE');    -- expect true
--
--   -- the fixture board must not be empty, or "viewer can read" is
--   -- indistinguishable from "viewer is denied"
--   select (select count(*) from public.columns where board_id = '5819a045-0bca-4a8a-9dc1-a67f7911b854') as cols,
--          (select count(*) from public.todos   where board_id = '5819a045-0bca-4a8a-9dc1-a67f7911b854') as cards;
--   -- both must be > 0
--
--   select user_id, role from public.board_members
--   where board_id = '5819a045-0bca-4a8a-9dc1-a67f7911b854';
--   -- expect qwerty as owner, d7d0db0e-4642-4df4-877d-80419bccbee9 as viewer
--
--   -- BASELINE, as qqq, before applying: both must be []
--   GET /rest/v1/columns?board_id=eq.<board>&select=id
--   GET /rest/v1/todos?board_id=eq.<board>&select=id
--
--
-- AFTER APPLYING — the owner first. If an owner's board is empty, revert the
-- function immediately; that is the failure this migration can cause.
--
--   OWNER    GET/POST/PATCH/DELETE columns and todos   → unchanged, all work
--   VIEWER   GET    columns, todos    → 200, rows      ← the read half
--   VIEWER   POST   todos             → 42501          (WITH CHECK violation)
--   VIEWER   PATCH  todos?id=eq.<x>   → 200, [] 0 rows (USING filtered it)
--   VIEWER   DELETE todos?id=eq.<x>   → 200, [] 0 rows
--   NON-MEMBER  all four on both      → [] or 42501
--
-- Then flip the fixture role and re-run, one statement, fully reversible:
--
--   update public.board_members set role = 'editor'
--   where board_id = '5819a045-0bca-4a8a-9dc1-a67f7911b854'
--     and user_id  = 'd7d0db0e-4642-4df4-877d-80419bccbee9';
--
--   EDITOR   all four verbs on both tables              → all succeed
--   ADMIN    (repeat with role = 'admin')               → all succeed
--   -- then reset to 'viewer' and LEAVE IT for M3-09.
--
--
-- THE UPSERT PATH — the task calls this out specifically, and it is the one
-- that fails silently rather than loudly.
--
-- reorderTodos (todoApi.ts:116) and reorderColumns (columnsApi.ts:66) send
-- { id, position, column_id?, board_id } through PostgREST upsert, which is
-- INSERT ... ON CONFLICT (id) DO UPDATE. THREE checks must pass:
--
--   INSERT WITH CHECK  on the proposed row
--   UPDATE USING       on the existing row
--   UPDATE WITH CHECK  on the updated row
--
-- All three are satisfied for an editor because both payloads carry board_id
-- and all three policies test the same predicate. A missing UPDATE policy
-- would pass the INSERT check and then silently drop the write — drags that
-- revert on refresh, no error anywhere. So: as EDITOR, drag a card within a
-- column, drag one across columns, drag a column, then RELOAD. If the order
-- survives the reload, the upsert path is intact. Do not skip the reload; the
-- optimistic cache hides the failure until then.
--
--
-- PERFORMANCE, for M3-12 which runs next.
--
-- SELECT keeps the InitPlan shape: accessible_board_ids() is row-independent,
-- evaluated once per statement. Expect a One-Time Filter.
--
-- Writes do not. board_role(board_id) reads board_id from the proposed row,
-- not from a WHERE constant, so no equivalence-class propagation applies and
-- it is one call per row. A reorder upsert renumbers the source and
-- destination columns — tens of rows, not the whole board — so this is
-- expected to be negligible. If M3-12 shows otherwise, the fix is a
-- writable_board_ids() helper mirroring accessible_board_ids(), which restores
-- the InitPlan and collapses the six repeated role lists into one definition.
-- M3-10's reorder_todos RPC removes the bulk path from RLS entirely.
