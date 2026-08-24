-- M23-02 · Rename the default space so "Unfiled" means unfiled again.
--
-- 20260821180000 gave every account a real default space and called it
-- "Unfiled". That was the wrong name, and the wrongness is not cosmetic: the
-- sidebar ALSO synthesises a heading called "Unfiled" for boards that are in no
-- space of yours — a board shared with you, whose owner's space row your RLS
-- cannot read. So the product had two adjacent headings with the same name
-- meaning two different things, one of them renameable and one not.
--
-- "Unfiled" is now reserved for its literal meaning: `groupBoardsBySpace`'s
-- synthetic remainder group. The real default folder every account gets is
-- "My Space", which pairs with the "My Board" the same function creates.
--
--
-- WHAT THE BOARDS EXPERIENCE
-- ---------------------------------------------------------------------------
--
-- **Nothing.** This migration writes one column of one table: `spaces.title`.
-- No board is created, deleted, moved, re-owned or re-filed; `boards.space_id`
-- is not touched. Every board stays in exactly the space it is in — that space
-- is simply labelled differently in the sidebar.
--
--
-- WHAT IS RENAMED, AND WHAT IS NOT
-- ---------------------------------------------------------------------------
--
-- Every space whose title is still exactly "Unfiled" (case- and
-- whitespace-insensitive). There is no way to distinguish one that
-- 20260821180000 created from one a user typed themselves, and no need to: the
-- point of this migration is that "Unfiled" is not a name a *space* should
-- carry, whoever set it. A user who wants it back can rename it in the sidebar,
-- which is the ⋯ menu this whole thread exists to make work.
--
-- `spaces.title` has a length check (1..60) and no uniqueness constraint, so
-- 'My Space' can neither violate a constraint nor collide with an existing row.


-- 1. Existing accounts -------------------------------------------------------

do $$
declare
  v_renamed integer;
begin
  update public.spaces
     set title = 'My Space'
   where lower(btrim(title)) = 'unfiled';

  get diagnostics v_renamed = row_count;

  raise notice 'M23-02: renamed % space(s) from Unfiled to My Space', v_renamed;
end;
$$;


-- 2. New accounts ------------------------------------------------------------
--
-- Identical to 20260821180000 apart from the two strings. Everything else —
-- the idempotent early return, the profile upsert, the username resolution,
-- the four default columns — is unchanged.

create or replace function public.provision_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email    text;
  v_wanted   text;
  v_username text;
  v_board_id uuid;
  v_space_id uuid;
begin
  if p_user_id is null then
    raise exception 'provision_user requires a user id';
  end if;

  -- Idempotent, and that is load-bearing now that two callers exist: the
  -- trigger runs at confirmation and the RPC may run again at any sign-in.
  select b.id into v_board_id
    from public.boards b
   where b.owner_id = p_user_id
   order by b.created_at, b.id
   limit 1;

  if v_board_id is not null then
    return v_board_id;
  end if;

  -- The name the person typed at registration, carried through confirmation in
  -- user metadata. Falls back to the address's local part for an account
  -- created some other way — an admin invite, a seed, an older client.
  select u.email,
         public.normalize_username(u.raw_user_meta_data ->> 'username')
    into v_email, v_wanted
    from auth.users u
   where u.id = p_user_id;

  v_username := public.available_username(
    coalesce(v_wanted, split_part(coalesce(v_email, ''), '@', 1)),
    p_user_id::text
  );

  insert into public.profiles as p (id, email, username)
  values (p_user_id, v_email, v_username)
  on conflict (id) do update
    set email    = excluded.email,
        username = coalesce(p.username, excluded.username);

  -- The default folder (M23). Reused rather than duplicated if one is somehow
  -- already there.
  select s.id into v_space_id
    from public.spaces s
   where s.owner_id = p_user_id
     and lower(btrim(s.title)) = 'my space'
   order by s.created_at, s.id
   limit 1;

  if v_space_id is null then
    insert into public.spaces (owner_id, title)
    values (p_user_id, 'My Space')
    returning id into v_space_id;
  end if;

  insert into public.boards (owner_id, title, space_id)
  values (p_user_id, 'My Board', v_space_id)
  returning id into v_board_id;

  insert into public.columns (board_id, title, position, category)
  values
    (v_board_id, 'To Do',       0, 'todo'),
    (v_board_id, 'In Progress', 1, 'in_progress'),
    (v_board_id, 'In Review',   2, 'in_progress'),
    (v_board_id, 'Done',        3, 'done');

  return v_board_id;
end;
$$;

revoke all on function public.provision_user(uuid) from public, anon, authenticated;


-- Rollback -------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, in a NEW migration:
--   update public.spaces set title = 'Unfiled' where lower(btrim(title)) = 'my space';
-- and restore provision_user from 20260821180000.
--
--
-- Verification ---------------------------------------------------------------
--
--   select count(*) from public.spaces where lower(btrim(title)) = 'unfiled';
--   -- expect: 0
--
--   select count(*) from public.boards;                    -- unchanged
--   select count(*) from public.boards where space_id is null;  -- unchanged
