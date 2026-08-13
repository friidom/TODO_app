-- M4-02 · create_invite RPC. MEDIUM RISK. Tier A.
--
-- Mints an invitation. The privilege question it answers is not "may you
-- invite?" but "may you invite AT THIS ROLE?", and the two have different
-- answers for an admin.
--
--   owner  may invite  viewer, editor, admin
--   admin  may invite  viewer, editor            ← NOT admin
--   editor may invite  nothing
--   viewer may invite  nothing
--   nobody may invite  owner
--
-- That is the same rule M3-14 states as: AN ACTOR MAY ONLY ACT ON A MEMBER
-- STRICTLY BELOW THEIR OWN RANK. It is not restated here as a list of role
-- names — section 3 reuses public.board_role_rank(), so the admin-versus-owner
-- boundary has one definition in the schema and this function inherits it. A
-- second copy of the hierarchy is how the two drift apart, and an invite that
-- bypasses the membership matrix is a second, weaker permission system.
--
-- The two denials a naive "caller is admin or owner" check would let through,
-- both of which the verification script exercises explicitly:
--
--   · an admin requesting role = 'admin'   → denied by the rank comparison
--   · anyone requesting role = 'owner'     → denied outright, before it
--
--
-- TIER A: creates one function, writes no row. Reversal is the forward-fix SQL
-- at the foot of this file. No dump, no rehearsal.
--
--
-- PRECONDITIONS
--
--   1. M4-01 — public.board_invites exists.
--   2. M3-02 — public.board_role(uuid).
--   3. M3-14 — public.board_role_rank(text).
--   4. pgcrypto installed in schema `extensions` (baseline schema, line 27).
--      Confirm before pushing if in any doubt:
--        select n.nspname from pg_extension e
--        join pg_namespace n on n.oid = e.extnamespace where e.extname='pgcrypto';


-- 1. The function ---------------------------------------------------------------
--
-- SECURITY DEFINER because it writes a table with no INSERT policy. That makes
-- every guard below load-bearing: nothing else stands between a caller and the
-- row. `set search_path = ''` with every reference schema-qualified, so the
-- body cannot be redirected by a caller's search_path — mandatory for a
-- definer-rights function, and the same hardening M3-02 records at length.
--
-- ⚠ `returns table (id …, token …, role …)` creates OUT PARAMETERS with those
-- names, and inside the body they SHADOW unqualified column references. Every
-- value below is carried in a v_-prefixed local and the INSERT's RETURNING is
-- aliased, for exactly that reason. It is deliberate, not stylistic — the same
-- footgun M3-13 flagged.
--
-- The return list is the exposure boundary, as it is for board_roster: four
-- fields, and no client-side shaping can widen it. `created_by`, `board_id`
-- and `email` are not in it because the caller already knows or does not need
-- them.

