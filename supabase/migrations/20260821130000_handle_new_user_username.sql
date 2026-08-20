-- M10-01 · handle_new_user must supply a username. BREAKING FIX. Tier A.
--
-- **Without this, no account can be created at all.**
-- `20260821120000_username_rules.sql` made `profiles.username` NOT NULL, and
-- `handle_new_user()` — the `AFTER INSERT` trigger on `auth.users`, untouched
-- since the M0 baseline apart from its search_path — inserts `profiles (id)`
-- and nothing else. So the trigger now raises 23502, the insert into
-- `auth.users` rolls back with it, and signup returns
-- `500 null value in column "username" violates not-null constraint`.
--
-- Caught by the M10-01 live suite, which could not create its own test
-- accounts. Every path that makes a user goes through this trigger — the
-- registration form, the admin API, an invite accepted by a new person — so
-- there is no route that was still working.
--
-- **The username is now claimed at signup rather than at confirmation, and
-- that is a deliberate improvement.** The name is in `raw_user_meta_data` from
-- the moment `signUp` runs, so there is no reason to wait: claiming it here
-- shrinks the race window from "however long someone takes to open their
-- email" to "the length of one insert". `provision_user` already upserts with
-- `username = coalesce(p.username, excluded.username)`, so it keeps whatever
-- this set and the two do not fight.
--
-- The trade-off, recorded rather than hidden: an account that never confirms
-- still holds its name. That is what almost every product does, and the
-- alternative — a name that is only yours once you click a link — means the
-- form can tell you a name is free and then take it away.
--
-- Same never-fail discipline as `provision_user`: `available_username` repairs
-- and de-duplicates rather than raising, because a raise here does not produce
-- a bad username, it produces no account.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, username)
  values (
    new.id,
    new.email,
    public.available_username(
      coalesce(
        public.normalize_username(new.raw_user_meta_data ->> 'username'),
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      new.id::text
    )
  )
  -- The profile may already exist if this ever runs twice for one user. Doing
  -- nothing is right: a second run must not rename somebody.
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile row when auth.users gains one, with a unique username '
  'taken from raw_user_meta_data.username (the registration form) or derived '
  'from the address. Must never raise: it runs inside the auth.users insert.';
