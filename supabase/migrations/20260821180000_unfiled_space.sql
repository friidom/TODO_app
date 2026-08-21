-- M23 · Make "Unfiled" a real space. RISKY (data migration). Tier B.
--
-- **The sidebar's "Unfiled" heading was never a row.** `groupBoardsBySpace`
-- synthesises it for every board with `space_id is null`, which is why it alone
-- had no ⋯ menu: Rename and Delete had no target. This migration gives it one.
--
-- Three parts, and they have to be in this order:
--
--   1. The filing trigger has to tolerate a null `auth.uid()`, or parts 2 and 3
--      cannot file anything.
--   2. `provision_user` creates the space for every new account.
--   3. A backfill creates it for every existing account and moves their unfiled
--      boards into it.
--
--
-- WHAT THE BOARDS EXPERIENCE
-- ---------------------------------------------------------------------------
--
-- **Nothing except gaining a `space_id`.** No board is created, deleted,
-- renamed, re-owned or moved between owners; no card, column, member or invite
-- is touched. A board that was under the synthetic "Unfiled" heading is now
-- under a real space of the same name, in the same place in the sidebar, with
-- the same contents.
--
-- **Deleting that space does not delete them either.** `boards.space_id` is
-- `on delete set null` (20260814110000), so removing the space returns its
-- boards to exactly the state this migration found them in — unfiled, under the
-- synthetic heading again. That is what makes the new Delete safe to offer: it
-- is precisely reversible, which is also what `DeleteSpaceModal` already tells
-- the user it does.
--
--
-- WHAT IS NOT BACKFILLED, AND WHY
-- ---------------------------------------------------------------------------
--
-- **Boards owned by somebody else.** A board shared with you carries its
-- owner's `space_id`, which your RLS cannot read, so `groupBoardsBySpace` files
-- it under the synthetic heading too. Those stay there: spaces are owner-only,
-- you cannot file a board you do not own (that is the trigger this migration
-- widens, not removes), and moving another person's board into your folder
-- would be exactly the escalation it exists to stop.
--
-- So the synthetic heading does not disappear — it stops being the *only* thing
-- called Unfiled. On an account with no shared boards it renders nothing at
-- all, because `groupBoardsBySpace` drops it when empty.


-- 1. The filing guard, widened for server-side callers -------------------------
--
-- Identical to 20260814110000 apart from the null-session branch. The guard
-- asks "is the caller the board's owner, and do they own the target space" —
-- both questions presuppose a caller. `provision_user` runs from the
-- `on_auth_user_confirmed` trigger, where there is no session at all and
-- `auth.uid()` is null, so every check below evaluates against null and the
-- first one raises. A migration is in the same position.
--
-- **This is not a weakening of the cross-user rule.** With no authenticated
-- user there is no user to escalate *from*: the only things that reach here in
-- that state are SECURITY DEFINER functions owned by postgres and migrations,
-- both of which construct the owner and the space themselves. Every path that
-- carries a session is checked exactly as before.

create or replace function public.boards_space_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Nothing to police unless the filing itself changes. `is not distinct from`
  -- rather than `=` so a null-to-null update is caught too, instead of
  -- evaluating to null and falling through to the checks below.
  if tg_op = 'UPDATE' and new.space_id is not distinct from old.space_id then
    return new;
  end if;

  -- Unfiling is always allowed, for anyone who may update the board at all.
  -- Taking a board out of a space is not an escalation, and it is the only way
  -- out of a filing you did not choose.
  if new.space_id is null then
    return new;
  end if;

  -- Server-side: no session, so no user to police. See the header above.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.owner_id is distinct from (select auth.uid()) then
    raise exception
      'Only a board''s owner may file it into a space'
      using errcode = '42501';
  end if;

  if not public.owns_space(new.space_id) then
    raise exception
      'A board can only be filed into a space you own'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.boards_space_ownership() is
  'Filing guard for boards.space_id (M15, widened M23). Fires only when '
  'space_id changes, so M3-17 admin updates to other columns are unaffected. '
  'Passes through when there is no session: server-side provisioning and '
  'migrations have no auth.uid() and no user to escalate from.';


