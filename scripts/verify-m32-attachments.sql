-- M32 · Attachments — the table and storage policies, per role.
--
-- The REST-level checklist in section 10 of
-- supabase/migrations/20260831090000_create_attachments.sql, expressed as SQL
-- so it can be run without two live accounts and a token for each. It exercises
-- every policy expression in that migration with a real role and a real
-- auth.uid(), on both public.attachments and storage.objects.
--
-- 29 checks. Each prints PASS or FAIL as a NOTICE. A FAIL is a defect.
--
--
-- HOW TO RUN
--
--   Against a SHADOW database, not the linked project: it seeds auth.users,
--   profiles, boards, columns and todos, and section 5 deletes a work item to
--   watch the cascade. It is wrapped in a transaction and ends in ROLLBACK, so
--   a run leaves nothing behind — but run it somewhere disposable anyway.
--
--   The fastest shadow: a container from the project's own Postgres image, the
--   auth/storage scaffolding a Supabase project has outside this repo, then
--   every migration in order. With Docker Desktop running, "supabase db reset"
--   does the same thing and is less work.
--
--   Run it as a SUPERUSER. The script switches roles itself — that is the whole
--   point, since a policy tested as its table's owner is not tested at all.
--
--
-- WHY TWO BOARDS AND SIX USERS
--
--   "An admin on board A has no path to an attachment on board B" is the rule
--   most easily got wrong, and it cannot be tested with one board. The
--   both-boards editor exists for one check: the composite foreign key is only
--   REACHABLE by a caller the INSERT policy already let through, so testing it
--   with a non-member proves the policy, not the key.
--
--
-- WHAT A PASS HERE DOES NOT PROVE
--
--   PostgREST and storage-api sit above these policies and add their own
--   checks. This proves the database refuses; it does not prove the API layer
--   surfaces the refusal well. The migration's own section 10 is still the list
--   to run against the real project when there is one.

begin;

-- M32 · the REST-level checklist from section 10 of
-- 20260831090000_create_attachments.sql, run at SQL level against a shadow
-- database. Not a substitute for the REST run (PostgREST adds its own layer),
-- but it exercises every policy expression with a real role and a real
-- auth.uid().


-- Storage grants a real project has and the stub did not.
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- ---------------------------------------------------------------- helpers --

create or replace function pg_temp.chk(label text, expect text, stmt text)
returns void language plpgsql as $$
declare got text;
begin
  begin
    execute stmt;
    got := 'ok';
  exception when others then
    got := sqlstate;
  end;

  if got = expect then
    raise notice 'PASS  % -> %', label, got;
  else
    raise warning 'FAIL  % -> expected %, got %', label, expect, got;
  end if;
end $$;

create or replace function pg_temp.chk_rows(label text, expect int, q text)
returns void language plpgsql as $$
declare got int;
begin
  execute q into got;

  if got = expect then
    raise notice 'PASS  % -> % rows', label, got;
  else
    raise warning 'FAIL  % -> expected % rows, got %', label, expect, got;
  end if;
end $$;

create or replace function pg_temp.act(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, false);
end $$;

-- ------------------------------------------------------------------ seed --

-- Two boards so "an admin on board A has no path to board B" is testable.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'owner@x.test'),
  ('00000000-0000-4000-8000-00000000000b', 'admin@x.test'),
  ('00000000-0000-4000-8000-00000000000c', 'editor@x.test'),
  ('00000000-0000-4000-8000-00000000000d', 'editor2@x.test'),
  ('00000000-0000-4000-8000-00000000000e', 'viewer@x.test'),
  ('00000000-0000-4000-8000-00000000000f', 'stranger@x.test'),
  ('00000000-0000-4000-8000-000000000010', 'bothboards@x.test');

insert into public.profiles (id, username) values
  ('00000000-0000-4000-8000-00000000000a', 'owner'),
  ('00000000-0000-4000-8000-00000000000b', 'admin'),
  ('00000000-0000-4000-8000-00000000000c', 'editor'),
  ('00000000-0000-4000-8000-00000000000d', 'editor2'),
  ('00000000-0000-4000-8000-00000000000e', 'viewer'),
  ('00000000-0000-4000-8000-00000000000f', 'stranger'),
  ('00000000-0000-4000-8000-000000000010', 'bothboards');

insert into public.boards (id, title, owner_id) values
  ('10000000-0000-4000-8000-000000000001', 'Board A',
   '00000000-0000-4000-8000-00000000000a'),
  ('10000000-0000-4000-8000-000000000002', 'Board B',
   '00000000-0000-4000-8000-00000000000f');

