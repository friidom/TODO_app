-- M3-16 · Role matrix acceptance verification. THE MILESTONE GATE.
--
-- Executes every cell of both matrices in Part II of docs/IMPLEMENTATION_PLAN.md
-- against the live schema, plus the rules M3-17, M3-18 and M3-11 add.
--
--   viewer  read only
--   editor  work item + column CRUD and reorder
--   admin   editor, plus member management and Viewer/Editor roles
--   owner   everything, including Admin management
--
-- Owner immutability (I1-I5) is NOT re-tested here. It is proven twice already,
-- at the RPC layer by scripts/verify-m3-14-membership.sql and below the RPC
-- layer by scripts/verify-m3-15-owner-immutability.sql. Section 6 covers only
-- the one new path M3-17 opens: the widened boards UPDATE policy.
--
--
-- HOW TO RUN
--
--   Paste the whole file into the Supabase SQL editor and execute it.
--   It ends in ROLLBACK. Nothing it creates survives.
--
--   Run it against the LINKED PROJECT, after 20260811140000 is applied.
--
--
-- WHY THERE IS NO JWT PER ROLE
--
--   Same reasoning as the M3-14 harness, and the same helper. auth.uid() reads
--   the request.jwt.claims GUC that PostgREST sets from the verified token, and
--   a session can set that GUC directly. Each case also does `set local role
--   authenticated`, so table privileges are exercised alongside the policies —
--   a denial that came from a missing GRANT rather than from RLS still shows up.
--
--
-- WHAT THIS DOES *NOT* PROVE
--
--   · The HTTP layer. PostgREST's own behaviour — status codes, the shape of a
--     denied response, anon reaching an endpoint at all — is not exercised.
--     What is asserted here is the database's answer, which is the boundary.
--   · Reload persistence. Every case runs in one transaction, so "still there
--     after a hard refresh" is not observable. The upsert path in section 4 is
--     the one that fails silently on reload, and it is asserted by re-reading
--     the rows rather than by trusting the row count.
--   · Anything about the frontend.
--
--
-- ON DENIALS THAT ARE NOT ERRORS
--
--   This is the trap the whole file is built around. An RLS denial has two
--   completely different shapes:
--
--     INSERT  → WITH CHECK fails → raises 42501, loudly.
--     UPDATE  → USING filters the row out → ZERO ROWS, silently. No error.
--     DELETE  → same. Zero rows, silently.
--     SELECT  → same. Empty result, silently.
--
--   So a viewer's UPDATE does not fail. It succeeds, having changed nothing.
--   Asserting "it raised" would pass a schema with no UPDATE policy at all, and
--   asserting "it did not raise" would pass one that permits everything. Row
--   counts are the only assertion that separates them, which is why rows_as()
--   exists alongside try_as().
--
--
-- A FAILING ROW IS A SECURITY DEFECT. The final SELECT lists failures first.

begin;

-- ---------------------------------------------------------------------------
-- 0. Harness
-- ---------------------------------------------------------------------------

create temporary table m3_16_results (
  seq      serial primary key,
  section  text,
  label    text,
  expected text,
  actual   text,
  pass     boolean
) on commit drop;

create or replace function pg_temp.as_user(p_uid uuid)
returns void
language plpgsql
as $fn$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
  -- Older auth.uid() builds read the flat per-claim GUC instead of the JSON
  -- one. Setting both makes the harness independent of which definition the
  -- target database carries.
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end;
$fn$;

-- Runs p_sql as p_uid and records the SQLSTATE, or 'ok'.
--
-- p_expect is 'ok' or an exact SQLSTATE. Exact, not "did it raise": a typo in a
-- case raises 42601, and a looser check would record that as a denial correctly
-- observed.
create or replace function pg_temp.try_as(
  p_section text, p_label text, p_uid uuid, p_sql text, p_expect text
)
returns void
language plpgsql
as $fn$
declare
  v_actual text;
begin
  begin
    perform pg_temp.as_user(p_uid);
    execute p_sql;
    v_actual := 'ok';
  exception when others then
    -- An aborted subtransaction also rolls back the SET LOCAL above.
    v_actual := sqlstate;
  end;
  execute 'reset role';

  insert into m3_16_results (section, label, expected, actual, pass)
  values (p_section, p_label, p_expect, v_actual, v_actual = p_expect);
end;
$fn$;

-- Runs p_sql as p_uid and records how many rows it touched.
--
-- This is the helper that catches a silent RLS denial. Expected 0 means "the
-- policy filtered it out"; expected 1 means "it actually happened".
create or replace function pg_temp.rows_as(
  p_section text, p_label text, p_uid uuid, p_sql text, p_expect bigint
)
returns void
language plpgsql
as $fn$
declare
  v_rows   bigint;
  v_actual text;
begin
  begin
    perform pg_temp.as_user(p_uid);
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_actual := v_rows::text;
  exception when others then
    v_actual := sqlstate;
  end;
  execute 'reset role';

  insert into m3_16_results (section, label, expected, actual, pass)
  values (p_section, p_label, p_expect::text, v_actual, v_actual = p_expect::text);
end;
$fn$;

