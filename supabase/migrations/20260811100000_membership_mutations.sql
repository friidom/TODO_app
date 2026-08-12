-- M3-14 · Membership mutation RPCs. HIGH RISK. Tier A.
--
-- The task that makes membership manageable at all, and a privilege-granting
-- surface. The risk here is a LOGIC FLAW, not data loss: no backup mitigates a
-- function that lets an admin demote the Owner. Only reading it does.
--
-- Implements the Membership matrix from Part II of the implementation plan:
--
--   capability                              viewer  editor  admin  owner
--   see the member list                       ✓       ✓       ✓      ✓    (M3-13)
--   add/invite as viewer or editor            ✗       ✗       ✓      ✓
--   add/invite as admin                       ✗       ✗       ✗      ✓
--   change a viewer ↔ editor role             ✗       ✗       ✓      ✓
--   promote to / demote from admin            ✗       ✗       ✗      ✓
--   remove a viewer or editor                 ✗       ✗       ✓      ✓
--   remove an admin                           ✗       ✗       ✗      ✓
--   MODIFY THE OWNER IN ANY WAY               ✗       ✗       ✗      ✗
--   leave the board voluntarily               ✓       ✓       ✓      ✗
--
-- Read as one rule: AN ACTOR MAY ONLY ACT ON A MEMBER STRICTLY BELOW THEIR OWN
-- RANK, AND NEVER ON THE OWNER. Section 2 turns that sentence into arithmetic
-- so it is expressed once rather than re-derived in four places.
--
--
-- SCOPE
--
--   · board_role_rank(text)          — the hierarchy, in one place
--   · is_board_owner(uuid, uuid)     — internal owner test, both sources
--   · add_board_member(uuid, uuid, text)
--   · set_member_role(uuid, uuid, text)
--   · remove_board_member(uuid, uuid)
--   · leave_board(uuid)              — self-removal, the one different rule
--
-- NOT in scope, deliberately:
--
--   · board_members RLS — UNCHANGED. Still self-read only (M3-01), still no
--     write policy, and it must never get one. These RPCs are the write path.
--   · board_members table privileges — UNCHANGED from M3-13. anon revoked,
--     authenticated SELECT only.
--   · profiles RLS — UNCHANGED. Still self-only. board_roster (M3-13) remains
--     the roster-read API.
--   · Ownership transfer. Not a membership operation, does not exist, and
--     section 4 makes it inexpressible through any function here.
--
--
-- OWNER INVARIANTS — numbered as in Part II of the implementation plan, which
-- is the source of truth. Do not renumber them here.
--
--   I1  a board always has exactly one Owner
--   I2  the Owner's membership row cannot be DELETED, by any actor
--   I3  the Owner's role cannot be CHANGED, by any actor
--   I4  an admin has no path to an Owner-held row at all
--   I5  boards.owner_id and the owner membership row never drift apart
--   I6  changing who the Owner is is not a membership operation
--
-- Closed by this migration, for every caller of these four functions:
--
--   I1  no code path can write role = 'owner', so a second Owner cannot be
--       created; and the only Owner cannot be removed (see I2)
--   I2  is_board_owner guard in remove_board_member; leave_board refuses the
--       Owner
--   I3  is_board_owner guard in set_member_role
--   I4  the owner guard runs BEFORE the admin-or-owner gate in every function,
--       so an admin never reaches an Owner-held row even if the rank logic
--       were wrong
--   I6  explicit rejection of p_role = 'owner' in add and set; no transfer
--       operation exists to create one
--
-- ⚠ NOT CLOSED BY THIS MIGRATION:
--
--   I5  is_board_owner READS both boards.owner_id and board_members
--       defensively, so drift cannot be exploited through these RPCs — but
--       reading two sources is not the same as enforcing that they agree.
--       Nothing here prevents drift. That is M3-15's trigger.
--
-- Also not closed, and it is Enforcement Rule 6 rather than an invariant
-- number: a function cannot constrain a writer that does not call it.
-- service_role, a future SECURITY DEFINER function, or a migration could still
-- write an owner row directly. No client can — M3-13 revoked the table
-- privileges and there is no write policy — so the residual exposure is
-- narrow. M3-15 closes it with a trigger on board_members.
--
--
-- TIER A (plan Rule 6): creates six functions, writes no row. Reversal is the
-- forward-fix SQL at the foot of this file. No dump, no rehearsal, no PITR.
--
--
-- PRECONDITIONS
--
--   1. M3-01 — board_members exists with its self-read policy.
--   2. M3-02 — public.board_role(uuid) exists. Every function below derives
--      the caller's authority from it and never from an argument.
--   3. M3-03 — every board has an owner membership row, so the owner tests in
--      section 3 have something to find.
--   4. M3-13 applied — board_members table privileges already narrowed.


