-- M4-08 · Email invitations, stage 1: registered users only.
--
-- Adds no columns. `board_invites.email` has existed since M4-01 and has been
-- null on every row; this is the migration that starts writing it. Stage 2
-- (arbitrary addresses + a transactional provider) needs no schema change
-- either — it relaxes one check in create_invite and adds a claim step at
-- signup, which is why that check is written as its own numbered step below.
--
-- Three things:
--   1. search_board_invitees — the autocomplete's only data source.
--   2. create_invite gains p_email, defaulted so link invites are unchanged.
--   3. my_pending_invites   — how the invitee sees what was sent to them,
--                             since nothing is emailed yet.

-- ---------------------------------------------------------------------------
-- 1. Who can be invited to this board.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because `profiles` is not readable across accounts, and it
-- must not become so: this is a deliberate, narrow hole punched for one screen.
-- What escapes it is bounded three ways — the caller must already be an
-- admin/owner of the board, the query must be at least two characters (so it
-- cannot be walked with an empty string), and at most eight rows come back.
--
-- The columns are the minimum the invite UI renders and nothing else. `bio`,
-- `created_at` and every future profile column stay behind the boundary.
create or replace function public.search_board_invitees(
  p_board_id uuid,
  p_query    text
)
returns table (
  id         uuid,
  email      text,
  full_name  text,
  username   text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_needle text;
begin
  v_actor := (select auth.uid());

  if v_actor is null then
    raise exception 'search_board_invitees requires an authenticated session'
      using errcode = '28000';
  end if;

  -- Same gate as create_invite's step 5. Someone who cannot invite has no
  -- business enumerating people, and answering them would make this a
  -- directory lookup for any member of any board.
  if public.board_role_rank(public.board_role(p_board_id))
     < public.board_role_rank('admin') then
    raise exception 'only an admin or the owner may invite people'
      using errcode = '42501';
  end if;

  v_needle := btrim(coalesce(p_query, ''));

  -- Below two characters this would return "some of everybody". An empty
  -- result is the honest answer to a query that has not been typed yet.
  if length(v_needle) < 2 then
    return;
  end if;

  return query
  select p.id, p.email, p.full_name, p.username, p.avatar_url
    from public.profiles p
   where p.id <> v_actor                                   -- never yourself
     and (
          p.email     ilike '%' || v_needle || '%'
       or p.full_name ilike '%' || v_needle || '%'
       or p.username  ilike '%' || v_needle || '%'
     )
     -- Already on the board: inviting them is a no-op, so they are not offered.
     and not exists (
       select 1 from public.board_members m
        where m.board_id = p_board_id and m.user_id = p.id
     )
     -- Already invited and the invite is still live. Revoke or let it lapse
     -- first; two pending invites for one person is not a state worth having.
     and not exists (
       select 1 from public.board_invites i
        where i.board_id = p_board_id
          and lower(i.email) = lower(p.email)
          and i.accepted_at is null
          and i.expires_at > now()
     )
   -- An exact address first: someone who typed the whole thing means it.
   order by (lower(p.email) = lower(v_needle)) desc, p.email
   limit 8;
end;
$$;

comment on function public.search_board_invitees(uuid, text) is
  'Registered profiles that may still be invited to this board. Admin/owner '
  'only, minimum two characters, at most eight rows, five columns.';

revoke all on function public.search_board_invitees(uuid, text) from public;
grant execute on function public.search_board_invitees(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_invite, now able to address an invite to someone.
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than overloaded: a second three-argument
-- signature alongside a four-argument one makes every PostgREST call ambiguous.
-- `p_email default null` keeps the existing three-argument call working
-- untouched, which is what protects the link flow.
drop function if exists public.create_invite(uuid, text, integer);

create or replace function public.create_invite(
  p_board_id        uuid,
  p_role            text,
  p_expires_in_days integer default 7,
  p_email           text default null
)
returns table (id uuid, token text, role text, expires_at timestamptz, email text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid;
  v_actor_rank integer;
  v_new_rank   integer;
  v_days       integer;
  v_token      text;
  v_expires_at timestamptz;
  v_id         uuid;
  v_email      text;
  v_invitee    uuid;
begin
  -- 1. Authenticated.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'create_invite requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. Actor is a member of this board.
  v_actor_rank := public.board_role_rank(public.board_role(p_board_id));
  if v_actor_rank is null then
    raise exception 'not a member of this board'
      using errcode = '42501';
  end if;

  -- 3. The requested role is real.
  v_new_rank := public.board_role_rank(p_role);
  if v_new_rank is null then
    raise exception 'unrecognised role: %', p_role
      using errcode = '22023';
  end if;

  -- 4. Ownership is not grantable by invitation (I6).
  if p_role = 'owner' then
    raise exception 'ownership cannot be granted by invitation'
      using errcode = '42501';
  end if;

  -- 5. Only admins and owners invite.
  if v_actor_rank < public.board_role_rank('admin') then
    raise exception 'only an admin or the owner may invite people'
      using errcode = '42501';
  end if;

  -- 6. Strictly below your own rank.
  if v_actor_rank <= v_new_rank then
    raise exception 'cannot invite someone at or above your own role'
      using errcode = '42501';
  end if;

  -- 7. The addressee, when there is one. Everything from here to the insert is
  --    skipped for a link invite, which is why that path cannot have regressed.
  v_email := nullif(btrim(lower(coalesce(p_email, ''))), '');

  if v_email is not null then
    -- 7a. STAGE 1 ONLY. Stage 2 deletes this block and lets v_invitee stay
    --     null: the row is already shaped for an address with no account
    --     behind it, and claiming it at signup is that stage's work.
    select p.id into v_invitee
      from public.profiles p
     where lower(p.email) = v_email
     limit 1;

    if v_invitee is null then
      raise exception 'no registered user with that email'
        using errcode = 'P0002';
    end if;

    -- 7b. Inviting yourself.
    if v_invitee = v_actor then
      raise exception 'you cannot invite yourself'
        using errcode = '22023';
    end if;

    -- 7c. Already on the board. Changing someone's role is set_member_role's
    --     job, not a second invitation's.
    if exists (
      select 1 from public.board_members m
       where m.board_id = p_board_id and m.user_id = v_invitee
    ) then
      raise exception 'that person is already a member of this board'
        using errcode = '23505';
    end if;

    -- 7d. Already has a live invitation.
    if exists (
      select 1 from public.board_invites i
       where i.board_id = p_board_id
         and lower(i.email) = v_email
         and i.accepted_at is null
         and i.expires_at > now()
    ) then
      raise exception 'that person already has a pending invitation'
        using errcode = '23505';
    end if;
  end if;

  -- 8. Expiry, clamped.
  v_days       := least(greatest(coalesce(p_expires_in_days, 7), 1), 30);
  v_expires_at := now() + (v_days * interval '1 day');

  -- 9. The token is minted here, never in the client.
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.board_invites as bi
    (board_id, token, role, expires_at, created_by, email)
  values
    (p_board_id, v_token, p_role, v_expires_at, v_actor, v_email)
  returning bi.id into v_id;

  return query select v_id, v_token, p_role, v_expires_at, v_email;
end;
$$;

comment on function public.create_invite(uuid, text, integer, text) is
  'Mints an invitation. With p_email it is addressed to a registered user '
  '(stage 1); without, it is the link invite M4-02 shipped.';

revoke all on function public.create_invite(uuid, text, integer, text) from public;
grant execute on function public.create_invite(uuid, text, integer, text) to authenticated;
grant execute on function public.create_invite(uuid, text, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. What has been sent to me.
-- ---------------------------------------------------------------------------
-- Nothing is emailed yet, so without this an addressed invite would be
-- invisible to the one person it concerns. An RPC rather than a SELECT policy
-- on board_invites: the row carries a token, and a policy wide enough to show
-- someone their own invite would expose that token to a `select *` over the
-- table. Here the token leaves only alongside the board it opens, to the
-- address it was sent to.
--
-- Joining boards for the title is why this is SECURITY DEFINER — the invitee
-- is not a member yet, so accessible_board_ids() does not include the board.
create or replace function public.my_pending_invites()
returns table (
  id          uuid,
  token       text,
  role        text,
  expires_at  timestamptz,
  board_id    uuid,
  board_title text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  if (select auth.uid()) is null then
    raise exception 'my_pending_invites requires an authenticated session'
      using errcode = '28000';
  end if;

  -- The caller's address is read from their own profile rather than taken as
  -- an argument. An argument would let anyone list invitations sent to anyone.
  select lower(p.email) into v_email
    from public.profiles p
   where p.id = (select auth.uid());

  if v_email is null then
    return;
  end if;

  return query
  select i.id, i.token, i.role, i.expires_at, i.board_id, b.title
    from public.board_invites i
    join public.boards b on b.id = i.board_id
   where lower(i.email) = v_email
     and i.accepted_at is null
     and i.expires_at > now()
     -- Already joined by some other route: the invite is moot, not pending.
     and not exists (
       select 1 from public.board_members m
        where m.board_id = i.board_id and m.user_id = (select auth.uid())
     )
   order by i.created_at desc;
end;
$$;

comment on function public.my_pending_invites() is
  'Live invitations addressed to the caller''s own email address.';

revoke all on function public.my_pending_invites() from public;
grant execute on function public.my_pending_invites() to authenticated;
