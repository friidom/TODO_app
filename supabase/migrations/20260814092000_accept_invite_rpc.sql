-- M4-03 · accept_invite and revoke_invite. HIGH RISK. Tier A.
--
-- ⚠ accept_invite IS A PRIVILEGE-GRANTING FUNCTION. It is the only path in the
-- system by which someone who is not a member of a board becomes one, and it
-- runs for a caller the board's owner has never heard of. The risk is a LOGIC
-- FLAW, not data loss: no backup mitigates a function that admits the wrong
-- person, or admits the right person twice, or admits them at the wrong role.
-- Only reading it does. Review this file line by line before pushing it.
--
--
-- WHAT THE CLIENT CONTROLS: a token string. Nothing else.
--
-- There is no board argument, no user argument and NO ROLE ARGUMENT. The role
-- granted is the one stored on the invite row by create_invite, which was
-- itself rank-checked against its caller (M4-02). A client cannot name a
-- board it was not invited to, cannot accept on behalf of anyone else — the
-- membership is written for auth.uid() — and cannot choose or upgrade what it
-- receives. That is the whole security argument, and it holds because of what
-- the signature omits rather than because of what the body checks.
--
--
-- THE FIVE REFUSALS, and the order they run in:
--
--   1. no session                → 28000
--   2. no such token             → P0002   (also: a revoked token, see below)
--   3. expired                   → 22023
--   4. stored role is 'owner'    → 42501   (defence in depth behind M4-01)
--   5. already accepted, by      → 23505
--      someone else
--
-- and one non-refusal that matters as much:
--
--   6. THE CALLER IS ALREADY A MEMBER → clean no-op, returning
--      ('already_member', board_id) WITHOUT touching their role and WITHOUT
--      stamping accepted_at.
--
-- Case 6 is the collision rule the plan required be decided explicitly:
-- accepting while already a member is NEVER an upgrade and NEVER a downgrade.
-- That is what makes a leaked old link harmless to someone who has since been
-- promoted or demoted — the link cannot move them. It also makes a repeated
-- click by the person who just accepted idempotent, because they are a member
-- by then and take this branch instead of hitting refusal 5.
--
--
-- WHY REPLAY IS IMPOSSIBLE — the row lock, not the check.
--
-- `select … for update` on the invite is what makes the accepted_at test
-- meaningful. Two accounts opening the same link at the same instant would
-- otherwise both read accepted_at as NULL and both be admitted: one link, two
-- memberships. With the lock, the second transaction blocks; under READ
-- COMMITTED it then re-reads the row it was waiting on and sees accepted_at
-- set, so it takes refusal 5. The single-transaction guarantee the plan asks
-- for is this lock plus the fact that the insert and the stamp are two
-- statements inside one function call.
--
--
-- EMAIL / ACCOUNT MISMATCH: allowed in v1, deliberately. `email` is always
-- null today, so there is nothing to match against — THE LINK IS THE
-- CREDENTIAL. Whoever holds it joins. When email invitations land, an invite
-- carrying an address should compare it against the accepting account, and
-- that comparison belongs in this function.
--
--
-- TIER A: creates two functions. Writes no row itself. Reversal is the
-- forward-fix SQL at the foot of this file — but see it before dropping:
-- memberships this function created must be audited, not assumed away.
--
--
-- PRECONDITIONS
--
--   1. M4-01 — public.board_invites.
--   2. M3-02 — public.board_role(uuid).
--   3. M3-14 — public.board_role_rank(text).
--   4. M3-15 — the board_members owner-immutability trigger. Its INSERT branch
--      fires only when new.role = 'owner', so the membership written below
--      passes through it untouched. Refusal 4 means this function never
--      attempts an owner row in the first place.


-- 1. accept_invite ---------------------------------------------------------------
--
-- SECURITY DEFINER: it reads board_invites, which the caller has no policy to
-- read (M4-01 is owner/admin only — the invitee cannot see their own invite),
-- and writes board_members, which has no INSERT policy at all. Every guard
-- below is therefore the only thing between a token and a membership.
--
-- ⚠ `returns table (status …, board_id …)` creates OUT PARAMETERS that SHADOW
-- unqualified column references in the body. The invite is read into a v_-
-- prefixed record and every column reached through it, for exactly that
-- reason. `v_invite.board_id` is unambiguous where a bare `board_id` would
-- silently mean the OUT parameter.
--
-- status is a text discriminant rather than a boolean because the two success
-- shapes are not "worked / did not work": 'accepted' means a membership was
-- created and the UI should celebrate, 'already_member' means nothing changed
-- and the UI should just open the board. A boolean would collapse them and the
-- frontend would guess.

