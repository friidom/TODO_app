-- M2-12 · Provision a new user's board and columns atomically.
--
-- signUp() currently does three unrelated writes from the client with nothing
-- tying them together: upsert the profile, insert four columns, hope. A
-- failure between them leaves an account that exists but cannot be used, and
-- nothing repairs it — the user simply has a broken board forever.
--
-- The plan's recommendation is one RPC, and that is what this is. A plpgsql
-- function runs inside a single transaction, so either the whole account is
-- provisioned or none of it is.
--
-- Three defects in the old seed are fixed on the way past:
--
--   * the columns had no board_id, which is the entire point of M2
--   * the columns had no category, so `categoryOf()` fell back to 'todo' for
--     all four — a new user's "Done" column was not a done column, and the
--     green flash on drop never fired for them
--   * the profile write and the column write could each fail independently
--
--
-- SECURITY DEFINER, and deliberately so: this inserts a board and columns for
-- a user who does not own anything yet, which the policies would otherwise
-- refuse. That makes the identity check the load-bearing part of the function,
-- so the user is taken from auth.uid() and never from an argument. There is no
-- parameter a caller could use to provision for somebody else.
--
-- `set search_path = ''` for the usual reason — a SECURITY DEFINER function
-- that resolves an unqualified name through the caller's search_path can be
-- pointed at a table the caller controls. Everything below is qualified.

create or replace function public.provision_new_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := (select auth.uid());
  v_email    text;
  v_board_id uuid;
begin
  if v_user_id is null then
    raise exception 'provision_new_user requires an authenticated session';
  end if;

  -- Idempotent by design. signUp can be retried — a dropped connection after
  -- the account exists is the ordinary case — and a retry must not mint a
  -- second board. Returning the existing one also means this repairs an
  -- account that was half-provisioned by the old client-side sequence.
  select b.id into v_board_id
  from public.boards b
  where b.owner_id = v_user_id
  order by b.created_at, b.id
  limit 1;

  if v_board_id is not null then
    return v_board_id;
  end if;

  -- Read from auth.users rather than accepting the address as an argument, so
  -- the profile cannot be seeded with an email the caller does not own.
  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;

  -- handle_new_user() already inserted the id on signup; this fills in the
  -- rest. An existing username is preserved: this function is idempotent, and
  -- a repeat call must not overwrite a name the user chose.
  insert into public.profiles as p (id, email, username)
  values (v_user_id, v_email, split_part(v_email, '@', 1))
  on conflict (id) do update
    set email    = excluded.email,
        username = coalesce(p.username, excluded.username);

  insert into public.boards (owner_id, title)
  values (v_user_id, 'My Board')
  returning id into v_board_id;

  -- user_id is still set: it remains the ownership column, and the live
  -- policies still filter on it, until M2-13 drops it.
  --
  -- Categories match src/constants/columns.ts. "In Review" is in_progress
  -- rather than a category of its own — the set is fixed at three, which is
  -- why columns.category is a checked text field and not a lookup table.
  insert into public.columns (board_id, user_id, title, position, category)
  values
    (v_board_id, v_user_id, 'To Do',       0, 'todo'),
    (v_board_id, v_user_id, 'In Progress', 1, 'in_progress'),
    (v_board_id, v_user_id, 'In Review',   2, 'in_progress'),
    (v_board_id, v_user_id, 'Done',        3, 'done');

  return v_board_id;
end;
$$;

comment on function public.provision_new_user() is
  'Creates the caller''s board and its four default columns in one '
  'transaction. Idempotent: returns the existing board if there is one.';


-- Grants ---------------------------------------------------------------------
--
-- The revoke matters more than the grant. A function is EXECUTE-able by PUBLIC
-- by default, and this one is SECURITY DEFINER — leaving it open would let the
-- anon role invoke it. It would fail on the auth.uid() check, but a
-- privilege-escalating function should not be reachable by a role with no
-- business calling it in the first place.

revoke all on function public.provision_new_user() from public, anon;
grant execute on function public.provision_new_user() to authenticated;


-- Why not a trigger on auth.users --------------------------------------------
--
-- The plan offers it as the alternative, and it has a real advantage: it
-- cannot be skipped by a client that crashes between signUp and the RPC, and
-- it works even if email confirmation is later turned on, when signUp returns
-- no session and auth.uid() is null.
--
-- Rejected for now because a failure inside it fails the signup itself —
-- provisioning a board becomes load-bearing for creating an account, and a
-- constraint violation in the seed would lock new users out entirely rather
-- than leaving them with a repairable board. The RPC's failure mode is a
-- retry; the trigger's is an outage.
--
-- Revisit if `enable_confirmations` is ever turned on: at that point signUp
-- has no session, this function cannot run at signup, and the trigger stops
-- being optional.


-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, put the following in a NEW migration:
--
--   drop function if exists public.provision_new_user();
--
-- Reverting also means restoring the client-side seed in authApi.ts, which is
-- the half-provisioning this replaced.