-- For statements whose denial MECHANISM is genuinely not predictable — the
-- upsert in section 4, where the ON CONFLICT path may be refused by the INSERT
-- WITH CHECK or by the UPDATE USING depending on whether the row already
-- exists. Passes on either shape of denial and records which one occurred.
--
-- Weaker than the two helpers above, so it is used exactly once, and always
-- paired with a state assertion that proves nothing moved. The positive case
-- for the same statement is written from the same SQL string, so a typo fails
-- there loudly rather than passing quietly here.
create or replace function pg_temp.denied_as(
  p_section text, p_label text, p_uid uuid, p_sql text
)
returns void
language plpgsql
as $fn$
declare
  v_rows   bigint;
  v_actual text;
begin
  begin
    perform pg_temp.as_user(p_uid);
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_actual := v_rows::text || ' rows';
  exception when others then
    v_actual := sqlstate;
  end;
  execute 'reset role';

  insert into m3_16_results (section, label, expected, actual, pass)
  values (p_section, p_label, 'raised or 0 rows', v_actual,
          v_actual <> 'ok' and v_actual !~ '^[1-9][0-9]* rows$');
end;
$fn$;

create or replace function pg_temp.expect_true(
  p_section text, p_label text, p_cond boolean
)
returns void
language plpgsql
as $fn$
begin
  insert into m3_16_results (section, label, expected, actual, pass)
  values (p_section, p_label, 'true', coalesce(p_cond::text, 'null'),
          coalesce(p_cond, false));
end;
$fn$;


-- ---------------------------------------------------------------------------
-- 1. Fixtures
-- ---------------------------------------------------------------------------
--
--   f001 owner of A and C      f002 admin of A and C
--   f003 editor of A           f004 viewer of A
--   f005 outsider — no membership anywhere
--   f006 owner of B — a member of a DIFFERENT board, which is what makes
--        "cross-board membership grants nothing" a real test rather than a
--        restatement of the outsider case
--
--   board A = ...00fa   the subject
--   board B = ...00fb   the other board, for isolation and cross-board writes
--   board C = ...00fc   a throwaway, so the owner-deletes-a-board case can
--                       succeed without destroying A halfway through the run
--
--   columns c1, c2 on A     c9 on B
--   work items d1, d2 on A/c1
--
-- profiles.id references auth.users(id), so the users must exist first. The
-- ON CONFLICT DO NOTHING on profiles is because handle_new_user() is a trigger
-- on auth.users that already inserts one.

do $fixtures$
declare
  v_ids uuid[] := array[
    '00000000-0000-4000-8000-00000000f001'::uuid,
    '00000000-0000-4000-8000-00000000f002'::uuid,
    '00000000-0000-4000-8000-00000000f003'::uuid,
    '00000000-0000-4000-8000-00000000f004'::uuid,
    '00000000-0000-4000-8000-00000000f005'::uuid,
    '00000000-0000-4000-8000-00000000f006'::uuid
  ];
  v_id uuid;
  v_n  int := 0;
begin
  foreach v_id in array v_ids loop
    v_n := v_n + 1;
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'm316-' || v_n || '@example.test', now(), now())
    on conflict (id) do nothing;

    insert into public.profiles (id, email, username)
    values (v_id, 'm316-' || v_n || '@example.test', 'm316-user-' || v_n)
    on conflict (id) do nothing;
  end loop;

  -- The M3-03 AFTER INSERT trigger mints each board's owner membership.
  insert into public.boards (id, owner_id, title) values
    ('00000000-0000-4000-8000-0000000000fa', v_ids[1], 'M3-16 board A'),
    ('00000000-0000-4000-8000-0000000000fb', v_ids[6], 'M3-16 board B'),
    ('00000000-0000-4000-8000-0000000000fc', v_ids[1], 'M3-16 board C');

  -- Seeded directly, as the session role. The RPCs that would normally create
  -- these are M3-14's and are under test in their own harness, not this one.
  insert into public.board_members (board_id, user_id, role) values
    ('00000000-0000-4000-8000-0000000000fa', v_ids[2], 'admin'),
    ('00000000-0000-4000-8000-0000000000fa', v_ids[3], 'editor'),
    ('00000000-0000-4000-8000-0000000000fa', v_ids[4], 'viewer'),
    ('00000000-0000-4000-8000-0000000000fc', v_ids[2], 'admin');

  insert into public.columns (id, board_id, title, position, category) values
    ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000fa', 'To do',  0, 'todo'),
    ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000fa', 'Doing',  1, 'in_progress'),
    ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000fb', 'B only', 0, 'todo');

  insert into public.todos (id, board_id, column_id, title, position) values
    ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000c1', 'A card 1', 0),
    ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000c1', 'A card 2', 1);
end;
$fixtures$;

