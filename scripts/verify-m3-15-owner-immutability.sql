-- M3-15 · Owner immutability enforced for every writer.
--
-- Proves that the Owner invariants hold against DIRECT database writes, not
-- just against M3-14's RPCs. Invariant numbering is Part II's.
--
--   I1  a board always has exactly one Owner
--   I2  the Owner's membership row cannot be DELETED
--   I3  the Owner's role cannot be CHANGED
--   I5  boards.owner_id and the owner membership row never drift
--   I6  changing who the Owner is is not a membership operation
--
-- I4 (an admin has no path to an owner row) is M3-14's and is covered by
-- scripts/verify-m3-14-membership.sql. Not repeated here.
--
--
-- HOW TO RUN
--
--   Paste into the Supabase SQL editor and execute. Ends in ROLLBACK.
--
--   Run it as the MOST PRIVILEGED role you have. That is the point: M3-14
--   already proves the RPCs refuse. This proves the database refuses even when
--   the RPCs are bypassed entirely. A run that is not privileged proves less,
--   not more.
--
--
-- WHY THE POSITIVE CASES MATTER AS MUCH AS THE NEGATIVE ONES
--
--   A trigger that raises on everything passes every "must be refused" case in
--   this file. Sections 3 and 4 are what separate a correct guard from one
--   that breaks board deletion, account deletion and normal membership
--   management. Do not skip them.
--
--
-- A FAILING ROW IS A DEFECT. The final SELECT lists failures first.

begin;

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

create temporary table m3_15_results (
  seq serial primary key, label text, expected text, actual text, pass boolean
) on commit drop;

-- Runs p_sql as the current (privileged) role and records the outcome.
-- p_expect is 'ok' or an exact SQLSTATE. Requiring the exact code matters: a
-- typo raises 42601 and would otherwise register as a passing denial.
create or replace function pg_temp.try_sql(p_label text, p_sql text, p_expect text)
returns void language plpgsql as $fn$
declare v_actual text;
begin
  begin
    execute p_sql;
    v_actual := 'ok';
  exception when others then
    v_actual := sqlstate;
  end;
  insert into m3_15_results (label, expected, actual, pass)
  values (p_label, p_expect, v_actual, v_actual = p_expect);
end;
$fn$;

create or replace function pg_temp.expect_true(p_label text, p_cond boolean)
returns void language plpgsql as $fn$
begin
  insert into m3_15_results (label, expected, actual, pass)
  values (p_label, 'true', coalesce(p_cond::text,'null'), coalesce(p_cond,false));
end;
$fn$;

-- Runs p_sql as a specific user, through the grants an ordinary client has.
--
-- Unlike try_sql this records the MESSAGE alongside the SQLSTATE, because the
-- cases that use it are the ones where two layers can both answer 42501 and
-- the SQLSTATE alone cannot say which did. See §5.
--
-- auth.uid() reads a session GUC, so a specific user can be impersonated
-- without minting a token. Both claim spellings are set: older auth.uid()
-- builds read the flat one, current ones coalesce over the two.
create or replace function pg_temp.try_as(p_label text, p_uid uuid, p_sql text, p_expect text)
returns void language plpgsql as $fn$
declare v_actual text;
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role','authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    execute 'set local role authenticated';
    execute p_sql;
    v_actual := 'ok';
  exception when others then v_actual := sqlstate || ' / ' || sqlerrm;
  end;
  execute 'reset role';
  insert into m3_15_results (label, expected, actual, pass)
  values (p_label, p_expect, v_actual, v_actual = p_expect);
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
--
--   f001 owner of boards P and Q     f002 admin on P
--   f003 editor on P                 f004 unrelated person
--   f005 signs up during the run — no profile, no board (§3, provisioning)
--   board P = ...11   board Q = ...22 (used for the cascade cases)
--
-- The loop variables are v_-prefixed because `on conflict (id)` cannot tell a
-- plpgsql variable named `id` from the column of the same name, and resolves
-- it as ambiguous — which aborts the transaction and empties the whole report.

do $fixtures$
declare
  v_ids uuid[] := array[
    '00000000-0000-4000-8000-00000000f001'::uuid,
    '00000000-0000-4000-8000-00000000f002'::uuid,
    '00000000-0000-4000-8000-00000000f003'::uuid,
    '00000000-0000-4000-8000-00000000f004'::uuid
  ];
  v_id uuid; v_n int := 0;
