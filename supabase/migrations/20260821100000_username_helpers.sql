-- M10-01 · unique usernames, step 1 of 3: EXPAND. SAFE. Tier B.
--
-- Adds the two functions the rule needs and teaches `provision_user` to use the
-- name the person chose. **No constraint is added here** — the unique index and
-- the CHECK arrive in step 3, after step 2 has made every existing row satisfy
-- them. Adding them now would fail on whatever is already in the table, and a
-- migration that fails is a deploy that stops.
--
-- **Where the username comes from, and why it is not a new table.** Email
-- confirmation is required, so `signUp` returns *no session*: the client cannot
-- write to `profiles` at registration, because `auth.uid()` is null. The name
-- therefore travels the one channel that survives that gap —
-- `auth.users.raw_user_meta_data`, written by `signUp({ options: { data } })`
-- — and is read back here, at confirmation, by the trigger that already reads
-- `auth.users` for the address. No second table, no claim row, no pending
-- state to reconcile.
--
-- **`provision_user` must never fail, and that constrains the design.** M6-14
-- was exactly this lesson: both call sites swallow its errors, so a raise here
-- becomes an account with no board and no profile and no error message. The
-- name is therefore *resolved* rather than asserted — if the chosen one is
-- taken by the time confirmation lands, a numeric suffix is appended until it
-- is free. The client has already checked availability, so this is the race
-- path, not the common one, and getting `ada2` is a far better outcome than an
-- account that silently does not work.

-- ---------------------------------------------------------------------------
-- 1. The canonical form, in one place.
-- ---------------------------------------------------------------------------
-- Mirrors `src/utils/username.ts` exactly: trim, lowercase. Stored lowercased
-- so `username` and `lower(username)` are the same string and no comparison
-- anywhere has to remember to fold case.
create or replace function public.normalize_username(p_username text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(lower(coalesce(p_username, ''))), '');
$$;

-- Same pattern as the client's USERNAME_SHAPE: starts with a letter or digit,
-- then letters, digits or underscores, 3..30 total.
create or replace function public.is_valid_username(p_username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_username is not null
     and p_username ~ '^[a-z0-9][a-z0-9_]{2,29}$';
$$;

-- ---------------------------------------------------------------------------
-- 2. The availability check the registration form calls.
-- ---------------------------------------------------------------------------
-- **Granted to `anon`, and it has to be.** Registration happens signed out, so
-- an `authenticated`-only function could never be called by the one screen that
-- needs it.
--
-- **It returns a boolean and nothing else.** No id, no email, no row, no count
-- — so it cannot be used to read anything about whoever holds a name. It does
-- confirm that a given name is taken, which is inherent to any availability
-- check and is the same fact the sign-up form would reveal by failing.
--
-- SECURITY DEFINER because `profiles` is behind RLS and an anonymous caller can
-- select nothing from it. The function is the only thing that sees the row, and
-- all it does with it is count it.
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_valid_username(public.normalize_username(p_username))
     and not exists (
       select 1
         from public.profiles p
        where p.username = public.normalize_username(p_username)
     );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

comment on function public.username_available(text) is
  'True when the normalised username is well-formed and unclaimed. Returns a '
  'boolean only, and is callable by anon because registration is signed out.';

-- ---------------------------------------------------------------------------
-- 3. A free name near the one that was asked for.
-- ---------------------------------------------------------------------------
-- Used by provisioning and by the backfill in step 2, so both settle collisions
-- the same way. Truncates before suffixing so the result cannot exceed 30.
-- **`p_seed` is what makes the backfill deterministic**, and that is a
-- requirement rather than a nicety: a profile with no username *and* no email —
-- there are twenty of them, left by the M6-14 window when provisioning failed
-- after `handle_new_user` had already made the row — has nothing to derive a
-- name from. The first draft filled those from `random()` and
-- `clock_timestamp()`, which means re-running the backfill would invent
-- different names and two runs would disagree about who is who. Seeding from
-- the row's own id gives the same answer every time, forever.
create or replace function public.available_username(
  p_wanted text,
  p_seed   text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base   text;
  v_try    text;
  v_suffix integer := 1;
begin
  v_base := public.normalize_username(p_wanted);

  -- Strip anything the pattern forbids rather than give up: this runs for
  -- people who never chose a name (an email prefix with a dot in it), and a
  -- raise here would be the failure mode M6-14 taught us to avoid.
  v_base := regexp_replace(coalesce(v_base, ''), '[^a-z0-9_]', '_', 'g');
  v_base := regexp_replace(v_base, '^[^a-z0-9]+', '', 'g');

  -- 'u' prefix so the result always starts with a letter, whatever the hash
  -- begins with, and so a generated name is recognisable as one.
  if length(v_base) < 3 then
    v_base := v_base || 'u' || substr(md5(coalesce(nullif(p_seed, ''), v_base)), 1, 8);
    v_base := regexp_replace(v_base, '^[^a-z0-9]+', '', 'g');
  end if;

  v_base := left(v_base, 30);
  v_try  := v_base;

  while exists (select 1 from public.profiles p where p.username = v_try) loop
    v_suffix := v_suffix + 1;
    v_try := left(v_base, 30 - length(v_suffix::text)) || v_suffix::text;
  end loop;

  return v_try;
end;
$$;

revoke all on function public.available_username(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. provision_user uses the chosen name.
-- ---------------------------------------------------------------------------
-- Identical to 20260820120000 apart from the username. The board, the columns,
-- the idempotent early return and the profile upsert are untouched.
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

  insert into public.boards (owner_id, title)
  values (p_user_id, 'My Board')
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