-- 2. New accounts get the space --------------------------------------------------
--
-- Identical to 20260821100000 apart from the space. The idempotent early
-- return, the profile upsert, the username resolution and the four columns are
-- untouched — the board is simply created already filed.
--
-- The space is looked up before it is created, so an account that somehow
-- reaches this twice does not accumulate folders.

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
     and lower(btrim(s.title)) = 'unfiled'
   order by s.created_at, s.id
   limit 1;

  if v_space_id is null then
    insert into public.spaces (owner_id, title)
    values (p_user_id, 'Unfiled')
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


-- 3. Existing accounts ------------------------------------------------------------
--
-- One space per owner who has at least one unfiled board of their own, then
-- their unfiled boards moved into it.
--
-- **Idempotent.** An owner who already has a space called 'Unfiled' reuses it
-- rather than gaining a second, and re-running the whole block moves nothing
-- because no board is left with a null `space_id` for that owner.
--
-- `owner_id is not null` guards the one shape this could otherwise trip on: a
-- board whose owner row was removed. There should be none — `boards.owner_id`
-- is NOT NULL — but a filter costs nothing and an unowned board has no person
-- to make a folder for.

do $$
declare
  v_owner uuid;
  v_space uuid;
  v_moved integer;
  v_total integer := 0;
  v_owners integer := 0;
begin
  for v_owner in
    select distinct b.owner_id
      from public.boards b
     where b.space_id is null
       and b.owner_id is not null
  loop
    select s.id into v_space
      from public.spaces s
     where s.owner_id = v_owner
       and lower(btrim(s.title)) = 'unfiled'
     order by s.created_at, s.id
     limit 1;

    if v_space is null then
      insert into public.spaces (owner_id, title)
      values (v_owner, 'Unfiled')
      returning id into v_space;
    end if;

    update public.boards b
       set space_id = v_space
     where b.owner_id = v_owner
       and b.space_id is null;

    get diagnostics v_moved = row_count;

    v_total  := v_total + v_moved;
    v_owners := v_owners + 1;
  end loop;

  raise notice 'M23 backfill: filed % board(s) for % owner(s)', v_total, v_owners;
end;
$$;


-- Rollback ---------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, put the following in a NEW migration.
-- Note that this unfiles the boards but leaves the spaces, because by then some
-- of them may have been renamed and be genuinely wanted:
--
--   update public.boards b
--      set space_id = null
--     from public.spaces s
--    where s.id = b.space_id
--      and lower(btrim(s.title)) = 'unfiled';
--
-- Reversing part 2 means restoring `provision_user` from 20260821100000, and
-- part 1 means restoring `boards_space_ownership` from 20260814110000.
--
-- A user can also reverse it for themselves at any time, with no migration at
-- all: deleting the space returns its boards to unfiled, which is the whole
-- point of `on delete set null`.
--
--
-- Verification -------------------------------------------------------------------
--
--   -- No board of an owner who has an Unfiled space is left unfiled:
--   select count(*) from public.boards b
--    where b.space_id is null
--      and exists (select 1 from public.spaces s
--                   where s.owner_id = b.owner_id
--                     and lower(btrim(s.title)) = 'unfiled');
--   -- expect: 0
--
--   -- Nobody has two:
--   select owner_id, count(*) from public.spaces
--    where lower(btrim(title)) = 'unfiled'
--    group by owner_id having count(*) > 1;
--   -- expect: no rows
--
--   -- Board count is unchanged (run before and after):
--   select count(*) from public.boards;
--
-- And the guard still bites for a real session. As user A, with B's board id
-- and one of A's own space ids:
--
--   update boards set space_id = '<A space>' where id = '<B board>';
--   -- expect: 42501, only a board's owner may file it into a space
