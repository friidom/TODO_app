-- M22 · Signing in with a username. SAFE. Tier B (function only, no data).
--
-- M10-01 gave every account a unique username and the registration form asks
-- for one, but the login form still accepts only an address — so the identifier
-- people are told to choose is the one identifier they cannot sign in with.
--
-- **GoTrue authenticates by email or phone and has no concept of a username**,
-- so signing in with one means resolving it to the address first. This is the
-- whole of that mechanism: one function, one lookup, one column returned.
--
--
-- WHY A FUNCTION AND NOT A SELECT
-- ---------------------------------------------------------------------------
--
-- `profiles` RLS is self-only. A signed-out visitor is `anon` and can select
-- nothing from it at all, which is correct and must stay that way — widening
-- that policy so the login form could read a row would expose every profile in
-- the product to the internet. SECURITY DEFINER is how a signed-out caller asks
-- one narrow question without the table being opened up.
--
-- `username_available` (20260821100000) is the precedent and this deliberately
-- copies its shape: definer, `search_path = ''`, revoked from public, granted
-- to anon because the screen that needs it is signed out.
--
--
-- WHAT THIS DISCLOSES, STATED PLAINLY
-- ---------------------------------------------------------------------------
--
-- **Anyone who knows a username can learn that account's email address.** That
-- is a real disclosure and it was an explicit product decision, not an
-- oversight. The alternative considered and rejected was a function taking the
-- password too and verifying the bcrypt hash before returning anything: it
-- leaks nothing, but it is an unauthenticated password-checking endpoint
-- sitting *outside* GoTrue's rate limiting, which trades a disclosure for a
-- brute-force oracle. Keeping authentication — and its throttling — entirely
-- inside GoTrue is worth the address.
--
-- What this does NOT do, and the restraint is the security property:
--
--   · returns one column, never a row — no id, no name, no avatar, nothing
--     that could turn a username into a profile
--   · takes an exact normalised username, never a prefix or a pattern, so it
--     cannot be walked to enumerate accounts
--   · is `stable`, so it can neither write nor be used as a side channel
--   · returns NULL for unknown, malformed and empty alike — the caller cannot
--     tell "no such user" from "that is not a username", and the client turns
--     all of them into the same "Invalid login credentials" the wrong-password
--     path produces
--
--
-- BLAST RADIUS
-- ---------------------------------------------------------------------------
--
-- Tier B. One new function. No table, column, policy, trigger or row is
-- touched, and nothing existing calls it. Signing in by email does not go
-- through here at all — the client only resolves when the identifier has no
-- `@` in it — so the existing login path is byte-for-byte unchanged.

create or replace function public.login_email_for(p_username text)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select p.email
    from public.profiles p
   where p.username = public.normalize_username(p_username)
   limit 1;
$$;

revoke all on function public.login_email_for(text) from public;
grant execute on function public.login_email_for(text) to anon, authenticated;

comment on function public.login_email_for(text) is
  'Resolves an exact normalised username to the address GoTrue authenticates '
  'with. Returns one column or NULL; never a row. Callable by anon because the '
  'login screen is signed out. See the migration header for what it discloses.';


-- Rollback ---------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, put the following in a NEW migration:
--
--   drop function if exists public.login_email_for(text);
--
-- Free to reverse at any time — nothing depends on it but the login form, which
-- falls back to address-only sign-in if the function is absent.
--
--
-- Verification -------------------------------------------------------------------
--
--   select public.login_email_for('ada');       -- expect: the address
--   select public.login_email_for('  ADA  ');   -- expect: the same address
--   select public.login_email_for('nope');      -- expect: NULL
--   select public.login_email_for('');          -- expect: NULL
--   select public.login_email_for(null);        -- expect: NULL
--
-- And the grant, from a signed-out client:
--
--   curl -s "$URL/rest/v1/rpc/login_email_for" -H "apikey: $ANON" \
--        -H 'Content-Type: application/json' -d '{"p_username":"ada"}'
--   -- expect: 200 with the address, or 200 with null