select pg_temp.expect_true('1 fixture',
  'board A has exactly one owner and four members',
  (select count(*) = 4 and count(*) filter (where role = 'owner') = 1
   from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000fa'));


-- ===========================================================================
-- 2. Work items — the content matrix
-- ===========================================================================

-- viewer: reads everything on the board, writes nothing.
select pg_temp.rows_as('2 todos', 'viewer reads all work items on the board',
  '00000000-0000-4000-8000-00000000f004',
  $$select * from public.todos where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 2);

select pg_temp.try_as('2 todos', 'viewer cannot create a work item',
  '00000000-0000-4000-8000-00000000f004',
  $$insert into public.todos (id, board_id, column_id, title, position)
    values ('00000000-0000-4000-8000-0000000000d3','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c1','nope',9)$$,
  '42501');

select pg_temp.rows_as('2 todos', 'viewer cannot update a work item',
  '00000000-0000-4000-8000-00000000f004',
  $$update public.todos set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000d1'$$, 0);

select pg_temp.rows_as('2 todos', 'viewer cannot delete a work item',
  '00000000-0000-4000-8000-00000000f004',
  $$delete from public.todos where id = '00000000-0000-4000-8000-0000000000d1'$$, 0);

-- editor: full work item CRUD.
select pg_temp.rows_as('2 todos', 'editor reads all work items on the board',
  '00000000-0000-4000-8000-00000000f003',
  $$select * from public.todos where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 2);

select pg_temp.rows_as('2 todos', 'editor creates a work item',
  '00000000-0000-4000-8000-00000000f003',
  $$insert into public.todos (id, board_id, column_id, title, position)
    values ('00000000-0000-4000-8000-0000000000d4','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c1','editor card',2)$$, 1);

select pg_temp.rows_as('2 todos', 'editor updates a work item',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.todos set title = 'editor renamed' where id = '00000000-0000-4000-8000-0000000000d4'$$, 1);

select pg_temp.rows_as('2 todos', 'editor deletes a work item',
  '00000000-0000-4000-8000-00000000f003',
  $$delete from public.todos where id = '00000000-0000-4000-8000-0000000000d4'$$, 1);

-- admin: everything an editor can do.
select pg_temp.rows_as('2 todos', 'admin creates a work item',
  '00000000-0000-4000-8000-00000000f002',
  $$insert into public.todos (id, board_id, column_id, title, position)
    values ('00000000-0000-4000-8000-0000000000d5','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c1','admin card',3)$$, 1);

select pg_temp.rows_as('2 todos', 'admin updates a work item',
  '00000000-0000-4000-8000-00000000f002',
  $$update public.todos set title = 'admin renamed' where id = '00000000-0000-4000-8000-0000000000d5'$$, 1);

select pg_temp.rows_as('2 todos', 'admin deletes a work item',
  '00000000-0000-4000-8000-00000000f002',
  $$delete from public.todos where id = '00000000-0000-4000-8000-0000000000d5'$$, 1);

-- owner: everything.
select pg_temp.rows_as('2 todos', 'owner creates a work item',
  '00000000-0000-4000-8000-00000000f001',
  $$insert into public.todos (id, board_id, column_id, title, position)
    values ('00000000-0000-4000-8000-0000000000d6','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c1','owner card',4)$$, 1);

select pg_temp.rows_as('2 todos', 'owner updates a work item',
  '00000000-0000-4000-8000-00000000f001',
  $$update public.todos set title = 'owner renamed' where id = '00000000-0000-4000-8000-0000000000d6'$$, 1);

select pg_temp.rows_as('2 todos', 'owner deletes a work item',
  '00000000-0000-4000-8000-00000000f001',
  $$delete from public.todos where id = '00000000-0000-4000-8000-0000000000d6'$$, 1);

-- non-member: the board does not exist as far as they are concerned.
select pg_temp.rows_as('2 todos', 'non-member reads no work items',
  '00000000-0000-4000-8000-00000000f005',
  $$select * from public.todos where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 0);

select pg_temp.try_as('2 todos', 'non-member cannot create a work item',
  '00000000-0000-4000-8000-00000000f005',
  $$insert into public.todos (id, board_id, column_id, title, position)
    values ('00000000-0000-4000-8000-0000000000d7','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c1','nope',9)$$,
  '42501');

select pg_temp.rows_as('2 todos', 'non-member cannot update a work item',
  '00000000-0000-4000-8000-00000000f005',
  $$update public.todos set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000d1'$$, 0);

select pg_temp.rows_as('2 todos', 'non-member cannot delete a work item',
  '00000000-0000-4000-8000-00000000f005',
  $$delete from public.todos where id = '00000000-0000-4000-8000-0000000000d1'$$, 0);

-- cross-board: being the OWNER of another board grants nothing here.
select pg_temp.rows_as('2 todos', 'owner of board B reads no work items on A',
  '00000000-0000-4000-8000-00000000f006',
  $$select * from public.todos where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 0);

select pg_temp.try_as('2 todos', 'owner of board B cannot create a work item on A',
  '00000000-0000-4000-8000-00000000f006',
  $$insert into public.todos (id, board_id, column_id, title, position)
    values ('00000000-0000-4000-8000-0000000000d8','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c1','nope',9)$$,
  '42501');

select pg_temp.rows_as('2 todos', 'owner of board B cannot update a work item on A',
  '00000000-0000-4000-8000-00000000f006',
  $$update public.todos set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000d1'$$, 0);

select pg_temp.expect_true('2 todos',
  'after every denial, board A still holds exactly its 2 original work items',
  (select count(*) = 2 from public.todos
   where board_id = '00000000-0000-4000-8000-0000000000fa'));


-- ===========================================================================
-- 3. Columns — the same matrix, the same verbs
-- ===========================================================================

select pg_temp.rows_as('3 columns', 'viewer reads all columns on the board',
  '00000000-0000-4000-8000-00000000f004',
  $$select * from public.columns where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 2);

select pg_temp.try_as('3 columns', 'viewer cannot create a column',
  '00000000-0000-4000-8000-00000000f004',
  $$insert into public.columns (id, board_id, title, position)
    values ('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000fa','nope',9)$$,
  '42501');

select pg_temp.rows_as('3 columns', 'viewer cannot rename a column',
  '00000000-0000-4000-8000-00000000f004',
  $$update public.columns set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000c1'$$, 0);

select pg_temp.rows_as('3 columns', 'viewer cannot delete a column',
  '00000000-0000-4000-8000-00000000f004',
  $$delete from public.columns where id = '00000000-0000-4000-8000-0000000000c2'$$, 0);

select pg_temp.rows_as('3 columns', 'editor creates a column',
  '00000000-0000-4000-8000-00000000f003',
  $$insert into public.columns (id, board_id, title, position)
    values ('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000fa','editor column',2)$$, 1);

select pg_temp.rows_as('3 columns', 'editor renames a column',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.columns set title = 'editor renamed' where id = '00000000-0000-4000-8000-0000000000c3'$$, 1);

select pg_temp.rows_as('3 columns', 'editor reorders columns',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.columns set position = position + 10
     where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 3);

select pg_temp.rows_as('3 columns', 'editor deletes a column',
  '00000000-0000-4000-8000-00000000f003',
  $$delete from public.columns where id = '00000000-0000-4000-8000-0000000000c3'$$, 1);

select pg_temp.rows_as('3 columns', 'admin creates a column',
  '00000000-0000-4000-8000-00000000f002',
  $$insert into public.columns (id, board_id, title, position)
    values ('00000000-0000-4000-8000-0000000000c4','00000000-0000-4000-8000-0000000000fa','admin column',3)$$, 1);

select pg_temp.rows_as('3 columns', 'admin deletes a column',
  '00000000-0000-4000-8000-00000000f002',
  $$delete from public.columns where id = '00000000-0000-4000-8000-0000000000c4'$$, 1);

select pg_temp.rows_as('3 columns', 'owner creates a column',
  '00000000-0000-4000-8000-00000000f001',
  $$insert into public.columns (id, board_id, title, position)
    values ('00000000-0000-4000-8000-0000000000c5','00000000-0000-4000-8000-0000000000fa','owner column',4)$$, 1);

select pg_temp.rows_as('3 columns', 'owner deletes a column',
  '00000000-0000-4000-8000-00000000f001',
  $$delete from public.columns where id = '00000000-0000-4000-8000-0000000000c5'$$, 1);

select pg_temp.rows_as('3 columns', 'non-member reads no columns',
  '00000000-0000-4000-8000-00000000f005',
  $$select * from public.columns where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 0);

select pg_temp.try_as('3 columns', 'non-member cannot create a column',
  '00000000-0000-4000-8000-00000000f005',
  $$insert into public.columns (id, board_id, title, position)
    values ('00000000-0000-4000-8000-0000000000c6','00000000-0000-4000-8000-0000000000fa','nope',9)$$,
  '42501');

select pg_temp.rows_as('3 columns', 'non-member cannot rename a column',
  '00000000-0000-4000-8000-00000000f005',
  $$update public.columns set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000c1'$$, 0);

select pg_temp.rows_as('3 columns', 'owner of board B cannot rename a column on A',
  '00000000-0000-4000-8000-00000000f006',
  $$update public.columns set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000c1'$$, 0);

select pg_temp.expect_true('3 columns',
  'board A still holds exactly its 2 original columns',
  (select count(*) = 2 from public.columns
   where board_id = '00000000-0000-4000-8000-0000000000fa'));


-- ===========================================================================
-- 4. The reorder path — one upsert, two policies
-- ===========================================================================
--
-- reorderTodos and useTodoDrop write the whole affected array back with
-- `upsert(..., { onConflict: 'id' })`. That is INSERT ... ON CONFLICT DO UPDATE,
-- which is checked against the INSERT WITH CHECK, the UPDATE USING and the
-- UPDATE WITH CHECK. A missing UPDATE policy does not error here — the drag
-- appears to work and reverts on the next refetch, which reads as a broken
-- board rather than as a permission. This is the single highest-traffic write
-- in the application and the one most likely to fail invisibly.

select pg_temp.rows_as('4 reorder', 'editor moves both cards to another column by upsert',
  '00000000-0000-4000-8000-00000000f003',
  $$insert into public.todos (id, board_id, column_id, title, position) values
      ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c2','A card 1',0),
      ('00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c2','A card 2',1)
    on conflict (id) do update
      set column_id = excluded.column_id, position = excluded.position$$, 2);

select pg_temp.expect_true('4 reorder',
  'the editor upsert really landed — both cards re-read on the destination column',
  (select count(*) = 2 from public.todos
   where column_id = '00000000-0000-4000-8000-0000000000c2'));

select pg_temp.denied_as('4 reorder', 'viewer cannot reorder by upsert',
  '00000000-0000-4000-8000-00000000f004',
  $$insert into public.todos (id, board_id, column_id, title, position) values
      ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c1','A card 1',7),
      ('00000000-0000-4000-8000-0000000000d2','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c1','A card 2',8)
    on conflict (id) do update
      set column_id = excluded.column_id, position = excluded.position$$);

-- The assertion that actually proves the denial: whatever shape it took, the
-- cards did not move back and their positions are untouched.
select pg_temp.expect_true('4 reorder',
  'after the viewer upsert, both cards are still on the destination at 0 and 1',
  (select count(*) = 2 from public.todos
   where column_id = '00000000-0000-4000-8000-0000000000c2'
     and position in (0, 1)));

-- Restore, so later sections start from the seeded layout.
update public.todos set column_id = '00000000-0000-4000-8000-0000000000c1'
 where id in ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000d2');


-- ===========================================================================
-- 5. Board settings — M3-17
-- ===========================================================================
--
--   rename / re-theme  →  admin and owner
--   delete             →  owner only

select pg_temp.rows_as('5 board', 'viewer cannot rename the board',
  '00000000-0000-4000-8000-00000000f004',
  $$update public.boards set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000fa'$$, 0);

select pg_temp.rows_as('5 board', 'editor cannot rename the board',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.boards set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000fa'$$, 0);

select pg_temp.rows_as('5 board', 'non-member cannot rename the board',
  '00000000-0000-4000-8000-00000000f005',
  $$update public.boards set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000fa'$$, 0);

select pg_temp.rows_as('5 board', 'owner of board B cannot rename board A',
  '00000000-0000-4000-8000-00000000f006',
  $$update public.boards set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000fa'$$, 0);

select pg_temp.rows_as('5 board', 'admin renames the board',
  '00000000-0000-4000-8000-00000000f002',
  $$update public.boards set title = 'renamed by admin' where id = '00000000-0000-4000-8000-0000000000fa'$$, 1);

select pg_temp.rows_as('5 board', 'admin re-themes the board',
  '00000000-0000-4000-8000-00000000f002',
  $$update public.boards set cover_color = '#123456' where id = '00000000-0000-4000-8000-0000000000fa'$$, 1);

select pg_temp.rows_as('5 board', 'owner renames the board',
  '00000000-0000-4000-8000-00000000f001',
  $$update public.boards set title = 'renamed by owner' where id = '00000000-0000-4000-8000-0000000000fa'$$, 1);

-- Delete is owner-only. Board C exists so the successful case has something to
-- destroy that is not the board the rest of the file depends on.
select pg_temp.rows_as('5 board', 'viewer cannot delete a board',
  '00000000-0000-4000-8000-00000000f004',
  $$delete from public.boards where id = '00000000-0000-4000-8000-0000000000fc'$$, 0);

select pg_temp.rows_as('5 board', 'editor cannot delete a board',
  '00000000-0000-4000-8000-00000000f003',
  $$delete from public.boards where id = '00000000-0000-4000-8000-0000000000fc'$$, 0);

select pg_temp.rows_as('5 board', 'ADMIN CANNOT DELETE A BOARD',
  '00000000-0000-4000-8000-00000000f002',
  $$delete from public.boards where id = '00000000-0000-4000-8000-0000000000fc'$$, 0);

select pg_temp.expect_true('5 board',
  'board C survived every non-owner delete attempt',
  (select exists (select 1 from public.boards
                  where id = '00000000-0000-4000-8000-0000000000fc')));

select pg_temp.rows_as('5 board', 'owner deletes a board',
  '00000000-0000-4000-8000-00000000f001',
  $$delete from public.boards where id = '00000000-0000-4000-8000-0000000000fc'$$, 1);

select pg_temp.expect_true('5 board',
  'deleting board C cascaded its membership rows away',
  (select count(*) = 0 from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000fc'));


-- ===========================================================================
-- 6. The widened boards UPDATE policy is not an ownership transfer
-- ===========================================================================
--
-- M3-17 lets an admin write to the boards row. The question that opens: can
-- they write owner_id?
--
-- No policy can answer it — USING sees the old row and WITH CHECK the new one,
-- and neither can compare them. The answer is M3-15's boards_owner_immutable
-- trigger, and these two cases are what prove the widened policy did not open a
-- door behind it. They raise 42501 rather than affecting 0 rows, because a
-- trigger refusal is an error where an RLS refusal is an absence.

select pg_temp.try_as('6 owner_id', 'admin cannot make themselves the owner',
  '00000000-0000-4000-8000-00000000f002',
  $$update public.boards set owner_id = '00000000-0000-4000-8000-00000000f002'
     where id = '00000000-0000-4000-8000-0000000000fa'$$, '42501');

select pg_temp.try_as('6 owner_id', 'the owner cannot hand the board to someone else',
  '00000000-0000-4000-8000-00000000f001',
  $$update public.boards set owner_id = '00000000-0000-4000-8000-00000000f002'
     where id = '00000000-0000-4000-8000-0000000000fa'$$, '42501');

select pg_temp.expect_true('6 owner_id',
  'board A is still owned by f001',
  (select owner_id = '00000000-0000-4000-8000-00000000f001'
   from public.boards where id = '00000000-0000-4000-8000-0000000000fa'));


-- ===========================================================================
-- 7. Cross-board integrity — M3-18
-- ===========================================================================
--
-- The gap: todos.board_id and todos.column_id were independent foreign keys, so
-- an editor on A could point one of A's work items at a column on B. Both
-- policy clauses evaluate board_role on A and both pass — nothing ever looked
-- at the column. The composite foreign key is what looks at it, and it raises
-- 23503 (foreign_key_violation), not 42501: this is an integrity rule, not an
-- authorization one, and it applies to the owner exactly as it does to an editor.

select pg_temp.try_as('7 cross-board', 'editor cannot move a card onto another board''s column',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.todos set column_id = '00000000-0000-4000-8000-0000000000c9'
     where id = '00000000-0000-4000-8000-0000000000d1'$$, '23503');

select pg_temp.try_as('7 cross-board', 'the owner cannot either — this is a constraint, not a permission',
  '00000000-0000-4000-8000-00000000f001',
  $$update public.todos set column_id = '00000000-0000-4000-8000-0000000000c9'
     where id = '00000000-0000-4000-8000-0000000000d1'$$, '23503');

select pg_temp.try_as('7 cross-board', 'editor cannot create a card pointing at another board''s column',
  '00000000-0000-4000-8000-00000000f003',
  $$insert into public.todos (id, board_id, column_id, title, position)
    values ('00000000-0000-4000-8000-0000000000da','00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-0000000000c9','nope',9)$$,
  '23503');

-- The other direction: change board_id and leave column_id alone. This one is
-- refused by the UPDATE policy's WITH CHECK, before the constraint is reached —
-- the editor holds no role on B, so the proposed row fails board_role(B).
select pg_temp.try_as('7 cross-board', 'editor cannot move a card to another board',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.todos set board_id = '00000000-0000-4000-8000-0000000000fb'
     where id = '00000000-0000-4000-8000-0000000000d1'$$, '42501');

-- The positive cases. A constraint that refuses everything passes every denial
-- above, so these are what separate correct from merely strict.
select pg_temp.rows_as('7 cross-board', 'a normal drag between columns on one board still works',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.todos set column_id = '00000000-0000-4000-8000-0000000000c2'
     where id = '00000000-0000-4000-8000-0000000000d1'$$, 1);

select pg_temp.rows_as('7 cross-board', 'a card may still have no column at all (MATCH SIMPLE)',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.todos set column_id = null
     where id = '00000000-0000-4000-8000-0000000000d1'$$, 1);

select pg_temp.rows_as('7 cross-board', 'and can be put back',
  '00000000-0000-4000-8000-00000000f003',
  $$update public.todos set column_id = '00000000-0000-4000-8000-0000000000c1'
     where id = '00000000-0000-4000-8000-0000000000d1'$$, 1);

select pg_temp.expect_true('7 cross-board',
  'no work item anywhere points at a column on a different board',
  (select count(*) = 0
     from public.todos t
     join public.columns c on c.id = t.column_id
    where c.board_id is distinct from t.board_id));


-- ===========================================================================
-- 8. board_members is not client-writable — by anyone, in any role
-- ===========================================================================
--
-- RLS is on with a self-read policy and no INSERT, UPDATE or DELETE policy at
-- all. Membership changes go through M3-14's RPCs or they do not happen.
-- Permission Model rule 4 prohibits adding a write policy here; these cases are
-- what would fail if someone did.

select pg_temp.try_as('8 board_members', 'the owner cannot insert a membership row directly',
  '00000000-0000-4000-8000-00000000f001',
  $$insert into public.board_members (board_id, user_id, role)
    values ('00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-00000000f005','admin')$$,
  '42501');

select pg_temp.try_as('8 board_members', 'an admin cannot insert a membership row directly',
  '00000000-0000-4000-8000-00000000f002',
  $$insert into public.board_members (board_id, user_id, role)
    values ('00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-00000000f005','viewer')$$,
  '42501');

select pg_temp.try_as('8 board_members', 'a viewer cannot promote themselves by inserting',
  '00000000-0000-4000-8000-00000000f004',
  $$insert into public.board_members (board_id, user_id, role)
    values ('00000000-0000-4000-8000-0000000000fa','00000000-0000-4000-8000-00000000f004','owner')$$,
  '42501');

select pg_temp.rows_as('8 board_members', 'an admin cannot change a role directly',
  '00000000-0000-4000-8000-00000000f002',
  $$update public.board_members set role = 'admin'
     where board_id = '00000000-0000-4000-8000-0000000000fa'
       and user_id = '00000000-0000-4000-8000-00000000f004'$$, 0);

select pg_temp.rows_as('8 board_members', 'a viewer cannot promote themselves by updating',
  '00000000-0000-4000-8000-00000000f004',
  $$update public.board_members set role = 'owner'
     where board_id = '00000000-0000-4000-8000-0000000000fa'
       and user_id = '00000000-0000-4000-8000-00000000f004'$$, 0);

select pg_temp.rows_as('8 board_members', 'an admin cannot remove a member directly',
  '00000000-0000-4000-8000-00000000f002',
  $$delete from public.board_members
     where board_id = '00000000-0000-4000-8000-0000000000fa'
       and user_id = '00000000-0000-4000-8000-00000000f004'$$, 0);

select pg_temp.rows_as('8 board_members', 'the owner cannot remove their own row directly',
  '00000000-0000-4000-8000-00000000f001',
  $$delete from public.board_members
     where board_id = '00000000-0000-4000-8000-0000000000fa'
       and user_id = '00000000-0000-4000-8000-00000000f001'$$, 0);

-- The self-read policy: your own row, and only your own.
select pg_temp.rows_as('8 board_members', 'a viewer reads exactly one membership row — their own',
  '00000000-0000-4000-8000-00000000f004',
  $$select * from public.board_members where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 1);

select pg_temp.rows_as('8 board_members', 'even the owner reads only their own row from the table',
  '00000000-0000-4000-8000-00000000f001',
  $$select * from public.board_members where board_id = '00000000-0000-4000-8000-0000000000fa'$$, 1);

select pg_temp.expect_true('8 board_members',
  'board A still has its 4 members and exactly one owner',
  (select count(*) = 4 and count(*) filter (where role = 'owner') = 1
   from public.board_members
   where board_id = '00000000-0000-4000-8000-0000000000fa'));


-- ===========================================================================
-- 9. board_roster — M3-13
-- ===========================================================================
--
-- The table is self-read only, so the member list comes from the RPC. Its
-- return list is the exposure boundary: email and bio are deliberately not in
-- it, and profiles RLS stays self-only rather than being widened.

select pg_temp.rows_as('9 roster', 'a viewer sees every member through the roster RPC',
  '00000000-0000-4000-8000-00000000f004',
  $$select * from public.board_roster('00000000-0000-4000-8000-0000000000fa')$$, 4);

select pg_temp.rows_as('9 roster', 'an editor sees every member too',
  '00000000-0000-4000-8000-00000000f003',
  $$select * from public.board_roster('00000000-0000-4000-8000-0000000000fa')$$, 4);

select pg_temp.rows_as('9 roster', 'a non-member gets an empty roster, not an error',
  '00000000-0000-4000-8000-00000000f005',
  $$select * from public.board_roster('00000000-0000-4000-8000-0000000000fa')$$, 0);

select pg_temp.rows_as('9 roster', 'the owner of another board gets an empty roster',
  '00000000-0000-4000-8000-00000000f006',
  $$select * from public.board_roster('00000000-0000-4000-8000-0000000000fa')$$, 0);

select pg_temp.rows_as('9 roster', 'a board that does not exist is also just empty — no existence oracle',
  '00000000-0000-4000-8000-00000000f004',
  $$select * from public.board_roster('00000000-0000-4000-8000-00000000000f')$$, 0);

-- The return list IS the exposure boundary, so it is asserted as a signature
-- rather than inferred from a row. Five commas is six columns.
select pg_temp.expect_true('9 roster',
  'the roster signature exposes 6 columns and neither email nor bio',
  (select pg_get_function_result(p.oid) like 'TABLE(%'
      and pg_get_function_result(p.oid) not like '%email%'
      and pg_get_function_result(p.oid) not like '%bio%'
      and length(pg_get_function_result(p.oid))
          - length(replace(pg_get_function_result(p.oid), ',', '')) = 5
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'board_roster'));

-- Diagnostic, so a failure of the row above is readable without a second
-- session to investigate.
select pg_get_function_result(p.oid) as board_roster_returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'board_roster';

select pg_temp.rows_as('9 roster', 'a member still cannot read a teammate''s profile row directly',
  '00000000-0000-4000-8000-00000000f004',
  $$select * from public.profiles where id = '00000000-0000-4000-8000-00000000f001'$$, 0);


-- ===========================================================================
-- 10. delete_column — M3-11
-- ===========================================================================
--
-- SECURITY INVOKER, so M3-05's editor+ gate authorizes it and there is no
-- second copy of the rule. The zero-row DELETE check inside is what turns a
-- silent RLS denial into a 42501 — without it a viewer would be told the
-- column was deleted while nothing happened.

-- Give c2 a card, so the rehoming has something to do.
update public.todos set column_id = '00000000-0000-4000-8000-0000000000c2', position = 0
 where id = '00000000-0000-4000-8000-0000000000d2';

select pg_temp.try_as('10 delete_column', 'a viewer cannot delete a column through the RPC',
  '00000000-0000-4000-8000-00000000f004',
  $$select public.delete_column('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c1')$$,
  '42501');

select pg_temp.try_as('10 delete_column', 'a non-member cannot',
  '00000000-0000-4000-8000-00000000f005',
  $$select public.delete_column('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c1')$$,
  '42501');

select pg_temp.try_as('10 delete_column', 'the destination cannot be on another board',
  '00000000-0000-4000-8000-00000000f003',
  $$select public.delete_column('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c9')$$,
  '42501');

select pg_temp.try_as('10 delete_column', 'the destination cannot be the column being deleted',
  '00000000-0000-4000-8000-00000000f003',
  $$select public.delete_column('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c2')$$,
  '22023');

select pg_temp.try_as('10 delete_column', 'an unknown column id is refused, not silently ignored',
  '00000000-0000-4000-8000-00000000f003',
  $$select public.delete_column('00000000-0000-4000-8000-00000000000e','00000000-0000-4000-8000-0000000000c1')$$,
  '42501');

select pg_temp.expect_true('10 delete_column',
  'nothing was half-applied — c2 is still there, still holding its card',
  (select exists (select 1 from public.columns where id = '00000000-0000-4000-8000-0000000000c2')
      and exists (select 1 from public.todos
                  where id = '00000000-0000-4000-8000-0000000000d2'
                    and column_id = '00000000-0000-4000-8000-0000000000c2')));

select pg_temp.try_as('10 delete_column', 'an editor deletes a column and its card is rehomed',
  '00000000-0000-4000-8000-00000000f003',
  $$select public.delete_column('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c1')$$,
  'ok');

select pg_temp.expect_true('10 delete_column',
  'the column is gone and both cards are on the destination with dense positions',
  (select not exists (select 1 from public.columns where id = '00000000-0000-4000-8000-0000000000c2')
      and (select count(*) = 2 and count(distinct position) = 2 and min(position) = 0
             from public.todos
            where column_id = '00000000-0000-4000-8000-0000000000c1')));


-- ===========================================================================
-- 11. Structure — the rules above, asserted as schema rather than behaviour
-- ===========================================================================
--
-- Behaviour can pass for the wrong reason. These name the objects the
-- behaviour is supposed to be coming from, so a rule that quietly moved
-- somewhere weaker is visible.

select pg_temp.expect_true('11 structure',
  'boards has exactly one UPDATE policy and it is M3-17''s',
  (select count(*) = 1
   from pg_policies
   where schemaname = 'public' and tablename = 'boards' and cmd = 'UPDATE'
     and policyname = 'Admins and above update boards'));

select pg_temp.expect_true('11 structure',
  'the boards UPDATE policy carries WITH CHECK as well as USING',
  (select with_check is not null
   from pg_policies
   where schemaname = 'public' and tablename = 'boards' and cmd = 'UPDATE'));

select pg_temp.expect_true('11 structure',
  'boards DELETE is still owner-only',
  (select count(*) = 1
   from pg_policies
   where schemaname = 'public' and tablename = 'boards' and cmd = 'DELETE'
     and qual like '%owner_id%'));

select pg_temp.expect_true('11 structure',
  'board_members still has no INSERT/UPDATE/DELETE policy',
  (select count(*) = 0 from pg_policies
   where schemaname = 'public' and tablename = 'board_members' and cmd <> 'SELECT'));

-- has_table_privilege rather than information_schema.role_table_grants: the
-- view only shows grants whose grantor or grantee is a currently enabled role,
-- so an empty result there can mean "no privilege" or "not visible from this
-- session". The function answers the question directly.
select pg_temp.expect_true('11 structure',
  'anon holds no privilege at all on board_members — TRUNCATE included, which RLS does not filter',
  (select not (has_table_privilege('anon','public.board_members','SELECT')
            or has_table_privilege('anon','public.board_members','INSERT')
            or has_table_privilege('anon','public.board_members','UPDATE')
            or has_table_privilege('anon','public.board_members','DELETE')
            or has_table_privilege('anon','public.board_members','TRUNCATE'))));

select pg_temp.expect_true('11 structure',
  'authenticated holds SELECT on board_members and nothing else',
  (select has_table_privilege('authenticated','public.board_members','SELECT')
      and not has_table_privilege('authenticated','public.board_members','INSERT')
      and not has_table_privilege('authenticated','public.board_members','UPDATE')
      and not has_table_privilege('authenticated','public.board_members','DELETE')
      and not has_table_privilege('authenticated','public.board_members','TRUNCATE')));

select pg_temp.expect_true('11 structure',
  'todos_column_id_fkey is composite — (column_id, board_id) → columns (id, board_id)',
  (select array_length(conkey, 1) = 2
      and confrelid = 'public.columns'::regclass
      and confupdtype = 'a'      -- NO ACTION on update
      and confdeltype = 'r'      -- RESTRICT on delete, carried over from M2-07
   from pg_constraint
   where conname = 'todos_column_id_fkey'
     and conrelid = 'public.todos'::regclass));

select pg_temp.expect_true('11 structure',
  'the unique key the composite foreign key references exists on columns',
  (select exists (select 1 from pg_constraint
                  where conname = 'columns_id_board_id_key'
                    and contype = 'u'
                    and conrelid = 'public.columns'::regclass)));

select pg_temp.expect_true('11 structure',
  'delete_column is SECURITY INVOKER — it must NOT bypass RLS',
  (select not prosecdef from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'delete_column'));

select pg_temp.expect_true('11 structure',
  'anon cannot execute delete_column or board_roster',
  (select not has_function_privilege('anon','public.delete_column(uuid,uuid)','EXECUTE')
      and not has_function_privilege('anon','public.board_roster(uuid)','EXECUTE')));

select pg_temp.expect_true('11 structure',
  'authenticated CAN execute both — a revoke that went too far is also a defect',
  (select has_function_privilege('authenticated','public.delete_column(uuid,uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.board_roster(uuid)','EXECUTE')));

-- count(*) = 8 rather than bool_and, so a function that failed to create fails
-- this row instead of being silently excluded from the check.
select pg_temp.expect_true('11 structure',
  'all 8 SECURITY DEFINER membership functions still pin an EMPTY search_path',
  (select count(*) = 8
          and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('is_board_member','board_role','is_board_owner','board_roster',
                       'add_board_member','set_member_role','remove_board_member','leave_board')));


-- ---------------------------------------------------------------------------
-- Report — failures first
-- ---------------------------------------------------------------------------

select
  case when pass then 'PASS' else '*** FAIL ***' end as result,
  section, label, expected, actual
from m3_16_results
order by pass, seq;

select section,
       count(*)                            as cases,
       count(*) filter (where pass)        as passed,
       count(*) filter (where not pass)    as failed
from m3_16_results
group by section
order by section;

select count(*) as total,
       count(*) filter (where pass)     as passed,
       count(*) filter (where not pass) as failed
from m3_16_results;

rollback;