-- 1. Captured pre-change state -------------------------------------------------
--
-- No membership mutation path exists anywhere. Verified against the migration
-- tree: the only writer to board_members is add_owner_membership() (M3-03), a
-- SECURITY DEFINER AFTER INSERT trigger on boards, which mints a board's first
-- owner row because that row cannot be authorized by membership.
--
-- None of the six functions created below previously exists. The complete
-- function inventory before this migration is:
--
--   accessible_board_ids, add_owner_membership, assign_todo_board_key,
--   board_role, board_roster, is_board_member, provision_new_user,
--   set_updated_at
--
-- board_members, unchanged by this migration and stated for the rollback:
--
--   RLS enabled. One policy:
--     "Users select own memberships"  for select to authenticated
--       using (user_id = (select auth.uid()))
--   Privileges after M3-13:
--     anon          — none
--     authenticated — SELECT only
--     service_role  — ALL (inherited, never revoked)


-- 2. The role hierarchy, expressed once -----------------------------------------
--
-- viewer(1) < editor(2) < admin(3) < owner(4).
--
-- Every authorization decision below is a comparison of two ranks, so the
-- hierarchy lives in exactly one place. Duplicating `role in ('owner','admin')`
-- across four functions is how the admin-versus-owner boundary gets subtly
-- wrong in one of them.
--
-- IMMUTABLE and not SECURITY DEFINER: it reads nothing, it is a pure function
-- of its argument. `set search_path = ''` anyway, for consistency and because
-- an IMMUTABLE function with a mutable search_path is a footgun in indexes.
--
-- Returns NULL for an unrecognised role. Every caller below tests for that
-- explicitly rather than letting NULL flow into a comparison — `null <= 3` is
-- NULL, and an IF on NULL does not branch, which would turn a deny into an
-- allow. That is the single most dangerous shape in this file and it is why
-- the guards are written the way they are.