create or replace function public.accept_invite(p_token text)
returns table (status text, board_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_invite public.board_invites%rowtype;
begin
  -- 1. Authenticated. anon is also refused by the grants in section 3; this is
  --    the second of the two independent refusals.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'accept_invite requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. Find and LOCK the invite. The lock is load-bearing — see the header.
  select * into v_invite
  from public.board_invites i
  where i.token = p_token
  for update;

  -- 3. No such token. A REVOKED invite reaches this branch too, because
  --    revoke_invite deletes the row: a revoked link and a token that never
  --    existed are indistinguishable from outside, which is the point. The
  --    message names neither, so a guesser learns nothing about which tokens
  --    exist.
  if not found then
    raise exception 'invitation not found'
      using errcode = 'P0002';
  end if;

  -- 4. Expired. A distinct message is safe here in a way it would not be in
  --    step 3: only someone already holding a 192-bit token can reach this
  --    branch, so it tells an attacker nothing they could have guessed, and it
  --    tells a real invitee something they need to know.
  if v_invite.expires_at <= now() then
    raise exception 'invitation has expired'
      using errcode = '22023';
  end if;

  -- 5. Ownership is not grantable (I6). M4-01's check constraint means no code
  --    path can store 'owner' here — this refuses it anyway, in case one ever
  --    could. A token whose stored role is 'owner' is REFUSED, never honoured.
  if v_invite.role = 'owner' then
    raise exception 'this invitation cannot be accepted'
      using errcode = '42501';
  end if;

  -- 6. Already a member: clean no-op. Their existing role is not read and not
  --    written, in either direction, and accepted_at is deliberately left
  --    alone — consuming a link for someone who gained nothing from it would
  --    burn an invitation the sender may still intend for someone else.
  if public.board_role(v_invite.board_id) is not null then
    return query select 'already_member'::text, v_invite.board_id;
    return;
  end if;

  -- 7. Spent. Reached only by someone who is NOT a member, so it cannot fire
  --    for the person who just accepted — they took branch 6. One link, one
  --    membership.
  if v_invite.accepted_at is not null then
    raise exception 'invitation has already been used'
      using errcode = '23505';
  end if;

  -- 8. Grant exactly the stored role, to the caller, on the invite's board.
  --    ON CONFLICT DO NOTHING guards the one race step 6 cannot: a membership
  --    arriving from add_board_member() between the check and this insert.
  --    The winner's role stands either way — this never overwrites one.
  insert into public.board_members (board_id, user_id, role)
  values (v_invite.board_id, v_actor, v_invite.role)
  on conflict (board_id, user_id) do nothing;

  update public.board_invites i
  set accepted_at = now()
  where i.id = v_invite.id;

  return query select 'accepted'::text, v_invite.board_id;
end;
$$;

comment on function public.accept_invite(text) is
  'Redeems an invite token for a board membership at the role stored on the '
  'invite. The token is the only argument — the caller cannot name a board, a '
  'user or a role. Accepting while already a member is a no-op that changes '
  'nothing in either direction; a second acceptance by anyone else is refused. '
  'The invite row is locked FOR UPDATE, so concurrent redemption cannot '
  'produce two memberships.';


-- 2. revoke_invite ----------------------------------------------------------------
--
-- Deletes a pending invitation. There is no revoked_at column and this is why:
-- deleting is the only revocation that cannot be half-applied, and it collapses
-- "revoked" into "never existed" for every reader, including accept_invite.
--
-- ⚠ NOT-FOUND AND NOT-AUTHORIZED RETURN THE SAME ERROR, deliberately. The
-- argument is an opaque row id rather than a board the caller has already
-- named, so distinguishing them would turn this function into an oracle for
-- "does this invite id exist". A caller who is not an admin of the invite's
-- board is told the invite does not exist, because as far as they are
-- concerned it does not.
--
-- Any admin or owner may revoke any pending invite on their board, including
-- one an owner created at a role they could not have granted themselves.
-- Revocation only ever removes privilege, so the strictly-below-own-rank rule
-- that governs create_invite has nothing to protect here.

create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_actor_rank integer;
  v_invite     public.board_invites%rowtype;
begin
  -- 1. Authenticated.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'revoke_invite requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. Find and lock, so a concurrent accept_invite of the same invite
  --    serialises against this rather than interleaving with it. Whichever
  --    commits first wins cleanly: the accept sees no row, or the revoke sees
  --    accepted_at set.
  select * into v_invite
  from public.board_invites i
  where i.id = p_invite_id
  for update;

  if not found then
    raise exception 'invitation not found'
      using errcode = 'P0002';
  end if;

  -- 3. Authorization, reported as absence. See the note above.
  --    Rank arithmetic rather than `board_role(…) not in ('owner','admin')`:
  --    that expression yields NULL for a non-member, and NULL in an IF does
  --    not branch — the shape M3-14 calls the most dangerous in the codebase.
  --    A null rank is tested for on its own line instead.
  v_actor_rank := public.board_role_rank(public.board_role(v_invite.board_id));
  if v_actor_rank is null
     or v_actor_rank < public.board_role_rank('admin') then
    raise exception 'invitation not found'
      using errcode = 'P0002';
  end if;

  -- 4. An accepted invite is history, not a pending link. Deleting it would
  --    destroy the audit trail the rollback section below depends on, and it
  --    would not remove anyone — that is remove_board_member's job.
  if v_invite.accepted_at is not null then
    raise exception 'this invitation has already been accepted; remove the member instead'
      using errcode = '23505';
  end if;

  delete from public.board_invites i
  where i.id = v_invite.id;
end;
$$;

comment on function public.revoke_invite(uuid) is
  'Deletes a pending invitation, which makes its link fail exactly as an '
  'unknown token does. Caller must be an admin or owner of the invite''s '
  'board; anyone else is told it does not exist, so the id cannot be probed. '
  'An already-accepted invite is refused — remove the member instead.';


-- 3. Grants -------------------------------------------------------------------------
--
-- anon is revoked from accept_invite as well as from revoke_invite. An
-- unauthenticated visitor holding a link is sent through the auth flow by the
-- frontend and accepts afterwards; there is no anonymous acceptance, and the
-- grant says so independently of the function body's own check.

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.accept_invite(text) to service_role;

revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.revoke_invite(uuid) to authenticated;
grant execute on function public.revoke_invite(uuid) to service_role;


-- Rollback ---------------------------------------------------------------------------
--
-- Forward-only. To reverse, put this in a NEW migration:
--
--   drop function if exists public.revoke_invite(uuid);
--   drop function if exists public.accept_invite(text);
--
-- ⚠ DO NOT DROP AND MOVE ON. If accept_invite is being withdrawn because of a
-- flaw, every membership it created is suspect and must be audited by hand
-- against the invites that produced them:
--
--   select bi.board_id, bi.role as invited_role, bi.accepted_at,
--          bm.user_id, bm.role as actual_role, bm.joined_at
--   from public.board_invites bi
--   join public.board_members bm on bm.board_id = bi.board_id
--   where bi.accepted_at is not null
--     and bm.joined_at between bi.accepted_at - interval '1 second'
--                          and bi.accepted_at + interval '1 second'
--   order by bi.accepted_at desc;
--
-- The join is by time because the invite does not record WHO accepted it — the
-- plan's field list has no accepted_by, so accepted_at plus board_members.
-- joined_at is the correspondence. Any row whose actual_role differs from
-- invited_role is a finding. Revoking access is remove_board_member().
--
--
-- Verification ---------------------------------------------------------------------------
--
-- Scripted in scripts/verify-m4-invites.sql §6–§11 and §13. The harness runs
-- inside a transaction that ends in ROLLBACK and simulates each account by
-- setting request.jwt.claims rather than minting a JWT.
--
-- What it executes, one line per case in the script:
--
--   valid token accepted → membership exists at the INVITED role   allowed
--   the same user accepts twice → 'already_member', one row, role unchanged
--   accepting while already a member at a different role → role unchanged
--   expired token                                                  22023
--   revoked (deleted) token                                        P0002
--   garbage token                                                  P0002
--   already-accepted token, a different user                       23505
--   revoke by a viewer / editor / non-member                       P0002
--   revoke of an accepted invite                                   23505
--   board_invites still has no non-SELECT policy                   true
--
-- What it does NOT prove, and still needs a real session:
--
--   · That anon cannot reach either function over PostgREST:
--       curl -X POST "$URL/rest/v1/rpc/accept_invite" -H "apikey: $ANON" \
--         -H "Content-Type: application/json" -d '{"p_token":"whatever"}'
--       -- expect 42501 permission denied for function accept_invite
--   · The concurrent double-accept. Two sessions, both stopping after the
--     SELECT … FOR UPDATE, is not expressible in a single-connection script:
--       -- session A: begin; select accept_invite('<token>');   -- do not commit
--       -- session B: select accept_invite('<token>');          -- expect: blocks
--       -- session A: commit;
--       -- session B: unblocks, expect 23505 and exactly one board_members row
