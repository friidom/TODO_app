-- M4 · Invitation authorization and acceptance.
--
-- Proves create_invite (M4-02), accept_invite and revoke_invite (M4-03)
-- against the invite rules in Part II of docs/IMPLEMENTATION_PLAN.md:
--
--   owner  may invite  viewer, editor, admin
--   admin  may invite  viewer, editor            ← NOT admin
--   editor may invite  nothing
--   viewer may invite  nothing
--   nobody may invite  owner                      (invariant I6)
--
-- and the acceptance rules:
--
--   a valid token grants EXACTLY the invited role, exactly once
--   accepting while already a member changes nothing in either direction
--   expired / revoked / spent / garbage tokens are all refused
--
--
-- HOW TO RUN
--
--   Paste the whole file into the Supabase SQL editor and execute it.
--   It ends in ROLLBACK. Nothing it creates survives.
--
--
-- WHY THIS NEEDS NO JWT PER ROLE — same reasoning as M3-14's harness:
-- auth.uid() reads the request.jwt.claims GUC that PostgREST sets from the
-- verified token, and a session can set that GUC directly. Each case also does
-- `set local role authenticated`, so the EXECUTE grants are exercised too.
--
--
-- WHAT THIS DOES *NOT* PROVE — still owed, and named in the migrations:
--
--   · That anon cannot reach the RPCs over PostgREST. HTTP-layer, not SQL.
--   · The concurrent double-accept, which needs two connections holding a row
--     lock at once. The recipe is in 20260814092000_accept_invite_rpc.sql.
--   · Anything about the frontend.
--
--
-- CASE ORDER IS LOAD-BEARING. §6 onward mutate the fixture — a token accepted
-- in §6 is the spent token §9 needs, and the membership §6 creates is what
-- makes §10 an already-a-member case rather than a first acceptance.
--
--
-- A FAILING ROW IS A SECURITY DEFECT. The final SELECT lists failures first.

begin;

-- ---------------------------------------------------------------------------
-- Harness — identical in shape to scripts/verify-m3-14-membership.sql
-- ---------------------------------------------------------------------------

create temporary table m4_results (
  seq      serial primary key,
  label    text,
  expected text,
  actual   text,
  pass     boolean
) on commit drop;

-- Runs p_sql as p_uid and records the outcome.
--
-- p_expect is either 'ok' or a specific SQLSTATE. Requiring the exact SQLSTATE
-- matters: a typo in a case would raise 42601 and, under a looser "did it
-- raise at all" check, be recorded as a pass.
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
    -- p_uid null is the UNAUTHENTICATED case, and it has to CLEAR the GUCs
    -- rather than skip setting them: set_config(…, true) is transaction-local,
    -- not statement-local, so a previous case's claims would otherwise still
    -- be in force and the call would run as that user. Empty string rather
    -- than NULL because auth.uid() nullifs '' before casting — '' reaches the
    -- uuid cast in neither definition, NULL might.
    if p_uid is null then
      perform set_config('request.jwt.claims',    '', true);
      perform set_config('request.jwt.claim.sub', '', true);
    else
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
        true
      );
      perform set_config('request.jwt.claim.sub', p_uid::text, true);
    end if;
    execute 'set local role authenticated';
    execute p_sql;
    v_actual := 'ok';
  exception when others then
    v_actual := sqlstate;
  end;
  execute 'reset role';

  insert into m4_results (label, expected, actual, pass)
  values (p_label, p_expect, v_actual, v_actual = p_expect);
end;
$fn$;