create or replace function public.board_role_rank(p_role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role
           when 'viewer' then 1
           when 'editor' then 2
           when 'admin'  then 3
           when 'owner'  then 4
         end;
$$;

comment on function public.board_role_rank(text) is
  'Rank of a board role: viewer 1 < editor 2 < admin 3 < owner 4. NULL for '
  'anything else. The single definition of the hierarchy — every membership '
  'RPC compares ranks rather than re-listing role names.';


-- 3. Is this user the board owner? ----------------------------------------------
--
-- Two sources, OR'd, because the Owner is identified by both. Checking only
-- board_members would miss an owner whose membership row went missing;
-- checking only boards.owner_id would miss a row that says 'owner' without
-- matching. Either one being true is enough to refuse, which is the safe
-- direction.
--
-- To be precise about what this does and does not do for I5: the OR means
-- drift cannot be EXPLOITED through these RPCs — a drifted Owner is still
-- untouchable by either identification. It does not ENFORCE I5; nothing here
-- stops the two sources diverging in the first place. M3-15's trigger does
-- that. The verification harness has a dedicated fixture board with
-- deliberately drifted ownership, so this OR is proved rather than assumed.
--
-- SECURITY DEFINER so it reads both tables unfiltered. Internal only: revoked
-- from public, anon AND authenticated. The functions below run as the owner of
-- this function and therefore do not need a grant. Exposing it to clients
-- would let a non-member probe "is X the owner of board Y"; M3-13's roster is
-- the sanctioned way to learn that, and it requires membership.
--
-- Same precedent as add_owner_membership(), which is likewise revoked from
-- authenticated.

create or replace function public.is_board_owner(p_board_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    where m.board_id = p_board_id
      and m.user_id  = p_user_id
      and m.role     = 'owner'
  ) or exists (
    select 1
    from public.boards b
    where b.id       = p_board_id
      and b.owner_id = p_user_id
  );
$$;

comment on function public.is_board_owner(uuid, uuid) is
  'Whether the user is the board owner, by either board_members.role = owner '
  'or boards.owner_id. Internal to the membership RPCs — revoked from '
  'authenticated so it cannot be used to probe ownership of a board the '
  'caller is not a member of.';


-- 4. add_board_member ------------------------------------------------------------
--
-- Guard order matters and follows the plan exactly. In particular the OWNER
-- TEST COMES BEFORE THE CALLER-RANK GATE: it must not sit behind an
-- "is the caller admin or owner" branch, or an implementation that gets the
-- rank logic slightly wrong lets an admin through to the Owner.

create or replace function public.add_board_member(
  p_board_id uuid,
  p_user_id  uuid,
  p_role     text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor      uuid;
  v_actor_rank integer;
  v_new_rank   integer;
begin
  -- 1. Authenticated.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'add_board_member requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. Caller's authority comes from the database, never from an argument.
  --    board_role() returns NULL both for "not a member" and "no such board",
  --    so this denies without revealing which.
  v_actor_rank := public.board_role_rank(public.board_role(p_board_id));
  if v_actor_rank is null then
    raise exception 'not a member of this board'
      using errcode = '42501';
  end if;

  -- 3. The Owner is never a target (I2, I3). BEFORE the rank gate, which is
  --    what makes I4 hold independently of the rank logic being right.
  if public.is_board_owner(p_board_id, p_user_id) then
    raise exception 'the board owner cannot be modified'
      using errcode = '42501';
  end if;

  -- 4. Ownership is not grantable (I6), so no second Owner can exist (I1).
  --    Also rejects a bad role string before any rank comparison sees NULL.
  v_new_rank := public.board_role_rank(p_role);
  if v_new_rank is null then
    raise exception 'unrecognised role: %', p_role
      using errcode = '22023';
  end if;
  if p_role = 'owner' then
    raise exception 'ownership cannot be granted through membership management'
      using errcode = '42501';
  end if;

  -- 5. Caller must be admin or owner.
  if v_actor_rank < public.board_role_rank('admin') then
    raise exception 'only an admin or the owner may add members'
      using errcode = '42501';
  end if;

  -- 6. Strictly below own rank. An admin cannot mint an admin; nobody can
  --    grant a rank at or above their own.
  if v_actor_rank <= v_new_rank then
    raise exception 'cannot grant a role at or above your own'
      using errcode = '42501';
  end if;

  -- 7. The target must be a real user. The FK would catch this, but its error
  --    names a constraint rather than the problem.
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'no such user'
      using errcode = 'P0002';
  end if;

  -- ON CONFLICT DO NOTHING plus the NOT FOUND test makes a concurrent double
  -- call safe: the primary key serialises them and the loser gets the same
  -- clear error as a sequential second call, rather than a raw 23505.
  insert into public.board_members (board_id, user_id, role)
  values (p_board_id, p_user_id, p_role)
  on conflict (board_id, user_id) do nothing;

  if not found then
    raise exception 'user is already a member of this board; use set_member_role'
      using errcode = '23505';
  end if;
end;
$$;

comment on function public.add_board_member(uuid, uuid, text) is
  'Adds a member. Caller must be admin or owner of the board and may only '
  'grant a role strictly below their own. The board owner is never a valid '
  'target and owner is never a grantable role.';


-- 5. set_member_role ---------------------------------------------------------------
--
-- Same guards, plus the target's CURRENT rank: an admin may not touch another
-- admin even to demote them, and may not touch themselves through this
-- function. Both fall out of the strictly-below rule rather than needing their
-- own branches.

create or replace function public.set_member_role(
  p_board_id uuid,
  p_user_id  uuid,
  p_role     text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_actor_rank  integer;
  v_target_role text;
  v_target_rank integer;
  v_new_rank    integer;
begin
  -- 1. Authenticated.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'set_member_role requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. Caller's authority from the database.
  v_actor_rank := public.board_role_rank(public.board_role(p_board_id));
  if v_actor_rank is null then
    raise exception 'not a member of this board'
      using errcode = '42501';
  end if;

  -- 3. The Owner is never a target. This is I3 (the Owner's role cannot be
  --    changed, by ANY actor including themselves) and I4 (an admin has no
  --    path here at all, because this runs before the rank gate).
  if public.is_board_owner(p_board_id, p_user_id) then
    raise exception 'the board owner cannot be modified'
      using errcode = '42501';
  end if;

  -- 4. Ownership is not grantable (I6), so no second Owner can exist (I1).
  v_new_rank := public.board_role_rank(p_role);
  if v_new_rank is null then
    raise exception 'unrecognised role: %', p_role
      using errcode = '22023';
  end if;
  if p_role = 'owner' then
    raise exception 'ownership cannot be granted through membership management'
      using errcode = '42501';
  end if;

  -- 5. Caller must be admin or owner.
  if v_actor_rank < public.board_role_rank('admin') then
    raise exception 'only an admin or the owner may change member roles'
      using errcode = '42501';
  end if;

  -- 6. Target must exist on THIS board. Scoping every read and write by
  --    p_board_id is what makes cross-board manipulation impossible: a
  --    (board_id, user_id) pair the caller does not control simply does not
  --    match, and step 2 already refused a board they are not a member of.
  -- FOR UPDATE: the rank decision below is made on this row, so it must not
  --    change underneath us. Without the lock a concurrent owner promotion
  --    could turn a viewer into an admin between the read and the write,
  --    and this call would apply a decision taken against a stale role.
  select m.role into v_target_role
  from public.board_members m
  where m.board_id = p_board_id
    and m.user_id  = p_user_id
  for update;

  if v_target_role is null then
    raise exception 'user is not a member of this board'
      using errcode = 'P0002';
  end if;

  v_target_rank := public.board_role_rank(v_target_role);
  if v_target_rank is null then
    raise exception 'unrecognised existing role for target user'
      using errcode = '42501';
  end if;

  -- 7. Strictly below own rank, in both directions: the target as they are
  --    now, and the role they would become.
  if v_actor_rank <= v_target_rank then
    raise exception 'cannot modify a member at or above your own role'
      using errcode = '42501';
  end if;
  if v_actor_rank <= v_new_rank then
    raise exception 'cannot grant a role at or above your own'
      using errcode = '42501';
  end if;

  update public.board_members m
  set role = p_role
  where m.board_id = p_board_id
    and m.user_id  = p_user_id;
end;
$$;

comment on function public.set_member_role(uuid, uuid, text) is
  'Changes a member''s role. Caller must be admin or owner and must outrank '
  'both the target''s current role and the role being assigned. The board '
  'owner is never a valid target and owner is never a grantable role.';


-- 6. remove_board_member -----------------------------------------------------------
--
-- Administration, not consent. Removing yourself is leave_board() — see
-- section 7 for why they are separate functions rather than one with a branch.

create or replace function public.remove_board_member(
  p_board_id uuid,
  p_user_id  uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor       uuid;
  v_actor_rank  integer;
  v_target_role text;
  v_target_rank integer;
begin
  -- 1. Authenticated.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'remove_board_member requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. Caller's authority from the database.
  v_actor_rank := public.board_role_rank(public.board_role(p_board_id));
  if v_actor_rank is null then
    raise exception 'not a member of this board'
      using errcode = '42501';
  end if;

  -- 3. The Owner is never a target. This is I2 (the Owner's membership row
  --    cannot be deleted, by ANY actor including themselves) and I4.
  if public.is_board_owner(p_board_id, p_user_id) then
    raise exception 'the board owner cannot be removed'
      using errcode = '42501';
  end if;

  -- 4. Caller must be admin or owner.
  if v_actor_rank < public.board_role_rank('admin') then
    raise exception 'only an admin or the owner may remove members'
      using errcode = '42501';
  end if;

  -- 5. Target must exist on THIS board.
  -- FOR UPDATE, same reason as set_member_role: the rank decision below is
  --    made on this row and must not change before the delete.
  select m.role into v_target_role
  from public.board_members m
  where m.board_id = p_board_id
    and m.user_id  = p_user_id
  for update;

  if v_target_role is null then
    raise exception 'user is not a member of this board'
      using errcode = 'P0002';
  end if;

  v_target_rank := public.board_role_rank(v_target_role);
  if v_target_rank is null then
    raise exception 'unrecognised existing role for target user'
      using errcode = '42501';
  end if;

  -- 6. Strictly below own rank. Denies admin-removes-admin, and denies an
  --    admin removing themselves through the administration path.
  if v_actor_rank <= v_target_rank then
    raise exception 'cannot remove a member at or above your own role'
      using errcode = '42501';
  end if;

  delete from public.board_members m
  where m.board_id = p_board_id
    and m.user_id  = p_user_id;
end;
$$;

comment on function public.remove_board_member(uuid, uuid) is
  'Removes a member. Caller must be admin or owner and must outrank the '
  'target. The board owner can never be removed. Self-removal is leave_board.';


-- 7. leave_board -------------------------------------------------------------------
--
-- The one function that skips the admin-or-owner gate, because consent is not
-- administration. A viewer may leave a board; a viewer may not remove anyone.
--
-- A separate function rather than a branch inside remove_board_member: a rule
-- that reads "remove_board_member happens to allow self" is one refactor away
-- from disappearing, and the two operations have genuinely different
-- authorization. Keeping them apart means the self-service exception cannot be
-- widened by accident while editing the administrative path.
--
-- The Owner cannot leave: a board always has exactly one Owner (I1), and there
-- is no ownership transfer to hand it to anyone else.

create or replace function public.leave_board(p_board_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  -- 1. Authenticated.
  v_actor := (select auth.uid());
  if v_actor is null then
    raise exception 'leave_board requires an authenticated session'
      using errcode = '28000';
  end if;

  -- 2. Caller must be a member. Nothing to leave otherwise, and the message
  --    reveals nothing a non-member did not already know.
  if public.board_role(p_board_id) is null then
    raise exception 'not a member of this board'
      using errcode = '42501';
  end if;

  -- 3. The Owner cannot leave: I2 via the self-service path, and I1, since a
  --    board always has exactly one Owner. Note this is the caller, not an
  --    argument —
  --    leave_board takes no user id, so it cannot be pointed at anyone else.
  if public.is_board_owner(p_board_id, v_actor) then
    raise exception 'the board owner cannot leave the board'
      using errcode = '42501';
  end if;

  delete from public.board_members m
  where m.board_id = p_board_id
    and m.user_id  = v_actor;
end;
$$;

comment on function public.leave_board(uuid) is
  'Removes the caller''s own membership. Any non-owner member may leave. '
  'Takes no user id, so it cannot be aimed at another member. The owner '
  'cannot leave — a board always has exactly one owner.';


-- 8. Grants ------------------------------------------------------------------------
--
-- Functions are granted EXECUTE to PUBLIC by default, so the revokes do the
-- work. Same shape as M3-02 and M3-13.
--
-- is_board_owner is the exception: revoked from authenticated as well, because
-- it is an internal predicate and exposing it would let a non-member probe
-- ownership. The four RPCs run as this migration's role and reach it by
-- ownership, not by grant.

revoke all on function public.board_role_rank(text) from public, anon;
grant execute on function public.board_role_rank(text) to authenticated;
grant execute on function public.board_role_rank(text) to service_role;

revoke all on function public.is_board_owner(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_board_owner(uuid, uuid) to service_role;

revoke all on function public.add_board_member(uuid, uuid, text) from public, anon;
grant execute on function public.add_board_member(uuid, uuid, text) to authenticated;
grant execute on function public.add_board_member(uuid, uuid, text) to service_role;

revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to service_role;

revoke all on function public.remove_board_member(uuid, uuid) from public, anon;
grant execute on function public.remove_board_member(uuid, uuid) to authenticated;
grant execute on function public.remove_board_member(uuid, uuid) to service_role;

revoke all on function public.leave_board(uuid) from public, anon;
grant execute on function public.leave_board(uuid) to authenticated;
grant execute on function public.leave_board(uuid) to service_role;


-- Rollback ---------------------------------------------------------------------------
--
-- Forward-only. To reverse, put this in a NEW migration:
--
--   drop function if exists public.leave_board(uuid);
--   drop function if exists public.remove_board_member(uuid, uuid);
--   drop function if exists public.set_member_role(uuid, uuid, text);
--   drop function if exists public.add_board_member(uuid, uuid, text);
--   drop function if exists public.is_board_owner(uuid, uuid);
--   drop function if exists public.board_role_rank(text);
--
-- No row is written by this migration, so there is nothing to restore. If the
-- functions have been live and are being withdrawn because of a flaw, audit
-- what they created before dropping them:
--
--   select * from public.board_members
--   where joined_at >= '<when this migration was applied>'
--     and role <> 'owner'
--   order by joined_at;
--
-- joined_at defaults to now() on insert, so it is the window. Owner rows are
-- excluded because these functions cannot create one.


-- Verification -------------------------------------------------------------------------
--
-- NOT YET RUN at the time of writing.
--
-- The full matrix is scripted in scripts/verify-m3-14-membership.sql. That
-- harness runs entirely inside a transaction that ends in ROLLBACK, creates
-- its own fixtures, and simulates each role by setting request.jwt.claims
-- rather than needing a real JWT per account. Run it in the SQL editor.
--
-- What the harness ACTUALLY EXECUTES. Every line below corresponds to a case
-- in the script; nothing is listed here that the harness does not run. An
-- earlier draft of this comment claimed nine cells the script never exercised,
-- which independent review caught — do not add a line here without adding the
-- case.
--
--   viewer  → add / set / remove            denied
--   editor  → add / set / remove            denied
--   admin   → add viewer                    allowed
--   admin   → promote viewer to editor      allowed
--   admin   → remove editor                 allowed
--   admin   → add / set / remove the owner  denied  (I2, I3, I4)
--   admin   → grant 'owner'                 denied  (I1, I6)
--   admin   → act on another admin          denied
--   admin   → act on themselves             denied
--   owner   → add admin                     allowed
--   owner   → promote viewer→editor→admin   allowed
--   owner   → demote admin                  allowed
--   owner   → remove admin                  allowed
--   owner   → demote or remove themselves   denied  (I2, I3)
--   owner   → grant 'owner'                 denied  (I1, I6)
--   owner   → leave_board                   denied  (I1, I2)
--   viewer / editor / admin → leave_board   allowed
--   non-member → any operation              denied
--   member of board A → operate on board B  denied
--   drifted owner (boards.owner_id only)    still untouchable — proves the
--                                           second branch of is_board_owner,
--                                           which no other case distinguishes
--
-- What the harness does NOT prove, and what still needs a real session:
--
--   · That anon cannot execute the RPCs over PostgREST. Check separately:
--       curl -X POST "$URL/rest/v1/rpc/add_board_member" -H "apikey: $ANON" …
--       -- expect 42501 permission denied for function add_board_member
--   · That authenticated still cannot INSERT/UPDATE/DELETE board_members
--     directly. That is M3-13's revoke and is unchanged here, but it is the
--     property these RPCs exist to work around, so re-check it once:
--       curl -X POST "$URL/rest/v1/board_members" -H "Authorization: Bearer $JWT" …
--       -- expect 42501 permission denied for table board_members
--   · That a role change survives a reload — a second read after the mutation
--     through board_roster.
--
-- Those three are REST-level and belong to M3-16 with the rest of the matrix.