begin
  foreach v_id in array v_ids loop
    v_n := v_n + 1;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'm315-' || v_n || '@example.test', now(), now())
    on conflict (id) do nothing;
    insert into public.profiles (id, email, username)
    values (v_id, 'm315-' || v_n || '@example.test', 'm315-user-' || v_n)
    on conflict (id) do nothing;
  end loop;

  -- f005 gets an auth.users row and NOTHING else: provision_new_user() reads
  -- the address from auth.users rather than taking it as an argument, and §3
  -- calls it to prove signup still works with the guards in place.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-4000-8000-00000000f005',
          '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'm315-5@example.test', now(), now())
  on conflict (id) do nothing;

  -- M3-03's AFTER INSERT trigger mints each owner row. If M3-15's INSERT guard
  -- were wrong, THIS would fail and the whole script would abort here — which
  -- is itself the first and most important check.
  insert into public.boards (id, owner_id, title)
  values ('00000000-0000-4000-8000-000000000011', v_ids[1], 'M3-15 fixture board P');

  insert into public.boards (id, owner_id, title)
  values ('00000000-0000-4000-8000-000000000022', v_ids[1], 'M3-15 fixture board Q');

  insert into public.board_members (board_id, user_id, role) values
    ('00000000-0000-4000-8000-000000000011', v_ids[2], 'admin'),
    ('00000000-0000-4000-8000-000000000011', v_ids[3], 'editor');
end;
$fixtures$;

select pg_temp.expect_true(
  'M3-03 still works: board creation minted exactly one owner row',
  (select count(*) = 1 from public.board_members
   where board_id = '00000000-0000-4000-8000-000000000011' and role = 'owner'));


-- ===========================================================================
-- 1. Direct writes against the owner MEMBERSHIP row — must all be refused
-- ===========================================================================

select pg_temp.try_sql('I2 direct DELETE of the owner row is refused',
  $$delete from public.board_members
    where board_id = '00000000-0000-4000-8000-000000000011' and role = 'owner'$$,
  '42501');

select pg_temp.try_sql('I3 direct demotion of the owner is refused',
  $$update public.board_members set role = 'viewer'
    where board_id = '00000000-0000-4000-8000-000000000011' and role = 'owner'$$,
  '42501');

select pg_temp.try_sql('I3 re-pointing the owner row to another user is refused',
  $$update public.board_members set user_id = '00000000-0000-4000-8000-00000000f004'
    where board_id = '00000000-0000-4000-8000-000000000011' and role = 'owner'$$,
  '42501');

select pg_temp.try_sql('I3 moving the owner row to another board is refused',
  $$update public.board_members set board_id = '00000000-0000-4000-8000-000000000022'
    where board_id = '00000000-0000-4000-8000-000000000011' and role = 'owner'$$,
  '42501');

select pg_temp.try_sql('I1/I6 promoting an admin to owner is refused',
  $$update public.board_members set role = 'owner'
    where board_id = '00000000-0000-4000-8000-000000000011'
      and user_id = '00000000-0000-4000-8000-00000000f002'$$,
  '42501');

-- The INSERT guard has two branches and they are NOT interchangeable. I5 is
-- checked first, so any owner row naming someone other than boards.owner_id
-- stops there and never reaches I1. Delete the I1 branch entirely and a case
-- like the one below would still pass. Reaching I1 requires an insert that
-- SATISFIES I5 — i.e. one naming the real owner — which is the case after it.

select pg_temp.try_sql('I5 an owner row naming someone other than boards.owner_id is refused',
  $$insert into public.board_members (board_id, user_id, role)
    values ('00000000-0000-4000-8000-000000000011',
            '00000000-0000-4000-8000-00000000f004', 'owner')$$,
  '42501');

