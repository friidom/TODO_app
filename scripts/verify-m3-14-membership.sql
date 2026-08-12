-- M3-14 · Membership mutation authorization matrix.
--
-- Proves the authorization logic of add_board_member, set_member_role,
-- remove_board_member and leave_board against every cell of the Membership
-- matrix in Part II of docs/IMPLEMENTATION_PLAN.md, plus the Owner invariants.
--
-- INVARIANT NUMBERING IS PART II'S, which is the source of truth:
--   I1 exactly one Owner              I2 owner row cannot be DELETED
--   I3 owner role cannot be CHANGED   I4 admin has no path to an owner row
--   I5 owner_id and the owner row never drift
--   I6 changing the Owner is not a membership operation
--
-- Covered here: I1, I2, I3, I4, I6. NOT covered: I5 — M3-14 does not enforce
-- it, only survives it. §5b proves the surviving, not the enforcing.
--
--
-- HOW TO RUN
--
--   Paste the whole file into the Supabase SQL editor and execute it.
--   It ends in ROLLBACK. Nothing it creates survives.
--
--
-- WHY THIS DOES NOT NEED A JWT PER ROLE
--
--   auth.uid() reads the request.jwt.claims GUC that PostgREST sets from the
--   verified token. A session can set that GUC directly, so each case below
--   runs as a specific user without minting a token for them. Each case also
--   does `set local role authenticated`, so the EXECUTE grants are exercised
--   too — including the fact that is_board_owner() is revoked from
--   authenticated yet still reachable from inside the SECURITY DEFINER RPCs,
--   because those run as their definer.
--
--
-- WHAT THIS DOES *NOT* PROVE — still owed to M3-16
--
--   · That anon cannot reach the RPCs over PostgREST. HTTP-layer, not SQL.
--     (The EXECUTE privilege is asserted below; the HTTP path is not.)
--   · Anything about the frontend.
--
--
-- CASE ORDER IS LOAD-BEARING. Cases that succeed mutate the fixture. The
-- leave_board successes come last because they remove members that earlier
-- cases target, and the argument-validation cases need those members present.
--
--
-- A FAILING ROW IS A SECURITY DEFECT. The final SELECT lists failures first.

begin;

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

create temporary table m3_14_results (
  seq      serial primary key,
  label    text,
  expected text,
  actual   text,
  pass     boolean
) on commit drop;

-- Runs p_sql as p_uid and records the outcome.
--
-- p_expect is either 'ok' or a specific SQLSTATE. Requiring the exact SQLSTATE
-- for a denial matters: a typo in a case would raise 42601 and, under a looser
-- "did it raise at all" check, would be recorded as a pass.
--
-- `reset role` before the results insert is essential — the temp table belongs
-- to the session user, not to `authenticated`.
create or replace function pg_temp.try_as(
  p_label  text,
  p_uid    uuid,
  p_sql    text,
  p_expect text
)
returns void
language plpgsql
as $fn$
declare
  v_actual text;
begin
  begin
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
      true
    );
    -- Older auth.uid() builds read the flat per-claim GUC instead of the JSON
    -- one. Setting both makes the harness independent of which definition the
    -- target database carries; production's coalesces over the two.
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    execute 'set local role authenticated';
    execute p_sql;
    v_actual := 'ok';
  exception when others then
    -- An aborted subtransaction also rolls back the SET LOCAL above.
    v_actual := sqlstate;
  end;
  execute 'reset role';

  insert into m3_14_results (label, expected, actual, pass)
  values (p_label, p_expect, v_actual, v_actual = p_expect);
end;
$fn$;

-- Records a plain boolean assertion, for state and privilege checks.
create or replace function pg_temp.expect_true(p_label text, p_cond boolean)
returns void
language plpgsql
as $fn$
begin
  insert into m3_14_results (label, expected, actual, pass)
  values (p_label, 'true', coalesce(p_cond::text, 'null'), coalesce(p_cond, false));
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Fixtures — two boards, so cross-board isolation can be tested
-- ---------------------------------------------------------------------------
--
--   e001 board A owner     e002 board A admin      e003 board A admin #2
--   e004 board A editor    e005 board A viewer     e006 outsider
--   e007 candidate         e008 owner of boards B and C
--   board A = ...aa        board B = ...bb        board C = ...cc (drifted)
--
-- profiles.id references auth.users(id), so the users must exist first. If
-- this block fails, check handle_new_user() — it is a trigger on auth.users
-- that also inserts into profiles, which is why the profiles insert below
-- carries ON CONFLICT DO NOTHING.

