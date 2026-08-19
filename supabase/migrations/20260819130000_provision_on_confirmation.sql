-- Provisioning moves to a trigger, because email confirmation is now required.
--
-- `20260806094000_provision_new_user.sql` closes with the condition that brings
-- this migration into existence:
--
--   "Revisit if `enable_confirmations` is ever turned on: at that point signUp
--    has no session, this function cannot run at signup, and the trigger stops
--    being optional."
--
-- That is now true. `config.toml` sets `enable_confirmations = true`, so
-- `supabase.auth.signUp()` returns a user and **no session**; `auth.uid()` is
-- null and `provision_new_user()` cannot run from the client at signup.
--
-- **The objection that migration recorded is answered rather than ignored.** It
-- rejected a trigger because "a failure inside it fails the signup itself …
-- the trigger's failure mode is an outage". Two things make that untrue here:
--
--   1. It fires on **confirmation**, not on insert. The account already exists
--      by then, so a failure cannot prevent one being created.
--   2. It **swallows its own errors**. A seed that violates a constraint leaves
--      an unprovisioned-but-confirmed account, which `provision_new_user()`
--      still repairs on demand — exactly the "retry" failure mode the original
--      preferred, rather than a lockout.
--
-- Nothing about the existing function's contract changes: it keeps its name,
-- its signature, its grant and its idempotency, so the client call still works
-- and still repairs.

-- ---------------------------------------------------------------------------
-- 1. The body, parameterised.
-- ---------------------------------------------------------------------------
-- Split out so the same code serves both callers. The trigger has no session
-- and must name the user; the RPC has a session and must not be allowed to.
create or replace function public.provision_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email    text;
  v_board_id uuid;
begin
  if p_user_id is null then
    raise exception 'provision_user requires a user id';
  end if;

  -- Idempotent, and that is load-bearing now that two callers exist: the
  -- trigger runs at confirmation and the RPC may run again at any sign-in.
  -- Whichever gets there first wins and the other returns the same board.
  select b.id into v_board_id
    from public.boards b
   where b.owner_id = p_user_id
   order by b.created_at, b.id
   limit 1;

  if v_board_id is not null then
    return v_board_id;
  end if;

  select u.email into v_email
    from auth.users u
   where u.id = p_user_id;

  insert into public.profiles as p (id, email, username)
  values (p_user_id, v_email, split_part(v_email, '@', 1))
  on conflict (id) do update
    set email    = excluded.email,
        username = coalesce(p.username, excluded.username);

  insert into public.boards (owner_id, title)
  values (p_user_id, 'My Board')
  returning id into v_board_id;

  insert into public.columns (board_id, user_id, title, position, category)
  values
    (v_board_id, p_user_id, 'To Do',       0, 'todo'),
    (v_board_id, p_user_id, 'In Progress', 1, 'in_progress'),
    (v_board_id, p_user_id, 'In Review',   2, 'in_progress'),
    (v_board_id, p_user_id, 'Done',        3, 'done');

  return v_board_id;
end;
$$;

-- Not callable by clients. It names its user, so exposing it would let anyone
-- provision for anybody — which is precisely what `auth.uid()` prevents in the
-- wrapper below.
revoke all on function public.provision_user(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The RPC keeps its exact contract and becomes a thin wrapper.
-- ---------------------------------------------------------------------------
-- Still the repair path: a confirmed account whose trigger failed is fixed by
-- calling this, and the client does so after every successful sign-in.
create or replace function public.provision_new_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'provision_new_user requires an authenticated session';
  end if;

  return public.provision_user(v_user_id);
end;
$$;

grant execute on function public.provision_new_user() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Provision when the address is confirmed.
-- ---------------------------------------------------------------------------
-- AFTER UPDATE, not AFTER INSERT: the row is inserted unconfirmed and the
-- confirmation is an update of `email_confirmed_at`. Guarded on the transition
-- (null -> not null) rather than on the value, so ordinary updates to
-- auth.users — a password change, a metadata write, a token refresh — do not
-- re-enter this.
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.provision_user(new.id);
  exception
    when others then
      -- Deliberately swallowed. This is the whole answer to the original
      -- migration's objection: provisioning must not be load-bearing for
      -- confirming an account. The user gets in; `provision_new_user()`
      -- repairs the board on their next sign-in.
      raise warning 'provision_user failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.handle_user_confirmed() from public, anon, authenticated;

drop trigger if exists on_auth_user_confirmed on auth.users;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- Existing confirmed users are untouched: they already have boards, so even if
-- this trigger somehow fired for them, provision_user returns the board it
-- finds and writes nothing.

-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, in a NEW migration:
--
--   drop trigger if exists on_auth_user_confirmed on auth.users;
--   drop function if exists public.handle_user_confirmed();
--   -- and restore provision_new_user's inlined body from
--   -- 20260806094000_provision_new_user.sql, then drop provision_user.
--
-- Reversing also means setting `enable_confirmations = false` in config.toml
-- and running `supabase config push` — the trigger without the setting is
-- harmless, but the setting without the trigger leaves new accounts boardless.