create or replace function public.create_invite(
  p_board_id        uuid,
  p_role            text,
  p_expires_in_days integer default 7
)
returns table (id uuid, token text, role text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_actor_rank integer;
  v_new_rank   integer;
  v_days       integer;
  v_token      text;
  v_expires_at timestamptz;
  v_id         uuid;
begin
  -- 1. Authenticated.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'create_invite requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. The caller's authority comes from the database, never from an argument.
  --    board_role() returns NULL both for "not a member" and "no such board",
  --    so this denies without revealing which.
  v_actor_rank := public.board_role_rank(public.board_role(p_board_id));
  if v_actor_rank is null then
    raise exception 'not a member of this board'
      using errcode = '42501';
  end if;

  -- 3. Validate the requested role BEFORE any rank comparison can see a NULL.
  --    `null <= 3` is NULL and an IF on NULL does not branch, which would turn
  --    a deny into an allow — the single most dangerous shape in this file.
  v_new_rank := public.board_role_rank(p_role);
  if v_new_rank is null then
    raise exception 'unrecognised role: %', p_role
      using errcode = '22023';
  end if;

  -- 4. Ownership is not grantable by link (I6). Stated separately from the
  --    rank comparison below, which would also catch it, so that the refusal
  --    survives any future edit to the arithmetic. M4-01's check constraint is
  --    the third layer.
  if p_role = 'owner' then
    raise exception 'ownership cannot be granted by invitation'
      using errcode = '42501';
  end if;

  -- 5. Caller must be admin or owner. Viewer and editor stop here.
  if v_actor_rank < public.board_role_rank('admin') then
    raise exception 'only an admin or the owner may invite people'
      using errcode = '42501';
  end if;

  -- 6. Strictly below own rank. One line, two rules: an admin (3) cannot
  --    invite an admin (3), and nobody can invite at a rank above their own.
  if v_actor_rank <= v_new_rank then
    raise exception 'cannot invite someone at or above your own role'
      using errcode = '42501';
  end if;

  -- 7. Expiry is CLAMPED, not trusted. The client picks 1, 7 or 30 days in the
  --    modal; anything outside 1..30 — including a crafted request asking for
  --    a century, and including NULL — is pulled back into range here. There
  --    is no argument that means "never expires", by construction.
  v_days       := least(greatest(coalesce(p_expires_in_days, 7), 1), 30);
  v_expires_at := now() + (v_days * interval '1 day');

  -- 8. The token is the credential, so it is generated HERE and never in
  --    React. 24 bytes from the CSPRNG behind pgcrypto, hex encoded: 192 bits
  --    of entropy in 48 URL-safe characters. Not a uuid — that is 122 bits in
  --    a recognisable shape, and a token that looks like a row id invites
  --    someone to try it as one.
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.board_invites as bi
    (board_id, token, role, expires_at, created_by)
  values
    (p_board_id, v_token, p_role, v_expires_at, v_actor)
  returning bi.id into v_id;

  return query select v_id, v_token, p_role, v_expires_at;
end;
$$;

comment on function public.create_invite(uuid, text, integer) is
  'Creates an invite link for a board. Caller must be admin or owner and may '
  'only invite at a role strictly below their own, so an admin cannot invite '
  'an admin and nobody can invite an owner. The token is generated here, not '
  'by the client, and expiry is clamped to 1..30 days.';


-- 2. Grants ------------------------------------------------------------------------
--
-- EXECUTE is granted to PUBLIC by default, so the revoke does the work. anon
-- is excluded on principle rather than because it would achieve anything —
-- auth.uid() would be NULL and step 1 would refuse — because a SECURITY
-- DEFINER function should not be reachable by a role with no business calling
-- it. Same shape as M3-02 and M3-14.

revoke all on function public.create_invite(uuid, text, integer) from public, anon;
grant execute on function public.create_invite(uuid, text, integer) to authenticated;
grant execute on function public.create_invite(uuid, text, integer) to service_role;


-- Rollback --------------------------------------------------------------------------
--
-- Forward-only. To reverse, put this in a NEW migration:
--
--   drop function if exists public.create_invite(uuid, text, integer);
--
-- No row is written by the migration itself. If the function has been live and
-- is being withdrawn because of a flaw, the invites it created are still
-- pending links and should be swept in the same migration:
--
--   delete from public.board_invites
--   where accepted_at is null
--     and created_at >= '<when this migration was applied>';
--
-- Accepted ones are memberships now; audit those against board_members rather
-- than deleting the row that records them.
--
--
-- Verification --------------------------------------------------------------------------
--
-- Scripted in scripts/verify-m4-invites.sql §1–§5 and §12: owner invites at
-- all three roles, admin invites viewer/editor, admin is denied 'admin',
-- everyone is denied 'owner', viewer/editor/non-member are denied outright,
-- and the expiry clamp holds at 0 and 9999 days. The harness runs in a
-- transaction that ends in ROLLBACK.
--
-- What the harness does NOT prove, and needs a real session:
--
--   · That anon cannot execute it over PostgREST:
--       curl -X POST "$URL/rest/v1/rpc/create_invite" -H "apikey: $ANON" \
--         -H "Content-Type: application/json" \
--         -d '{"p_board_id":"<board>","p_role":"viewer"}'
--       -- expect 42501 permission denied for function create_invite
--   · That two calls produce two different tokens (they will; assert it once):
--       select count(distinct token) from public.board_invites;