do $fixtures$
declare
  v_ids uuid[] := array[
    '00000000-0000-4000-8000-00000000e001'::uuid,
    '00000000-0000-4000-8000-00000000e002'::uuid,
    '00000000-0000-4000-8000-00000000e003'::uuid,
    '00000000-0000-4000-8000-00000000e004'::uuid,
    '00000000-0000-4000-8000-00000000e005'::uuid,
    '00000000-0000-4000-8000-00000000e006'::uuid,
    '00000000-0000-4000-8000-00000000e007'::uuid,
    '00000000-0000-4000-8000-00000000e008'::uuid
  ];
  v_id uuid;
  v_n  int := 0;
begin
  foreach v_id in array v_ids loop
    v_n := v_n + 1;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'm314-' || v_n || '@example.test', now(), now())
    on conflict (id) do nothing;

    insert into public.profiles (id, email, username)
    values (v_id, 'm314-' || v_n || '@example.test', 'm314-user-' || v_n)
    on conflict (id) do nothing;
  end loop;

  -- The M3-03 AFTER INSERT trigger mints each board's owner membership.
  insert into public.boards (id, owner_id, title)
  values ('00000000-0000-4000-8000-0000000000aa', v_ids[1], 'M3-14 fixture board A');

  insert into public.boards (id, owner_id, title)
  values ('00000000-0000-4000-8000-0000000000bb', v_ids[8], 'M3-14 fixture board B');

  -- Board C exists solely to prove the SECOND branch of is_board_owner.
  --
  -- On boards A and B the two sources of ownership agree, so every owner
  -- denial there is satisfied by the board_members branch alone — delete the
  -- boards.owner_id branch and those cases would all still pass. Board C has
  -- boards.owner_id and no matching membership row, so owner_id is the only
  -- remaining evidence, and §5b fails if the OR is dropped.
  --
  -- This is the drift I5 forbids, so it has to be MANUFACTURED, not created:
  --   · deleting the owner row after M3-03 mints it is refused by M3-15's I2
  --     guard, which aborts the transaction and empties the whole report;
  --   · re-inserting it later is refused by M3-15's I5 and I1 guards.
  -- Suppressing M3-03's trigger for this one INSERT is the only way to reach
  -- the state without weakening either migration. ALTER TABLE is transactional,
  -- so the ROLLBACK at the foot of this file restores the trigger — and it
  -- takes SHARE ROW EXCLUSIVE on boards, not ACCESS EXCLUSIVE, so readers are
  -- unaffected for the seconds it is held.
  --
  -- M3-15 means production can no longer reach this state at all. The case
  -- stays because is_board_owner's OR is still load-bearing: it is what makes
  -- the RPC layer safe on its own, without depending on the trigger layer.
  alter table public.boards disable trigger boards_add_owner_membership;

  insert into public.boards (id, owner_id, title)
  values ('00000000-0000-4000-8000-0000000000cc', v_ids[8], 'M3-14 fixture board C (drifted)');

  alter table public.boards enable trigger boards_add_owner_membership;

  insert into public.board_members (board_id, user_id, role) values
    ('00000000-0000-4000-8000-0000000000cc', v_ids[2], 'admin');

  -- Seed board A's non-owner roles directly. Fixture setup runs as the session
  -- role, not through the RPCs — the RPCs are what is under test.
  insert into public.board_members (board_id, user_id, role) values
    ('00000000-0000-4000-8000-0000000000aa', v_ids[2], 'admin'),
    ('00000000-0000-4000-8000-0000000000aa', v_ids[3], 'admin'),
    ('00000000-0000-4000-8000-0000000000aa', v_ids[4], 'editor'),
    ('00000000-0000-4000-8000-0000000000aa', v_ids[5], 'viewer');
end;
$fixtures$;