insert into public.board_members (board_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-00000000000b', 'admin'),
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-00000000000c', 'editor'),
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-00000000000d', 'editor'),
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-00000000000e', 'viewer'),
  -- Editor on BOTH boards, and used by exactly one test: the composite key is
  -- only reachable by a caller the policy lets through on both sides.
  ('10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000010', 'editor'),
  ('10000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000010', 'editor')
on conflict do nothing;

insert into public.columns (id, board_id, title, category, position) values
  ('20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'To do', 'todo', 0);

insert into public.todos (id, board_id, column_id, title, type) values
  ('30000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', 'A card', 'Task'),
  ('30000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000002', null, 'Other board card', 'Task');

insert into storage.buckets (id, name, public) values ('other', 'other', true)
  on conflict (id) do nothing;

-- ======================= 1. THE TABLE ======================='

-- ------------------------------------------------------------ the viewer --
set role authenticated;
select pg_temp.act('00000000-0000-4000-8000-00000000000e');

select pg_temp.chk('viewer  insert', '42501', $q$
  insert into public.attachments
    (board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-00000000000e',
          'v.txt', 'p/v', 1, 'text/plain')
$q$);

-- ------------------------------------------------------------ the editor --
select pg_temp.act('00000000-0000-4000-8000-00000000000c');

select pg_temp.chk('editor  insert own', 'ok', $q$
  insert into public.attachments
    (id, board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('40000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-00000000000c',
          'spec.pdf',
          '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.pdf',
          1024, 'application/pdf')
$q$);

select pg_temp.chk('editor  insert as another user', '42501', $q$
  insert into public.attachments
    (board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-00000000000b',
          'forged.txt', 'p/forged', 1, 'text/plain')
$q$);

select pg_temp.chk('editor  insert with null uploader', '42501', $q$
  insert into public.attachments
    (board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          null, 'anon.txt', 'p/anon', 1, 'text/plain')
$q$);

-- 42501, not 23503: the policy resolves `board_role` on the *claimed* board and
-- refuses a non-member before the foreign key is ever evaluated. Authorization
-- answers first, which is the order to want.
select pg_temp.chk('editor  insert claiming a board they are not on', '42501', $q$
  insert into public.attachments
    (board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('10000000-0000-4000-8000-000000000002',
          '30000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-00000000000c',
          'x.txt', 'p/x', 1, 'text/plain')
$q$);

-- The case the composite key exists for, and the only one that reaches it: a
-- caller who really is an editor on both boards, filing a Board A card under
-- Board B. The policy is satisfied on both sides and the FK is what refuses.
select pg_temp.act('00000000-0000-4000-8000-000000000010');

select pg_temp.chk('both-boards editor, cross-board todo/board pair', '23503', $q$
  insert into public.attachments
    (board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('10000000-0000-4000-8000-000000000002',
          '30000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000010',
          'x.txt', 'p/x', 1, 'text/plain')
$q$);

select pg_temp.act('00000000-0000-4000-8000-00000000000c');

select pg_temp.chk('editor  insert with blank filename', '23514', $q$
  insert into public.attachments
    (board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-00000000000c',
          '   ', 'p/blank', 1, 'text/plain')
$q$);

select pg_temp.chk('editor  insert with negative size', '23514', $q$
  insert into public.attachments
    (board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-00000000000c',
          'neg.txt', 'p/neg', -1, 'text/plain')
$q$);

select pg_temp.chk('editor  UPDATE any column', '42501', $q$
  update public.attachments set filename = 'renamed.pdf'
   where id = '40000000-0000-4000-8000-000000000001'
$q$);

-- -------------------------------------------------- a second editor's row --
select pg_temp.act('00000000-0000-4000-8000-00000000000d');

select pg_temp.chk('editor2 insert own', 'ok', $q$
  insert into public.attachments
    (id, board_id, todo_id, uploader_id, filename, storage_path, size_bytes, mime_type)
  values ('40000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-00000000000d',
          'notes.md',
          '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002.md',
          64, 'text/markdown')
$q$);

select pg_temp.chk_rows('editor2 delete another editor''s row', 0, $q$
  with d as (
    delete from public.attachments
     where id = '40000000-0000-4000-8000-000000000001' returning 1
  ) select count(*)::int from d
$q$);

-- ------------------------------------------------------------- the reader --
select pg_temp.act('00000000-0000-4000-8000-00000000000e');
select pg_temp.chk_rows('viewer  select the list', 2,
  $q$ select count(*)::int from public.attachments $q$);

select pg_temp.act('00000000-0000-4000-8000-00000000000f');
select pg_temp.chk_rows('non-member select', 0,
  $q$ select count(*)::int from public.attachments $q$);

reset role;
set role anon;
select pg_temp.act('00000000-0000-4000-8000-00000000000c');
select pg_temp.chk('anon    select', '42501',
  $q$ select count(*) from public.attachments $q$);

-- ======================= 2. STORAGE ========================='

reset role;
set role authenticated;

-- ------------------------------------------------------------ the editor --
select pg_temp.act('00000000-0000-4000-8000-00000000000c');

select pg_temp.chk('editor  upload into their board folder', 'ok', $q$
  insert into storage.objects (bucket_id, name, owner) values
    ('task-attachments',
     '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.pdf',
     '00000000-0000-4000-8000-00000000000c')
$q$);

select pg_temp.chk('editor  upload into another board''s folder', '42501', $q$
  insert into storage.objects (bucket_id, name, owner) values
    ('task-attachments',
     '10000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002/x.pdf',
     '00000000-0000-4000-8000-00000000000c')
$q$);

select pg_temp.chk('editor  upload at the bucket root', '42501', $q$
  insert into storage.objects (bucket_id, name, owner)
  values ('task-attachments', 'loose.pdf',
          '00000000-0000-4000-8000-00000000000c')
$q$);

select pg_temp.chk('editor  upload three folders deep', '42501', $q$
  insert into storage.objects (bucket_id, name, owner) values
    ('task-attachments',
     '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/deeper/x.pdf',
     '00000000-0000-4000-8000-00000000000c')
$q$);

select pg_temp.chk('editor  upload under a non-uuid folder', '22P02', $q$
  insert into storage.objects (bucket_id, name, owner)
  values ('task-attachments', 'not-a-uuid/also-not/x.pdf',
          '00000000-0000-4000-8000-00000000000c')
$q$);

-- The second editor's object, for the cross-uploader delete tests.
select pg_temp.act('00000000-0000-4000-8000-00000000000d');
select pg_temp.chk('editor2 upload own', 'ok', $q$
  insert into storage.objects (bucket_id, name, owner) values
    ('task-attachments',
     '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000002.md',
     '00000000-0000-4000-8000-00000000000d')
$q$);

-- ------------------------------------------------------------ the viewer --
select pg_temp.act('00000000-0000-4000-8000-00000000000e');

select pg_temp.chk('viewer  upload', '42501', $q$
  insert into storage.objects (bucket_id, name, owner) values
    ('task-attachments',
     '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/v.pdf',
     '00000000-0000-4000-8000-00000000000e')
$q$);

select pg_temp.chk_rows('viewer  read the objects', 2, $q$
  select count(*)::int from storage.objects
   where bucket_id = 'task-attachments'
$q$);

select pg_temp.act('00000000-0000-4000-8000-00000000000f');
select pg_temp.chk_rows('non-member read the objects', 0, $q$
  select count(*)::int from storage.objects
   where bucket_id = 'task-attachments'
$q$);

-- ------------------------------------------------ delete mirrors the row --
select pg_temp.act('00000000-0000-4000-8000-00000000000d');
select pg_temp.chk_rows('editor2 delete another editor''s object', 0, $q$
  with d as (
    delete from storage.objects
     where bucket_id = 'task-attachments'
       and name like '%40000000-0000-4000-8000-000000000001.pdf'
    returning 1
  ) select count(*)::int from d
$q$);

select pg_temp.chk_rows('editor2 delete their own object', 1, $q$
  with d as (
    delete from storage.objects
     where bucket_id = 'task-attachments'
       and name like '%40000000-0000-4000-8000-000000000002.md'
    returning 1
  ) select count(*)::int from d
$q$);

select pg_temp.act('00000000-0000-4000-8000-00000000000b');
select pg_temp.chk_rows('admin   delete another editor''s object', 1, $q$
  with d as (
    delete from storage.objects
     where bucket_id = 'task-attachments'
       and name like '%40000000-0000-4000-8000-000000000001.pdf'
    returning 1
  ) select count(*)::int from d
$q$);

select pg_temp.chk_rows('admin   delete another editor''s row', 1, $q$
  with d as (
    delete from public.attachments
     where id = '40000000-0000-4000-8000-000000000001' returning 1
  ) select count(*)::int from d
$q$);

-- --------------------------------------------- the avatars bucket is safe --
select pg_temp.act('00000000-0000-4000-8000-00000000000c');
select pg_temp.chk('editor  upload into avatars via the new policies', '42501', $q$
  insert into storage.objects (bucket_id, name, owner)
  values ('avatars',
          '10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/x.png',
          '00000000-0000-4000-8000-00000000000c')
$q$);

-- ======================= 3. THE BUCKET ======================'

reset role;
select
  id,
  public                       as is_public,
  file_size_limit,
  allowed_mime_types is null   as no_mime_list
from storage.buckets where id = 'task-attachments';

-- =================== 4. GRANTS ON THE TABLE ================='

select
  has_table_privilege('authenticated', 'public.attachments', 'select') as sel,
  has_table_privilege('authenticated', 'public.attachments', 'insert') as ins,
  has_table_privilege('authenticated', 'public.attachments', 'update') as upd,
  has_table_privilege('authenticated', 'public.attachments', 'delete') as del,
  has_table_privilege('anon',          'public.attachments', 'select') as anon_sel;

-- =================== 5. CASCADE FROM todos ================='

do $$
declare left_over int;
begin
  delete from public.todos where id = '30000000-0000-4000-8000-000000000001';
  select count(*)::int into left_over from public.attachments;

  if left_over = 0 then
    raise notice 'PASS  deleting the work item cascaded its attachments';
  else
    raise warning 'FAIL  % attachment rows survived the work item', left_over;
  end if;
end $$;

rollback;