-- Runs a single-value SELECT as p_uid and compares the result.
--
-- try_as discards what a statement returns, which is enough for a denial but
-- not for accept_invite: 'accepted' and 'already_member' are both 'ok', and
-- the whole idempotence rule lives in the difference between them.
create or replace function pg_temp.expect_value_as(
  p_label    text,
  p_uid      uuid,
  p_sql      text,
  p_expected text
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
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    execute 'set local role authenticated';
    execute p_sql into v_actual;
    v_actual := coalesce(v_actual, 'null');
  exception when others then
    v_actual := sqlstate;
  end;
  execute 'reset role';

  insert into m4_results (label, expected, actual, pass)
  values (p_label, p_expected, v_actual, v_actual = p_expected);
end;
$fn$;

-- Records a plain boolean assertion, for state and privilege checks.
create or replace function pg_temp.expect_true(p_label text, p_cond boolean)
returns void
language plpgsql
as $fn$
begin
  insert into m4_results (label, expected, actual, pass)
  values (p_label, 'true', coalesce(p_cond::text, 'null'), coalesce(p_cond, false));
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
--
--   f001 board A owner    f002 board A admin     f003 board A editor
--   f004 board A viewer   f005 outsider #1       f006 outsider #2
--   f007 outsider #3      board A = ...4a
--
-- Invite rows are seeded DIRECTLY rather than through create_invite, so the
-- acceptance cases have known tokens. create_invite is under test in §1–§5 and
-- §12; accept_invite is under test here, and coupling the two would mean a
-- create_invite regression showed up as an acceptance failure.

do $fixtures$
declare
  v_ids uuid[] := array[
    '00000000-0000-4000-8000-00000000f001'::uuid,
    '00000000-0000-4000-8000-00000000f002'::uuid,
    '00000000-0000-4000-8000-00000000f003'::uuid,
    '00000000-0000-4000-8000-00000000f004'::uuid,
    '00000000-0000-4000-8000-00000000f005'::uuid,
    '00000000-0000-4000-8000-00000000f006'::uuid,
    '00000000-0000-4000-8000-00000000f007'::uuid
  ];
  v_board uuid := '00000000-0000-4000-8000-00000000004a';
  v_id    uuid;
  v_n     int := 0;
begin
  foreach v_id in array v_ids loop
    v_n := v_n + 1;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'm4-' || v_n || '@example.test', now(), now())
    on conflict (id) do nothing;

    insert into public.profiles (id, email, username)
    values (v_id, 'm4-' || v_n || '@example.test', 'm4-user-' || v_n)
    on conflict (id) do nothing;
  end loop;

  -- The M3-03 AFTER INSERT trigger mints the owner membership.
  insert into public.boards (id, owner_id, title)
  values (v_board, v_ids[1], 'M4 fixture board A');

  insert into public.board_members (board_id, user_id, role) values
    (v_board, v_ids[2], 'admin'),
    (v_board, v_ids[3], 'editor'),
    (v_board, v_ids[4], 'viewer');

  insert into public.board_invites (board_id, token, role, expires_at, created_by) values
    -- §6 f005 accepts this and becomes an editor. §9 reuses it as the spent one.
    (v_board, 'm4-tok-valid-editor', 'editor', now() + interval '7 days',  v_ids[1]),
    -- §7
    (v_board, 'm4-tok-expired',      'editor', now() - interval '1 minute', v_ids[1]),
    -- §8: revoked by the owner, then presented
    (v_board, 'm4-tok-revoked',      'viewer', now() + interval '7 days',  v_ids[1]),
    -- §11: offered to f004, who is already a viewer, at a HIGHER role
    (v_board, 'm4-tok-upgrade-trap', 'admin',  now() + interval '7 days',  v_ids[1]),
    -- §11b: offered to f002, who is already an admin, at a LOWER role
    (v_board, 'm4-tok-demote-trap',  'viewer', now() + interval '7 days',  v_ids[1]),
    -- §9's revoke-an-accepted-invite case needs its own row
    (v_board, 'm4-tok-for-revoke',   'viewer', now() + interval '7 days',  v_ids[1]);
end;
$fixtures$;


-- ---------------------------------------------------------------------------
-- §1 · An owner may invite at viewer, editor and admin
-- ---------------------------------------------------------------------------