select pg_temp.expect_true(
  'fixture: M3-03 trigger gave board A exactly one owner',
  (select count(*) = 1 from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000aa' and role = 'owner'));


-- ===========================================================================
-- 1. Viewer — no membership authority whatsoever
-- ===========================================================================

select pg_temp.try_as('viewer cannot add a member',
  '00000000-0000-4000-8000-00000000e005',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','viewer')$$,
  '42501');

select pg_temp.try_as('viewer cannot change a role',
  '00000000-0000-4000-8000-00000000e005',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e004','viewer')$$,
  '42501');

select pg_temp.try_as('viewer cannot remove a member',
  '00000000-0000-4000-8000-00000000e005',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e004')$$,
  '42501');

-- ===========================================================================
-- 2. Editor — content authority, no membership authority
-- ===========================================================================

select pg_temp.try_as('editor cannot add a member',
  '00000000-0000-4000-8000-00000000e004',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','viewer')$$,
  '42501');

select pg_temp.try_as('editor cannot change a role',
  '00000000-0000-4000-8000-00000000e004',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e005','editor')$$,
  '42501');

select pg_temp.try_as('editor cannot remove a member',
  '00000000-0000-4000-8000-00000000e004',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e005')$$,
  '42501');

-- ===========================================================================
-- 3. Admin — may manage viewer and editor
-- ===========================================================================

select pg_temp.try_as('admin CAN add a viewer',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','viewer')$$,
  'ok');

select pg_temp.try_as('admin CAN promote that viewer to editor',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','editor')$$,
  'ok');

select pg_temp.expect_true(
  'role change persisted on re-read',
  (select role = 'editor' from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000aa'
     and user_id  = '00000000-0000-4000-8000-00000000e007'));

select pg_temp.try_as('admin CAN remove an editor',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007')$$,
  'ok');

select pg_temp.expect_true(
  'removal persisted on re-read',
  (select count(*) = 0 from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000aa'
     and user_id  = '00000000-0000-4000-8000-00000000e007'));

-- ===========================================================================
-- 4. Admin — the boundary
-- ===========================================================================

select pg_temp.try_as('admin cannot add anyone as admin',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','admin')$$,
  '42501');

select pg_temp.try_as('admin cannot promote an editor to admin',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e004','admin')$$,
  '42501');

select pg_temp.try_as('admin cannot demote another admin',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e003','viewer')$$,
  '42501');

select pg_temp.try_as('admin cannot remove another admin',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e003')$$,
  '42501');

select pg_temp.try_as('admin cannot demote themselves',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e002','viewer')$$,
  '42501');

select pg_temp.try_as('admin cannot remove themselves via the admin path',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e002')$$,
  '42501');

-- ===========================================================================
-- 5. Admin vs Owner — invariants I2, I3, I4, I6 (Part II numbering)
-- ===========================================================================

select pg_temp.try_as('I2/I4 admin cannot remove the owner',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e001')$$,
  '42501');

select pg_temp.try_as('I3/I4 admin cannot demote the owner',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e001','viewer')$$,
  '42501');

select pg_temp.try_as('I6 admin cannot promote themselves to owner',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e002','owner')$$,
  '42501');

select pg_temp.try_as('I1/I6 admin cannot add a second owner',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','owner')$$,
  '42501');

select pg_temp.try_as('I2/I4 admin cannot ADD the owner as anything',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e001','viewer')$$,
  '42501');

-- ===========================================================================
-- 5b. The drifted owner — proves the boards.owner_id branch of is_board_owner
-- ===========================================================================
--
-- On board C the owner has NO membership row. Only boards.owner_id identifies
-- them. Without the second branch of is_board_owner these two cases would not
-- raise 42501 — the remove would fall through to P0002, and the add would
-- SUCCEED and mint a viewer membership for the board's own owner.

select pg_temp.expect_true(
  'fixture: board C owner has no membership row (drift is set up)',
  (select count(*) = 0 from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000cc'
     and user_id  = '00000000-0000-4000-8000-00000000e008'));

select pg_temp.try_as('I2 drifted owner cannot be removed (boards.owner_id branch)',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000cc','00000000-0000-4000-8000-00000000e008')$$,
  '42501');

select pg_temp.try_as('I4 drifted owner cannot be added as a member (boards.owner_id branch)',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000cc','00000000-0000-4000-8000-00000000e008','viewer')$$,
  '42501');

select pg_temp.expect_true(
  'board C owner still has no membership row after both attempts',
  (select count(*) = 0 from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000cc'
     and user_id  = '00000000-0000-4000-8000-00000000e008'));

-- ===========================================================================
-- 6. Owner — full authority over non-owners
-- ===========================================================================

select pg_temp.try_as('owner CAN add an admin',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','admin')$$,
  'ok');

select pg_temp.try_as('owner CAN demote an admin',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','viewer')$$,
  'ok');

select pg_temp.try_as('owner CAN remove an admin',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e003')$$,
  'ok');

select pg_temp.try_as('owner CAN promote a viewer to editor',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e005','editor')$$,
  'ok');

-- Promote-TO-admin is the Owner's distinguishing power in the matrix. Only
-- demotion was tested before; tighten `v_actor_rank <= v_new_rank` to `<` by
-- accident and nothing else in this file would catch it.
select pg_temp.try_as('owner CAN promote to admin',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e005','admin')$$,
  'ok');

select pg_temp.expect_true(
  'promotion to admin persisted on re-read',
  (select role = 'admin' from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000aa'
     and user_id  = '00000000-0000-4000-8000-00000000e005'));

-- ===========================================================================
-- 7. Owner immutability holds against the Owner themselves — I1, I2, I3, I6
-- ===========================================================================

select pg_temp.try_as('I3 owner cannot demote themselves',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e001','admin')$$,
  '42501');

select pg_temp.try_as('I2 owner cannot remove themselves',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e001')$$,
  '42501');

select pg_temp.try_as('I6 owner cannot grant owner to anyone',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e002','owner')$$,
  '42501');

select pg_temp.try_as('I1/I2 owner cannot leave the board',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.leave_board('00000000-0000-4000-8000-0000000000aa')$$,
  '42501');

select pg_temp.expect_true(
  'I1 board A still has exactly one owner, unchanged',
  (select count(*) = 1 from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000aa'
     and role = 'owner'
     and user_id = '00000000-0000-4000-8000-00000000e001'));

-- ===========================================================================
-- 8. Non-member — denied everywhere
-- ===========================================================================

select pg_temp.try_as('non-member cannot add',
  '00000000-0000-4000-8000-00000000e006',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','viewer')$$,
  '42501');

select pg_temp.try_as('non-member cannot change a role',
  '00000000-0000-4000-8000-00000000e006',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e004','viewer')$$,
  '42501');

select pg_temp.try_as('non-member cannot remove',
  '00000000-0000-4000-8000-00000000e006',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e004')$$,
  '42501');

select pg_temp.try_as('non-member cannot leave a board they are not on',
  '00000000-0000-4000-8000-00000000e006',
  $$select public.leave_board('00000000-0000-4000-8000-0000000000aa')$$,
  '42501');

-- ===========================================================================
-- 9. Cross-board isolation
-- ===========================================================================
--
-- Board B's owner has maximum authority on B and none at all on A. Supplying
-- A's board_id must carry none of it across.

select pg_temp.try_as('board B owner cannot add to board A',
  '00000000-0000-4000-8000-00000000e008',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','viewer')$$,
  '42501');

select pg_temp.try_as('board B owner cannot re-role a board A member',
  '00000000-0000-4000-8000-00000000e008',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e004','viewer')$$,
  '42501');

select pg_temp.try_as('board B owner cannot remove a board A member',
  '00000000-0000-4000-8000-00000000e008',
  $$select public.remove_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e004')$$,
  '42501');

select pg_temp.try_as('board A owner cannot touch board B',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000bb','00000000-0000-4000-8000-00000000e007','viewer')$$,
  '42501');

-- ===========================================================================
-- 10. Argument validation
-- ===========================================================================

select pg_temp.try_as('unrecognised role is rejected',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e007','superadmin')$$,
  '22023');

select pg_temp.try_as('adding an existing member is rejected, not duplicated',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e004','viewer')$$,
  '23505');

select pg_temp.try_as('re-roling a non-member is rejected',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.set_member_role('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-00000000e006','viewer')$$,
  'P0002');

select pg_temp.try_as('adding a non-existent user is rejected',
  '00000000-0000-4000-8000-00000000e001',
  $$select public.add_board_member('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-0000000000f9','viewer')$$,
  'P0002');

-- ===========================================================================
-- 11. leave_board — consent, not administration. LAST, because it removes.
-- ===========================================================================

-- e007 is a viewer at this point (owner demoted them in §6).
select pg_temp.try_as('viewer CAN leave the board',
  '00000000-0000-4000-8000-00000000e007',
  $$select public.leave_board('00000000-0000-4000-8000-0000000000aa')$$,
  'ok');

select pg_temp.try_as('editor CAN leave the board',
  '00000000-0000-4000-8000-00000000e004',
  $$select public.leave_board('00000000-0000-4000-8000-0000000000aa')$$,
  'ok');

select pg_temp.try_as('admin CAN leave the board',
  '00000000-0000-4000-8000-00000000e002',
  $$select public.leave_board('00000000-0000-4000-8000-0000000000aa')$$,
  'ok');

select pg_temp.expect_true(
  'leave_board removed only the caller',
  (select count(*) = 0 from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000aa'
     and user_id in ('00000000-0000-4000-8000-00000000e002',
                     '00000000-0000-4000-8000-00000000e004',
                     '00000000-0000-4000-8000-00000000e007'))
  and (select count(*) = 1 from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000aa'
     and role = 'owner'));

-- ===========================================================================
-- 12. Privilege layer — M3-13's revokes plus this migration's grants
-- ===========================================================================

select pg_temp.expect_true('authenticated has no INSERT on board_members',
  not has_table_privilege('authenticated', 'public.board_members', 'INSERT'));

select pg_temp.expect_true('authenticated has no UPDATE on board_members',
  not has_table_privilege('authenticated', 'public.board_members', 'UPDATE'));

select pg_temp.expect_true('authenticated has no DELETE on board_members',
  not has_table_privilege('authenticated', 'public.board_members', 'DELETE'));

select pg_temp.expect_true('authenticated retains SELECT on board_members',
  has_table_privilege('authenticated', 'public.board_members', 'SELECT'));

select pg_temp.expect_true('anon has no SELECT on board_members',
  not has_table_privilege('anon', 'public.board_members', 'SELECT'));

select pg_temp.expect_true('anon cannot execute add_board_member',
  not has_function_privilege('anon', 'public.add_board_member(uuid,uuid,text)', 'EXECUTE'));

select pg_temp.expect_true('anon cannot execute set_member_role',
  not has_function_privilege('anon', 'public.set_member_role(uuid,uuid,text)', 'EXECUTE'));

select pg_temp.expect_true('anon cannot execute remove_board_member',
  not has_function_privilege('anon', 'public.remove_board_member(uuid,uuid)', 'EXECUTE'));

select pg_temp.expect_true('anon cannot execute leave_board',
  not has_function_privilege('anon', 'public.leave_board(uuid)', 'EXECUTE'));

select pg_temp.expect_true('authenticated cannot execute is_board_owner (internal)',
  not has_function_privilege('authenticated', 'public.is_board_owner(uuid,uuid)', 'EXECUTE'));

select pg_temp.expect_true('service_role retains full DML on board_members',
  has_table_privilege('service_role', 'public.board_members', 'SELECT')
  and has_table_privilege('service_role', 'public.board_members', 'INSERT')
  and has_table_privilege('service_role', 'public.board_members', 'UPDATE')
  and has_table_privilege('service_role', 'public.board_members', 'DELETE'));

-- Exact match on an EMPTY search_path, not `like 'search_path=%'` — that
-- pattern also accepts search_path=public, which is the weaker property. The
-- count(*) = 5 makes the row fail if any function failed to create, which
-- bool_and over a subset would not.
select pg_temp.expect_true(
  'all 5 membership functions are SECURITY DEFINER with an EMPTY search_path',
  (select count(*) = 5
          and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('add_board_member','set_member_role',
                       'remove_board_member','leave_board','is_board_owner')));

-- Diagnostic, so a failure of the row above is immediately readable rather
-- than needing a second session to investigate.
select proname, prosecdef, proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_board_member','set_member_role','remove_board_member',
                    'leave_board','is_board_owner','board_roster')
order by proname;

select pg_temp.expect_true(
  'board_members still has no INSERT/UPDATE/DELETE policy',
  (select count(*) = 0 from pg_policies
   where schemaname = 'public' and tablename = 'board_members'
     and cmd <> 'SELECT'));


-- ---------------------------------------------------------------------------
-- Report — failures first
-- ---------------------------------------------------------------------------

select
  case when pass then 'PASS' else '*** FAIL ***' end as result,
  label, expected, actual
from m3_14_results
order by pass, seq;

select count(*) as total,
       count(*) filter (where pass)     as passed,
       count(*) filter (where not pass) as failed
from m3_14_results;

rollback;
