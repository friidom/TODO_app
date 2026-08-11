-- M3-13 · Board roster via SECURITY DEFINER RPC. MEDIUM RISK. Tier A.
--
-- Establishes: membership on a board is what grants visibility of that
-- board's roster, and nothing else does.
--
-- Until now a member could see the board, its columns and its work items, but
-- not who else was on it. `board_members` is self-read only (M3-01) and
-- `profiles` carries a single self-only policy from the M0-05 baseline. A
-- member list built today would return one row — yourself — with no teammate
-- names or avatars.
--
--
-- ⚠ WHY AN RPC AND NOT A POLICY — the decision this migration records.
--
-- The obvious fix is a co-member SELECT policy on `profiles`. It is wrong,
-- and the reason is worth stating because it is not obvious:
--
--     PostgreSQL RLS filters ROWS, not COLUMNS.
--
-- A policy answers "may you see this row?" and has no opinion about which
-- columns of it you get. `profiles` carries `email` and `bio`. Any policy that
-- lets a co-member read the row hands them both, whatever the client asks
-- for — and `fetchProfile` already issues `select("*")`.
--
-- A function is the only place the database can state which columns leave it.
-- The `returns table (...)` list below IS the exposure boundary: six fields,
-- chosen deliberately, and no client-side `select` shaping can widen it.
--
-- The alternative considered and rejected: column-level GRANTs. Those are
-- per-role, not per-row, so narrowing `authenticated` to four columns would
-- also stop a user reading their own email on their own profile page.
--
--
-- SCOPE
--
--   · One new function, public.board_roster(uuid).
--   · Function grants: anon out, authenticated and service_role in.
--   · board_members table privileges narrowed (see section 4).
--
-- NOT in scope, deliberately:
--
--   · `profiles` RLS — UNCHANGED. Still self-only. A direct read of a
--     teammate's profile row still returns [] after this migration.
--   · `board_members` policies — UNCHANGED. M3-01's self-read policy stays;
--     it is what M3-09's usePermissions reads to learn the caller's own role.
--   · Membership mutations. Adding, removing and re-roling members are
--     SECURITY DEFINER RPCs and they belong to M3-14, with their own
--     authorization matrix and Owner-immutability rules.
--
--
-- TIER A (plan Rule 6): creates one function and adjusts privileges. Writes no
-- row. Reversal is the forward-fix SQL at the foot of this file, not a
-- restore. No dump, no rehearsal, no PITR required.
--
--
-- PRECONDITIONS
--
--   1. M3-01 applied — board_members exists with its self-read policy.
--   2. M3-02 applied — public.is_board_member(uuid) exists with EXECUTE
--      granted to `authenticated`. This migration's guard depends on it.
--   3. M3-03 applied — every board has an owner membership row, so a board's
--      roster is never empty for its owner.


