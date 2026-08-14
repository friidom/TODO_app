-- M4-03 fix · accept_invite raised 42702 on every call. HIGH RISK. Tier A.
--
-- The bug, exactly:
--
--   ERROR: column reference "board_id" is ambiguous
--   PL/pgSQL function public.accept_invite(text) line 68 at SQL statement
--
-- `returns table (status text, board_id uuid)` declares OUT PARAMETERS named
-- `status` and `board_id`. The membership insert ended in
--
--   on conflict (board_id, user_id) do nothing
--
-- and a conflict target is parsed as column references, so `board_id` matched
-- both the OUT parameter and `board_members.board_id`. plpgsql's default
-- `variable_conflict = error` refuses to guess and raises 42702 — before the
-- insert runs, so NO membership was ever created and `accepted_at` was never
-- stamped. Every acceptance failed; the invite survived intact, which is why
-- this is a clean forward fix with nothing to repair.
--
-- It surfaced in the UI as the generic "This invitation could not be accepted"
-- because 42702 is not one of the five SQLSTATEs `inviteErrorMessage` maps.
--
-- Why create_invite was unaffected: its OUT parameters are `id`, `token`,
-- `role`, `expires_at`, and its INSERT has no ON CONFLICT clause. The collision
-- needs both an OUT parameter and a column reference in an expression
-- position, and only accept_invite had one.
--
--
-- THE FIX: drop the conflict target. `on conflict do nothing` with no target
-- covers any unique violation on the table, and `board_members` has exactly one
-- unique constraint — the primary key on (board_id, user_id) from M3-01. The
-- two forms are therefore equivalent here, and the untargeted one contains no
-- column reference to be ambiguous about. Foreign-key violations are not
-- unique violations, so they still raise rather than being swallowed.
--
-- Rejected alternatives:
--
--   · Renaming the OUT parameters. They are the JSON keys PostgREST returns,
--     so `board_id` → `p_board_id` is a breaking API change for a naming
--     problem.
--   · `#variable_conflict use_column`. It would fix this line by changing name
--     resolution for the WHOLE function, which is a large blast radius for one
--     statement — and it makes the next person's reading of the body depend on
--     a pragma at the top.
--
--
-- TIER A: replaces one function. Writes no row. `create or replace` preserves
-- the existing ACL, and section 2 re-asserts the grants anyway so this file is
-- self-contained if it is ever replayed onto a fresh database.
--
-- The body below is 20260814092000's, unchanged except for line 68 and its
-- comment. It is restated in full rather than patched because a function has no
-- partial replacement — and because the guard ORDER is the security argument,
-- so it should be reviewable in one place.


-- 1. The corrected function -----------------------------------------------------

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
  -- 1. Authenticated. anon is also refused by the grants in section 2; this is
  --    the second of the two independent refusals.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'accept_invite requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. Find and LOCK the invite. The lock is what makes the accepted_at test
  --    below meaningful: two accounts opening the same link at the same instant
  --    would otherwise both read it as NULL and both be admitted.
  select * into v_invite
  from public.board_invites i
  where i.token = p_token
  for update;

  -- 3. No such token. A REVOKED invite reaches this branch too, because
  --    revoke_invite deletes the row: a revoked link and a token that never
  --    existed are indistinguishable from outside, which is the point.
  if not found then
    raise exception 'invitation not found'
      using errcode = 'P0002';
  end if;

  -- 4. Expired. A distinct message is safe here in a way it would not be in
  --    step 3: only someone already holding a 192-bit token can reach it.
  if v_invite.expires_at <= now() then
    raise exception 'invitation has expired'
      using errcode = '22023';
  end if;

  -- 5. Ownership is not grantable (I6). M4-01's check constraint means no code
  --    path can store 'owner' here — this refuses it anyway, in case one ever
  --    could.
  if v_invite.role = 'owner' then
    raise exception 'this invitation cannot be accepted'
      using errcode = '42501';
  end if;

  -- 6. Already a member: clean no-op. Their existing role is not read and not
  --    written, in either direction, and accepted_at is deliberately left
  --    alone. Runs BEFORE the spent check, which is what makes a repeat click
  --    by the person who just accepted idempotent rather than an error.
  if public.board_role(v_invite.board_id) is not null then
    return query select 'already_member'::text, v_invite.board_id;
    return;
  end if;

  -- 7. Spent. Reached only by someone who is NOT a member, so it cannot fire
  --    for the person who just accepted — they took branch 6.
  if v_invite.accepted_at is not null then
    raise exception 'invitation has already been used'
      using errcode = '23505';
  end if;

  -- 8. Grant exactly the stored role, to the caller, on the invite's board.
  --
  --    ⚠ `on conflict do nothing` WITHOUT a conflict target, and that is the
  --    fix this migration exists for. Naming (board_id, user_id) made
  --    `board_id` ambiguous against this function's OUT parameter of the same
  --    name and raised 42702 before the insert ran. board_members has one
  --    unique constraint — the primary key on exactly those two columns — so
  --    the untargeted form catches the same conflict and nothing else. It
  --    guards the one race step 6 cannot: a membership arriving from
  --    add_board_member() between the check and this insert. The winner's role
  --    stands either way; this never overwrites one.
  insert into public.board_members (board_id, user_id, role)
  values (v_invite.board_id, v_actor, v_invite.role)
  on conflict do nothing;

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


-- 2. Grants ------------------------------------------------------------------------
--
-- `create or replace` keeps the existing ACL, so these are re-asserted rather
-- than required. They are here so the file stands alone on a fresh database and
-- so the anon revoke is never one replay away from being lost.

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.accept_invite(text) to service_role;


-- Rollback ---------------------------------------------------------------------------
--
-- Forward-only. Reverting means re-applying 20260814092000's body, which is the
-- broken one — there is no state to restore, because the bug prevented every
-- write it would have made. Confirm that before assuming otherwise:
--
--   select count(*) from public.board_invites where accepted_at is not null;
--   -- 0 across the window between 20260814092000 and this migration
--
--
-- Verification ---------------------------------------------------------------------------
--
-- Reproduced and fixed against a local stack (`supabase start`) running every
-- migration in this directory, exercising the RPC as a real `authenticated`
-- session via request.jwt.claims:
--
--   before: 42702 column reference "board_id" is ambiguous, no membership row
--   after:  ('accepted', <board>) — membership at the INVITED role, exactly
--           one row, accepted_at stamped
--           second accept by the same user  → ('already_member', <board>),
--           still one row, role unchanged
--           expired token                   → 22023
--           revoked (deleted) token         → P0002
--           spent token, a different user   → 23505
--
-- scripts/verify-m4-invites.sql covers the same ground plus create_invite's
-- matrix; it now passes end to end rather than aborting at the first accept.