-- Satisfies I5 (f001 IS board P's owner_id), so this is the only shape that
-- reaches I1. Note the SQLSTATE: (board_id, user_id) is the primary key, so
-- without the trigger this would be 23505. A BEFORE trigger fires ahead of
-- conflict arbitration, which is why 42501 arrives first.
select pg_temp.try_sql('I1 a duplicate owner row for the real owner is refused',
  $$insert into public.board_members (board_id, user_id, role)
    values ('00000000-0000-4000-8000-000000000011',
            '00000000-0000-4000-8000-00000000f001', 'owner')$$,
  '42501');

-- Same I5 branch on a board the actor has no relationship to at all.
select pg_temp.try_sql('I5 holds on a board the writer is unconnected to',
  $$insert into public.board_members (board_id, user_id, role)
    values ('00000000-0000-4000-8000-000000000022',
            '00000000-0000-4000-8000-00000000f004', 'owner')$$,
  '42501');

select pg_temp.expect_true(
  'board P still has exactly one owner, unchanged, after all of the above',
  (select count(*) = 1 from public.board_members
   where board_id = '00000000-0000-4000-8000-000000000011'
     and role = 'owner'
     and user_id = '00000000-0000-4000-8000-00000000f001'));


-- ===========================================================================
-- 2. boards.owner_id is frozen — I5 / I6
-- ===========================================================================

select pg_temp.try_sql('I5/I6 changing boards.owner_id is refused',
  $$update public.boards set owner_id = '00000000-0000-4000-8000-00000000f004'
    where id = '00000000-0000-4000-8000-000000000011'$$,
  '42501');

select pg_temp.try_sql('I5/I6 nulling boards.owner_id is refused',
  $$update public.boards set owner_id = null
    where id = '00000000-0000-4000-8000-000000000011'$$,
  '42501');

select pg_temp.expect_true(
  'boards.owner_id unchanged',
  (select owner_id = '00000000-0000-4000-8000-00000000f001' from public.boards
   where id = '00000000-0000-4000-8000-000000000011'));


-- ===========================================================================
-- 3. The trigger is not over-broad — legitimate writes still work
-- ===========================================================================
--
-- Every case in sections 1 and 2 would also pass against a trigger that
-- raises unconditionally. These are what prove it does not.

select pg_temp.try_sql('non-owner rows can still be inserted',
  $$insert into public.board_members (board_id, user_id, role)
    values ('00000000-0000-4000-8000-000000000011',
            '00000000-0000-4000-8000-00000000f004', 'viewer')$$,
  'ok');

select pg_temp.try_sql('non-owner rows can still be re-roled',
  $$update public.board_members set role = 'editor'
    where board_id = '00000000-0000-4000-8000-000000000011'
      and user_id = '00000000-0000-4000-8000-00000000f004'$$,
  'ok');

select pg_temp.try_sql('non-owner rows can still be deleted',
  $$delete from public.board_members
    where board_id = '00000000-0000-4000-8000-000000000011'
      and user_id = '00000000-0000-4000-8000-00000000f004'$$,
  'ok');

select pg_temp.try_sql('other columns of boards are still updatable',
  $$update public.boards set title = 'renamed by M3-15 harness'
    where id = '00000000-0000-4000-8000-000000000011'$$,
  'ok');

select pg_temp.try_sql('creating a new board still works (M3-03 insert guard)',
  $$insert into public.boards (id, owner_id, title)
    values ('00000000-0000-4000-8000-000000000033',
            '00000000-0000-4000-8000-00000000f004', 'M3-15 fixture board R')$$,
  'ok');

select pg_temp.expect_true(
  'the new board got exactly one owner row, matching owner_id',
  (select count(*) = 1 from public.board_members
   where board_id = '00000000-0000-4000-8000-000000000033'
     and role = 'owner'
     and user_id = '00000000-0000-4000-8000-00000000f004'));

-- --- The two live paths most likely to be broken by these guards -----------
--
-- Neither is a membership operation, which is exactly why they are easy to
-- overlook: both reach a guard indirectly, through a trigger.

-- SIGNUP. provision_new_user() inserts a board, whose M3-03 AFTER trigger
-- inserts an owner row, which lands on the new BEFORE INSERT guard. It passes
-- only because M3-03 is AFTER: the boards row is already visible to the
-- guard's snapshot when I5 looks for it. Had M3-03 been a BEFORE trigger,
-- every signup would now fail with 42501.
select pg_temp.try_as('signup still works: provision_new_user()',
  '00000000-0000-4000-8000-00000000f005',
  $$select public.provision_new_user()$$,
  'ok');

select pg_temp.expect_true(
  'provisioning gave the new user a board, its owner row and four columns',
  (select count(*) = 1 from public.boards
   where owner_id = '00000000-0000-4000-8000-00000000f005')
  and (select count(*) = 1 from public.board_members
   where user_id = '00000000-0000-4000-8000-00000000f005' and role = 'owner')
  and (select count(*) = 4 from public.columns c
   join public.boards b on b.id = c.board_id
   where b.owner_id = '00000000-0000-4000-8000-00000000f005'));

-- TODO CREATION. M2-21's assign_todo_board_key trigger allocates KAN-n by
-- doing `update boards set next_key = next_key + 1` on EVERY card insert. That
-- UPDATE now passes through boards_owner_immutable. It survives because
-- owner_id is not among the columns it touches — but it is the single
-- highest-traffic write in the application, so it is worth pinning down.
select pg_temp.try_sql('a column can still be created on board P',
  $$insert into public.columns (id, board_id, title, position, category)
    values ('00000000-0000-4000-8000-0000000000c1',
            '00000000-0000-4000-8000-000000000011', 'To Do', 0, 'todo')$$,
  'ok');

select pg_temp.try_sql('todo creation still works (boards.next_key update passes the guard)',
  $$insert into public.todos (id, board_id, column_id, title, position, creator_id)
    values ('00000000-0000-4000-8000-0000000000d1',
            '00000000-0000-4000-8000-000000000011',
            '00000000-0000-4000-8000-0000000000c1', 'M3-15 harness card', 0,
            '00000000-0000-4000-8000-00000000f001')$$,
  'ok');

select pg_temp.expect_true(
  'the card got its board_key and boards.next_key advanced',
  (select board_key is not null from public.todos
   where id = '00000000-0000-4000-8000-0000000000d1')
  and (select next_key > 1 from public.boards
   where id = '00000000-0000-4000-8000-000000000011'));


-- ===========================================================================
-- 4. THE CASCADE ESCAPE HATCH — the reason this migration is not four lines
-- ===========================================================================
--
-- Three FKs legitimately delete owner rows. If these two cases fail, M3-15
-- has broken board deletion (M8-03) and account deletion, and M8-08's cascade
-- verification would fail too.

select pg_temp.try_sql('deleting a board cascades its owner row away',
  $$delete from public.boards where id = '00000000-0000-4000-8000-000000000022'$$,
  'ok');

select pg_temp.expect_true(
  'board Q and its owner row are both gone',
  (select count(*) = 0 from public.boards
   where id = '00000000-0000-4000-8000-000000000022')
  and (select count(*) = 0 from public.board_members
   where board_id = '00000000-0000-4000-8000-000000000022'));

select pg_temp.try_sql('deleting a profile cascades their boards and memberships away',
  $$delete from public.profiles where id = '00000000-0000-4000-8000-00000000f004'$$,
  'ok');

select pg_temp.expect_true(
  'board R and its owner row are both gone with the profile',
  (select count(*) = 0 from public.boards
   where id = '00000000-0000-4000-8000-000000000033')
  and (select count(*) = 0 from public.board_members
   where user_id = '00000000-0000-4000-8000-00000000f004'));


-- ===========================================================================
-- 5. Both layers hold independently — M3-14's RPCs still refuse
-- ===========================================================================
--
-- M3-15 must not make M3-14 redundant or vice versa. The owner is refused at
-- the RPC layer for its own reasons, before the trigger is ever reached.
--
-- MATCHING ON THE MESSAGE, NOT JUST THE SQLSTATE, IS THE WHOLE POINT HERE.
-- Both layers answer 42501. Assert only the code and these cases stay green
-- after someone deletes the RPCs' owner guards entirely — the trigger would
-- catch the write and report the same code, and the report would call that a
-- pass. The RPC messages are plain prose; every trigger message is prefixed
-- with its invariant number, so the two are distinguishable.

select pg_temp.try_as('RPC layer still refuses: admin removing the owner',
  '00000000-0000-4000-8000-00000000f002',
  $$select public.remove_board_member('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-00000000f001')$$,
  '42501 / the board owner cannot be removed');

select pg_temp.try_as('RPC layer still refuses: owner demoting themselves',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.set_member_role('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-00000000f001','admin')$$,
  '42501 / the board owner cannot be modified');

select pg_temp.try_as('RPC layer still ALLOWS: admin re-roling an editor',
  '00000000-0000-4000-8000-00000000f002',
  $$select public.set_member_role('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-00000000f003','viewer')$$,
  'ok');

-- And the converse: with the RPCs bypassed, the trigger answers instead, and
-- says so. This is what proves the two layers are independent rather than one
-- of them being dead code.
select pg_temp.try_sql('trigger layer answers when the RPCs are bypassed',
  $$delete from public.board_members
    where board_id = '00000000-0000-4000-8000-000000000011' and role = 'owner'$$,
  '42501');


-- ===========================================================================
-- 6. Trigger and privilege shape
-- ===========================================================================

-- tgtype bits: 1 = ROW, 2 = BEFORE, 4 = INSERT, 8 = DELETE, 16 = UPDATE.
--
-- The BEFORE bit and tgenabled are both load-bearing and neither is implied by
-- the others. An AFTER trigger raising 42501 still aborts the statement, so
-- every behavioural case in this file would pass while the guard silently lost
-- its ability to refuse a row before it is written. And ALTER TABLE ... DISABLE
-- TRIGGER leaves the catalog row in place with tgenabled = 'D', so a check that
-- only counts the row would report a disabled guard as present.
--
-- tgenabled = 'O' is "fires in the default session_replication_role". 'A' and
-- 'R' are the replica variants; neither is what this migration installed.

select pg_temp.expect_true(
  'board_members_owner_immutable is an ENABLED BEFORE ROW trigger on INSERT, UPDATE and DELETE',
  (select count(*) = 1 from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'board_members'
     and t.tgname = 'board_members_owner_immutable'
     and not t.tgisinternal
     and t.tgenabled = 'O'
     and (t.tgtype & 1) > 0 and (t.tgtype & 2) > 0
     and (t.tgtype & 4) > 0 and (t.tgtype & 8) > 0 and (t.tgtype & 16) > 0));

select pg_temp.expect_true(
  'boards_owner_immutable is an ENABLED BEFORE UPDATE ROW trigger',
  (select count(*) = 1 from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'boards'
     and t.tgname = 'boards_owner_immutable'
     and not t.tgisinternal
     and t.tgenabled = 'O'
     and (t.tgtype & 1) > 0 and (t.tgtype & 2) > 0 and (t.tgtype & 16) > 0));

-- M3-03 must still be AFTER INSERT. If it ever becomes BEFORE, the I5 branch
-- of the membership guard looks for a boards row that has not been written
-- yet, and every board creation fails — including signup.
--
-- Flipping it is caught, but by the FIXTURE aborting rather than by a failing
-- row here, which empties the report. Verified by mutation: the run stops with
-- `I5: an owner membership must match boards.owner_id`. This assertion exists
-- so the catalog reason is stated where the trigger shape is checked, rather
-- than only being inferable from a stack trace.
select pg_temp.expect_true(
  'boards_add_owner_membership is still AFTER INSERT, which is what makes I5 satisfiable',
  (select count(*) = 1 from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'boards'
     and t.tgname = 'boards_add_owner_membership'
     and not t.tgisinternal
     and t.tgenabled = 'O'
     and (t.tgtype & 2) = 0 and (t.tgtype & 4) > 0));

select pg_temp.expect_true(
  'both guard functions are SECURITY DEFINER with an EMPTY search_path',
  (select count(*) = 2
          and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('enforce_owner_membership_immutable',
                       'enforce_board_owner_immutable')));

select pg_temp.expect_true(
  'neither guard function is executable by anon or authenticated',
  not has_function_privilege('anon','public.enforce_owner_membership_immutable()','EXECUTE')
  and not has_function_privilege('authenticated','public.enforce_owner_membership_immutable()','EXECUTE')
  and not has_function_privilege('anon','public.enforce_board_owner_immutable()','EXECUTE')
  and not has_function_privilege('authenticated','public.enforce_board_owner_immutable()','EXECUTE'));

-- Diagnostic, so a failure above is readable without a second session.
select proname, prosecdef, proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('enforce_owner_membership_immutable','enforce_board_owner_immutable')
order by proname;


-- ---------------------------------------------------------------------------
-- Report — failures first
-- ---------------------------------------------------------------------------

select case when pass then 'PASS' else '*** FAIL ***' end as result,
       label, expected, actual
from m3_15_results order by pass, seq;

select count(*) as total,
       count(*) filter (where pass)     as passed,
       count(*) filter (where not pass) as failed
from m3_15_results;

rollback;