-- 1. Captured pre-change state -------------------------------------------------
--
-- Verbatim, so reversal is copy-paste rather than reconstruction.
--
--   public.board_members — RLS enabled, one policy:
--
--     create policy "Users select own memberships" on public.board_members
--       for select to authenticated
--       using (user_id = (select auth.uid()));
--
--     Table privileges, captured from production on 2026-08-11 with
--
--       select relacl from pg_class
--       where oid = 'public.board_members'::regclass;
--
--     Literal result, recorded verbatim rather than inferred from the
--     baseline's ALTER DEFAULT PRIVILEGES:
--
--       {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--
--     `arwdDxtm` is the full set: a=INSERT, r=SELECT, w=UPDATE, d=DELETE,
--     D=TRUNCATE, x=REFERENCES, t=TRIGGER, m=MAINTAIN (added in PG17). So
--     `anon` and `authenticated` each held every privilege on this table,
--     including TRUNCATE, which RLS does not filter. Not reachable through
--     PostgREST, which issues only SELECT/INSERT/UPDATE/DELETE — but the
--     grant was real, and section 4 is what removes it.
--
--     This capture is what makes the rollback's `grant all` accurate rather
--     than a guess.
--
--   public.profiles — RLS enabled, one policy, from the M0-05 baseline:
--
--     CREATE POLICY "Users can manage own profile" ON "public"."profiles"
--       USING (("auth"."uid"() = "id"))
--       WITH CHECK (("auth"."uid"() = "id"));
--
--     No FOR clause, so it is FOR ALL. No TO clause, so it applies to PUBLIC.
--     UNCHANGED by this migration.
--
--   public.board_roster(uuid) — does not exist.


-- 2. The roster function --------------------------------------------------------
--
-- plpgsql rather than sql, so the two guards are separate, ordered and
-- auditable. A reviewer can see the authorization decision without reading
-- the join. The existing helpers are `language sql` because they are single
-- expressions; this one is not.
--
-- SECURITY DEFINER because the join must read `profiles` rows the caller
-- cannot read for themselves. That is the entire point: definer rights are
-- what let the database expose four columns of a teammate's profile without
-- exposing the row.
--
-- STABLE — reads only, no writes, so the planner may reuse it within a
-- statement.
--
-- `set search_path = ''` with every reference schema-qualified, so the body
-- cannot be redirected by a caller's search_path. The standard hardening for a
-- SECURITY DEFINER function, and the same setting the M3-02 helpers use.
--
-- `auth.uid()` needs no extra qualification: `auth` is the schema and `uid`
-- the function, so it is already fully qualified and resolves under an empty
-- search_path. This is why the M3-02 helpers work with the same setting.
--
-- A plpgsql footgun worth naming: `returns table (id ..., role ...)` creates
-- OUT parameters with those names, and inside the body they SHADOW unqualified
-- column references. Every column below is qualified `p.` or `m.` for exactly
-- that reason — it is deliberate, not stylistic.
--
-- Reuses is_board_member() rather than re-implementing the membership test.
-- No recursion is possible: is_board_member is itself SECURITY DEFINER, so its
-- read of board_members bypasses RLS and never re-enters policy evaluation.
-- The recursion trap this codebase warns about is a POLICY on board_members
-- that sub-selects board_members; this is a function, not a policy, so that
-- shape does not arise.
--
-- board_role() is deliberately NOT used. The question here is "are you a
-- member", not "which role are you". The roster is visible to every role
-- including viewer, and reaching for the role-returning helper would invite a
-- later edit that gates the roster by role, which is not the requirement.

create or replace function public.board_roster(p_board_id uuid)
returns table (
  id         uuid,
  username   text,
  full_name  text,
  avatar_url text,
  role       text,
  joined_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Guard 1 — authenticated session.
  --
  -- Raises rather than returning empty. An unauthenticated call is a client
  -- bug, not a permission outcome, and it should be loud. Matches the
  -- precedent set by provision_new_user(). anon cannot reach this line anyway
  -- (section 3 revokes EXECUTE), so this is the second layer.
  if (select auth.uid()) is null then
    raise exception 'board_roster requires an authenticated session'
      using errcode = '28000';
  end if;

  -- Guard 2 — the caller is a member of THIS board.
  --
  -- Returns an empty set rather than raising, which matches RLS semantics: a
  -- denied read is [], not an error.
  --
  -- It is also what stops this function being an existence oracle. A
  -- non-member passing a real board id and a non-member passing a fabricated
  -- one receive byte-identical responses, so the RPC cannot be used to
  -- discover which boards exist. A distinct "you are not a member" error
  -- would leak precisely that.
  --
  -- The client-supplied p_board_id is never trusted as evidence of anything.
  -- It is an argument to this check and a filter below — nothing more.
  if not public.is_board_member(p_board_id) then
    return;
  end if;

  -- The six exposed fields. `email` and `bio` exist on public.profiles and are
  -- deliberately absent. Changing this list changes what one member can learn
  -- about another, which is a product decision, not a refactor.
  return query
    select
      p.id,
      p.username,
      p.full_name,
      p.avatar_url,
      m.role,
      m.joined_at
    from public.board_members m
    join public.profiles p on p.id = m.user_id
    where m.board_id = p_board_id
    order by m.joined_at, p.id;
end;
$$;

comment on function public.board_roster(uuid) is
  'Members of one board, for a caller who is a member of it. SECURITY '
  'DEFINER so the join reads profiles without widening profiles RLS — the '
  'returned column list is the exposure boundary, and email and bio are '
  'deliberately not in it. Non-members get an empty set, not an error.';


-- 3. Function grants -------------------------------------------------------------
--
-- A function is granted EXECUTE to PUBLIC by default, so the revoke is the
-- part that does the work. Same shape as the M3-02 helpers.
--
-- anon reaching this would hit guard 1 and raise, but a SECURITY DEFINER
-- function should not be callable by a role that has no business calling it.

revoke all on function public.board_roster(uuid) from public, anon;
grant execute on function public.board_roster(uuid) to authenticated;
grant execute on function public.board_roster(uuid) to service_role;


-- 4. board_members table privileges ----------------------------------------------
--
-- board_members was created without explicit grants, so it inherited
-- GRANT ALL to anon and authenticated from the baseline's default privileges.
-- This narrows both.
--
-- anon — revoked outright. Not currently reachable: RLS is enabled and the
-- only policy is TO authenticated, so anon's null auth.uid() matches nothing.
-- The revoke is privilege hygiene, not a fix for a live exposure.
--
-- CORRECTION, from independent review: an earlier draft of this comment said
-- board_members was the ONLY table still carrying the baseline anon grant.
-- That is false. The complete set of table revokes in this repository is
-- todos, columns and todos_id_seq (M0-07), boards (M2-01), and board_members
-- (here). public.profiles has RLS enabled (baseline:172) AND still carries
-- `GRANT ALL ON TABLE public.profiles TO anon` (baseline:367), revoked by no
-- migration. profiles is therefore a SECOND exception, not a non-exception.
--
-- profiles is deliberately not touched here. It is outside M3-13's scope, and
-- narrowing privileges on the table the signup path writes to carries its own
-- blast radius — the reason M0-07 deferred it originally. Tracked as PH-08 in
-- Part V of the implementation plan. As with board_members, RLS already stops
-- anon reading any row, so it is excessive privilege rather than an exposure.
--
-- authenticated — narrowed to SELECT only, and this is the substantive change.
-- Until now, client INSERT/UPDATE/DELETE on board_members was blocked solely
-- by the ABSENCE of policies. That is one mistake deep: add a permissive
-- policy by accident and the grant is already sitting there waiting. With the
-- write privileges gone it takes two independent mistakes to make
-- board_members client-writable.
--
-- SELECT is retained because M3-01's "Users select own memberships" policy
-- needs it, and M3-09's usePermissions reads the caller's own row through it.
--
-- Written as revoke-all-then-grant-back rather than enumerating INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. Postgres 17 added
-- MAINTAIN to ALL, and an enumeration silently misses whatever is added next.
--
-- CORRECTION, from independent review: this is NOT the shape M2-01 used, and
-- the difference matters. 20260806090000_create_boards.sql:90-93 revokes from
-- `anon` only, then ADDS `grant select, insert, update, delete to
-- authenticated` on top of the GRANT ALL already inherited from the baseline
-- default privileges. It never revokes from `authenticated`. M0-07 did the
-- same for todos and columns: `anon` only.
--
-- So `authenticated` still holds TRUNCATE, REFERENCES and TRIGGER on
-- public.boards, public.todos, public.columns and public.profiles. TRUNCATE
-- is not filtered by RLS. It is not reachable today because PostgREST issues
-- only SELECT/INSERT/UPDATE/DELETE, so this is latent rather than
-- exploitable — but it is real, it is out of scope here, and it needs its own
-- follow-up task.
--
-- This migration is the FIRST to use revoke-all-then-grant-back. It sets the
-- precedent rather than following one.
--
-- Membership mutations are unaffected: M3-14's RPCs will be SECURITY DEFINER
-- and run as the function owner, and M3-03's add_owner_membership() trigger
-- already is. Neither consults the caller's table privileges.
--
-- service_role is deliberately not named in any revoke. It keeps its
-- inherited ALL and its BYPASSRLS attribute, and remains the administrative
-- path.

revoke all on table public.board_members from anon;

revoke all on table public.board_members from authenticated;
grant select on table public.board_members to authenticated;


-- Rollback -------------------------------------------------------------------------
--
-- Forward-only, per the migration strategy. To reverse, put the following in a
-- NEW migration:
--
--   drop function if exists public.board_roster(uuid);
--
--   grant all on table public.board_members to anon;
--   grant all on table public.board_members to authenticated;
--
-- No row is written by this migration, so there is nothing to restore — this
-- is what Tier A means.
--
-- Note the two grants restore a weakness rather than a capability: nothing
-- used them. Include them only if exact prior-state reversal is wanted;
-- dropping the function alone is the honest revert.


-- Verification -------------------------------------------------------------------
--
-- NOT YET RUN. This migration is unapplied at the time of writing.
--
-- REST-level, with a real JWT per role. The UI cannot substitute: it never
-- asks for rows it does not expect, so it cannot demonstrate a denial.
--
-- Fixture: board 5819a045-0bca-4a8a-9dc1-a67f7911b854,
--          owner qwerty@gmail.com, viewer qqq@gmail.com.
--
--
-- THE ROSTER ITSELF
--
--   curl -X POST "$URL/rest/v1/rpc/board_roster" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $OWNER_JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"p_board_id":"5819a045-0bca-4a8a-9dc1-a67f7911b854"}'
--   -- expect 2 rows (owner + viewer), each carrying exactly
--   --   id, username, full_name, avatar_url, role, joined_at
--   -- and NO email, NO bio. Check the payload keys, not just the values.
--
--   same call as $VIEWER_JWT      -- expect the identical 2 rows: a viewer
--                                 -- may see who else is on the board
--
--   same call as $NONMEMBER_JWT   -- expect []
--
--   same call as $NONMEMBER_JWT with a fabricated uuid
--                                 -- expect [] — byte-identical to the line
--                                 -- above. If these two differ, the function
--                                 -- is an existence oracle and this migration
--                                 -- has failed its main non-obvious goal.
--
--   same call with no Authorization header
--                                 -- expect 42501 permission denied for
--                                 -- function board_roster — NOT [], and not
--                                 -- the 28000 from guard 1. anon is stopped
--                                 -- by the grant before the body runs.
--
--
-- PROFILES WAS NOT WIDENED — the point of choosing an RPC
--
--   curl "$URL/rest/v1/profiles?id=eq.<owner uuid>&select=*" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $VIEWER_JWT"
--   -- expect [] — the viewer can see the owner in the roster but still
--   -- cannot read their profile row directly, and therefore never their
--   -- email or bio.
--
--
-- BOARD_MEMBERS PRIVILEGES
--
--   curl "$URL/rest/v1/board_members?board_id=eq.<board>&select=*" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $VIEWER_JWT"
--   -- expect exactly ONE row, the caller's own. SELECT still works, which
--   -- M3-09 depends on.
--
--   curl -X POST "$URL/rest/v1/board_members" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $VIEWER_JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"board_id":"<board>","user_id":"<uuid>","role":"admin"}'
--   -- expect 42501 permission denied for table board_members.
--   -- Before this migration the same call failed as an RLS denial; now the
--   -- privilege is gone as well. Two layers, independently sufficient.
--
--
-- REGRESSION
--
--   Sign in as the owner: the board still loads with 5 columns and 21 work
--   items, and drag still persists across a reload. Nothing in this migration
--   touches those paths, but the board_members revoke is the kind of change
--   that would surface here if it were wrong.
