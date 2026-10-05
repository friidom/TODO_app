-- 0031 — board_keys: every key a board has ever had.
--
-- A task key is derived (boards.key_prefix || '-' || todos.board_key), so
-- renaming a board's key from MNH to HOB re-labels every card at once. A
-- commit message that already says MNH-42 must still resolve, and must never
-- resolve to some other board that later chose MNH. So every key is recorded
-- here and the primary key makes it unique across current AND retired keys in
-- one index. A board may take back a key it held before; no other board may,
-- ever. Deleting a board leaves its keys behind with board_id null, for the
-- same reason todos.board_key is never reused.
--
-- boards.key_prefix stays the board's current key; every reader uses it.
--
-- Backfilled by 0032. 0033 adds the unique index on boards.key_prefix and
-- drops the 'KAN' default.
--
-- Forward-only. Reversing means a new migration.

create table board_keys (
  key        text primary key,
  board_id   uuid references boards (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint board_keys_key_format check (key ~ '^[A-Z][A-Z0-9]{1,9}$')
);

create index board_keys_board_id_idx on board_keys (board_id);

comment on table board_keys is
  'Every key any board has held. board_id null is a deleted board''s key, '
  'kept so it is never reissued. Written by reserve_board_key.';

create or replace function public.reserve_board_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.board_keys (key, board_id)
  values (new.key_prefix, new.id)
  on conflict (key) do nothing;

  -- do nothing also swallows a key another board holds (or held), so that
  -- case is raised here, named so the API can say which value collided.
  if not exists (
    select 1
      from public.board_keys k
     where k.key = new.key_prefix
       and k.board_id = new.id
  ) then
    raise exception 'board key % is already in use', new.key_prefix
      using errcode = 'unique_violation', constraint = 'board_keys_pkey';
  end if;

  return new;
end;
$$;

create trigger boards_reserve_key
  after insert or update of key_prefix on boards
  for each row execute function public.reserve_board_key();