select pg_temp.try_as('owner invites viewer',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','viewer')$$, 'ok');

select pg_temp.try_as('owner invites editor',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','editor')$$, 'ok');

select pg_temp.try_as('owner invites admin',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','admin')$$, 'ok');


-- ---------------------------------------------------------------------------
-- §2 · An admin may invite at viewer and editor
-- ---------------------------------------------------------------------------

select pg_temp.try_as('admin invites viewer',
  '00000000-0000-4000-8000-00000000f002',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','viewer')$$, 'ok');

select pg_temp.try_as('admin invites editor',
  '00000000-0000-4000-8000-00000000f002',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','editor')$$, 'ok');


-- ---------------------------------------------------------------------------
-- §3 · An admin may NOT invite an admin
-- ---------------------------------------------------------------------------
--
-- The denial a plain "caller is admin or owner" gate would let through. Same
-- rule that stops an admin promoting one (M3-14).

select pg_temp.try_as('admin invites admin — DENIED',
  '00000000-0000-4000-8000-00000000f002',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','admin')$$, '42501');


-- ---------------------------------------------------------------------------
-- §4 · Nobody may invite an owner (I6), and a junk role is rejected
-- ---------------------------------------------------------------------------

select pg_temp.try_as('owner invites owner — DENIED',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','owner')$$, '42501');

select pg_temp.try_as('admin invites owner — DENIED',
  '00000000-0000-4000-8000-00000000f002',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','owner')$$, '42501');

select pg_temp.try_as('unrecognised role — DENIED',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','admiral')$$, '22023');


-- ---------------------------------------------------------------------------
-- §5 · Editors, viewers and non-members may not invite at all
-- ---------------------------------------------------------------------------

select pg_temp.try_as('editor invites — DENIED',
  '00000000-0000-4000-8000-00000000f003',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','viewer')$$, '42501');

select pg_temp.try_as('viewer invites — DENIED',
  '00000000-0000-4000-8000-00000000f004',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','viewer')$$, '42501');

select pg_temp.try_as('non-member invites — DENIED',
  '00000000-0000-4000-8000-00000000f005',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','viewer')$$, '42501');

-- Five invites exist that create_invite made: three from §1, two from §2, and
-- none from the seven denials in §3–§5. Every assertion from here on is scoped
-- to the fixture board — this script runs against a real database, and an
-- unscoped aggregate would read production rows and fail on their expiry dates.
select pg_temp.expect_true('the seven denials created nothing; the five grants did',
  (select count(*) = 5 from public.board_invites
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and token not like 'm4-tok-%'));

-- 48 hex characters is what encode(gen_random_bytes(24),'hex') produces. A
-- shorter token, or one that is not hex, means the generator changed — and the
-- entropy claim in the migration header is the reason the token is safe to
-- treat as a credential.
select pg_temp.expect_true('created tokens are 48 hex characters',
  (select bool_and(token ~ '^[0-9a-f]{48}$')
   from public.board_invites
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and token not like 'm4-tok-%'));


-- ---------------------------------------------------------------------------
-- §6 · A valid token grants exactly the INVITED role
-- ---------------------------------------------------------------------------

select pg_temp.expect_value_as('f005 accepts a valid editor invite',
  '00000000-0000-4000-8000-00000000f005',
  $$select status from public.accept_invite('m4-tok-valid-editor')$$, 'accepted');

select pg_temp.expect_true('f005 is now a member at the invited role (editor)',
  (select role = 'editor' from public.board_members
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and user_id  = '00000000-0000-4000-8000-00000000f005'));

select pg_temp.expect_true('accepted_at is stamped',
  (select accepted_at is not null from public.board_invites
   where token = 'm4-tok-valid-editor'));


-- ---------------------------------------------------------------------------
-- §7 · Expired tokens are refused, and grant nothing
-- ---------------------------------------------------------------------------

select pg_temp.try_as('expired token — DENIED',
  '00000000-0000-4000-8000-00000000f006',
  $$select public.accept_invite('m4-tok-expired')$$, '22023');

select pg_temp.expect_true('the expired token created no membership',
  (select count(*) = 0 from public.board_members
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and user_id  = '00000000-0000-4000-8000-00000000f006'));


-- ---------------------------------------------------------------------------
-- §8 · A revoked token is indistinguishable from one that never existed
-- ---------------------------------------------------------------------------

select pg_temp.try_as('owner revokes a pending invite',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.revoke_invite(
      (select id from public.board_invites where token = 'm4-tok-revoked'))$$, 'ok');

select pg_temp.expect_true('the revoked row is gone',
  (select count(*) = 0 from public.board_invites where token = 'm4-tok-revoked'));

select pg_temp.try_as('revoked token — DENIED',
  '00000000-0000-4000-8000-00000000f006',
  $$select public.accept_invite('m4-tok-revoked')$$, 'P0002');

select pg_temp.try_as('garbage token — DENIED, same error',
  '00000000-0000-4000-8000-00000000f006',
  $$select public.accept_invite('not-a-token-at-all')$$, 'P0002');


-- ---------------------------------------------------------------------------
-- §9 · A spent token admits nobody else
-- ---------------------------------------------------------------------------
--
-- f005 consumed m4-tok-valid-editor in §6. f006 presenting it now is the
-- replay case, minus the concurrency.

select pg_temp.try_as('spent token, different user — DENIED',
  '00000000-0000-4000-8000-00000000f006',
  $$select public.accept_invite('m4-tok-valid-editor')$$, '23505');

select pg_temp.expect_true('the spent token created no second membership',
  (select count(*) = 0 from public.board_members
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and user_id  = '00000000-0000-4000-8000-00000000f006'));


-- ---------------------------------------------------------------------------
-- §10 · The same user accepting twice is a clean no-op
-- ---------------------------------------------------------------------------

select pg_temp.expect_value_as('f005 accepts the same token again',
  '00000000-0000-4000-8000-00000000f005',
  $$select status from public.accept_invite('m4-tok-valid-editor')$$, 'already_member');

select pg_temp.expect_true('f005 still has exactly one membership row',
  (select count(*) = 1 from public.board_members
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and user_id  = '00000000-0000-4000-8000-00000000f005'));

select pg_temp.expect_true('f005 is still an editor',
  (select role = 'editor' from public.board_members
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and user_id  = '00000000-0000-4000-8000-00000000f005'));


-- ---------------------------------------------------------------------------
-- §11 · Accepting while already a member never moves the role
-- ---------------------------------------------------------------------------
--
-- Both directions, because a leaked link must be harmless to someone who has
-- since been promoted AND to someone who has since been demoted.

select pg_temp.expect_value_as('viewer f004 presents an ADMIN invite',
  '00000000-0000-4000-8000-00000000f004',
  $$select status from public.accept_invite('m4-tok-upgrade-trap')$$, 'already_member');

select pg_temp.expect_true('f004 is still a viewer — no upgrade',
  (select role = 'viewer' from public.board_members
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and user_id  = '00000000-0000-4000-8000-00000000f004'));

select pg_temp.expect_true('the upgrade-trap invite was not consumed',
  (select accepted_at is null from public.board_invites
   where token = 'm4-tok-upgrade-trap'));

select pg_temp.expect_value_as('admin f002 presents a VIEWER invite',
  '00000000-0000-4000-8000-00000000f002',
  $$select status from public.accept_invite('m4-tok-demote-trap')$$, 'already_member');

select pg_temp.expect_true('f002 is still an admin — no downgrade',
  (select role = 'admin' from public.board_members
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and user_id  = '00000000-0000-4000-8000-00000000f002'));

-- Unauthenticated acceptance. auth.uid() is null with no claims set, so the
-- function's own guard fires; the missing EXECUTE grant for anon is the other
-- half and is an HTTP-level check.
select pg_temp.try_as('unauthenticated accept — DENIED',
  null,
  $$select public.accept_invite('m4-tok-for-revoke')$$, '28000');


-- ---------------------------------------------------------------------------
-- §12 · revoke_invite authorization, and the accepted-invite refusal
-- ---------------------------------------------------------------------------

-- ⚠ The id is INTERPOLATED, not sub-selected. A sub-select inside the case
-- runs as `authenticated` under RLS, where a viewer sees no invite rows at all
-- — so revoke_invite(NULL) would be called, the case would pass on the
-- not-found branch, and the AUTHORIZATION branch would never execute. format()
-- resolves the id out here, as the session role, so the function is handed a
-- real id it must refuse on its own.
select pg_temp.try_as('viewer revokes — DENIED as not-found',
  '00000000-0000-4000-8000-00000000f004',
  format($$select public.revoke_invite(%L)$$,
    (select id from public.board_invites where token = 'm4-tok-for-revoke')), 'P0002');

select pg_temp.try_as('non-member revokes — DENIED as not-found',
  '00000000-0000-4000-8000-00000000f007',
  format($$select public.revoke_invite(%L)$$,
    (select id from public.board_invites where token = 'm4-tok-for-revoke')), 'P0002');

select pg_temp.try_as('revoking an ACCEPTED invite — DENIED',
  '00000000-0000-4000-8000-00000000f001',
  format($$select public.revoke_invite(%L)$$,
    (select id from public.board_invites where token = 'm4-tok-valid-editor')), '23505');

select pg_temp.expect_true('the accepted invite survives as the audit trail',
  (select count(*) = 1 from public.board_invites where token = 'm4-tok-valid-editor'));

select pg_temp.try_as('admin revokes a pending invite',
  '00000000-0000-4000-8000-00000000f002',
  $$select public.revoke_invite(
      (select id from public.board_invites where token = 'm4-tok-for-revoke'))$$, 'ok');


-- ---------------------------------------------------------------------------
-- §13 · Expiry is clamped server-side to 1..30 days
-- ---------------------------------------------------------------------------
--
-- The client picks from a three-item menu; these are the requests that menu
-- cannot produce. A link that never expires must not be reachable by asking.

select pg_temp.try_as('owner asks for 0 days',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','viewer',0)$$, 'ok');

select pg_temp.try_as('owner asks for 9999 days',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','viewer',9999)$$, 'ok');

select pg_temp.try_as('owner asks for null days',
  '00000000-0000-4000-8000-00000000f001',
  $$select public.create_invite('00000000-0000-4000-8000-00000000004a','viewer',null)$$, 'ok');

select pg_temp.expect_true('every created invite expires within 1..30 days',
  (select bool_and(expires_at >  now() + interval '23 hours'
               and expires_at <= now() + interval '30 days')
   from public.board_invites
   where board_id = '00000000-0000-4000-8000-00000000004a'
     and token not like 'm4-tok-%'));


-- ---------------------------------------------------------------------------
-- §14 · The table's own boundary
-- ---------------------------------------------------------------------------

select pg_temp.expect_true('board_invites has no INSERT/UPDATE/DELETE policy',
  (select count(*) = 0 from pg_policies
   where schemaname = 'public' and tablename = 'board_invites' and cmd <> 'SELECT'));

-- has_table_privilege rather than information_schema.role_table_grants: that
-- view only shows grants involving a role the CURRENT user is a member of, so
-- it can report nothing for anon and authenticated and turn a real grant into
-- a silent pass. has_table_privilege answers directly, whoever is asking.
select pg_temp.expect_true('anon holds no privilege on board_invites',
  not has_table_privilege('anon', 'public.board_invites', 'SELECT')
  and not has_table_privilege('anon', 'public.board_invites', 'INSERT')
  and not has_table_privilege('anon', 'public.board_invites', 'UPDATE')
  and not has_table_privilege('anon', 'public.board_invites', 'DELETE'));

select pg_temp.expect_true('authenticated holds SELECT and nothing else',
  has_table_privilege('authenticated', 'public.board_invites', 'SELECT')
  and not has_table_privilege('authenticated', 'public.board_invites', 'INSERT')
  and not has_table_privilege('authenticated', 'public.board_invites', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.board_invites', 'DELETE'));

-- The RPCs are the write path, so anon must not be able to call them either.
select pg_temp.expect_true('anon cannot execute the invite RPCs',
  not has_function_privilege('anon', 'public.create_invite(uuid,text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.accept_invite(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.revoke_invite(uuid)', 'EXECUTE'));

-- Unscoped deliberately, unlike the assertions above: the check constraint is
-- a global promise, and an 'owner' row anywhere in production is a finding.
select pg_temp.expect_true('role = owner is not storable',
  not exists (select 1 from public.board_invites where role = 'owner'));

-- The three functions are SECURITY DEFINER with a pinned search_path. Both
-- properties are load-bearing and neither is visible from behaviour.
-- Matched by PREFIX, not equality. Postgres stores the pinned empty path as
-- `search_path=""` — the quoted empty string — so `proconfig @>
-- array['search_path=']` never matched and this reported a false FAIL against
-- three functions that were correctly configured all along.
select pg_temp.expect_true('invite RPCs are SECURITY DEFINER with search_path pinned',
  (select count(*) = 3 from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_invite','accept_invite','revoke_invite')
     and p.prosecdef
     and exists (select 1 from unnest(p.proconfig) cfg
                 where cfg like 'search\_path=%')));


-- ---------------------------------------------------------------------------
-- Report — failures first
-- ---------------------------------------------------------------------------

select
  case when pass then 'PASS' else '*** FAIL ***' end as result,
  label, expected, actual
from m4_results
order by pass, seq;

select count(*) as total,
       count(*) filter (where pass)     as passed,
       count(*) filter (where not pass) as failed
from m4_results;

rollback;
