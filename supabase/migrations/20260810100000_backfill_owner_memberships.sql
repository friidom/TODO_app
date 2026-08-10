-- M3-03 · Owner memberships: establish and maintain the invariant. HIGH RISK.
--
-- The invariant, from IMPLEMENTATION_PLAN.md's Milestone 3 success criteria:
--
--     Every board has at least one `owner` row in board_members.
--
-- Stated at the milestone level, in the present tense. A one-time backfill
-- makes it true for an instant; this migration makes it true and keeps it
-- true. docs/ARCHITECTURE.md line 133 says the same thing structurally —
-- "Every Board has: Owner, Members" — and an invariant belongs to a database
-- constraint, not to whichever call site remembers it.
--
-- That matters because none of the three paths that create a board writes a
-- membership row:
--
--   provision_new_user()  20260806094000, line 75   — signup
--   createBoard()         src/services/boards/boardsApi.ts:66 — client insert
--   the M2 backfill       20260806094242            — historical
--
-- Neither caller is patched here. A trigger covers all three and every future
-- writer — M4-03's accept_invite, M3-08's ownership transfer, a restore —
-- without a line of application code. This is the trade M2-21 already made for
-- todos.board_key, in the same shape and for the same reason: the create path
-- is a direct PostgREST insert, so an RPC would mean rewriting it, while a
-- trigger fires for every writer there will ever be.
--
--
-- ⚠ ORDERING — this migration must be applied BEFORE M3-04 and M3-05.
--
-- Those tasks make board_members the authorization source. Applied before this
-- one, every existing owner loses their own board. Nothing here reads
-- board_members for authorization, so this is safe to apply on its own and
-- safe to leave applied.
--
--
-- BACKUP — NOT TAKEN. Recorded here rather than glossed over.
--
-- The standing rule for HIGH RISK tasks (IMPLEMENTATION_PLAN.md lines 114-121)
-- is: dump, verify the dump restores, confirm PITR and note the timestamp,
-- record row counts. Three of those four could not be done, and no substitute
-- was invented:
--
--   · No dump. `supabase db dump` runs pg_dump in a container and Docker
--     Desktop is not running; the --db-url form needs a connection string that
--     is not available here. The prescribed command, for when it is:
--       supabase db dump --linked -f backups/pre-m3-03-$(date +%Y%m%d-%H%M).sql
--   · No PITR. It is not enabled on this project (see CLAUDE.md), so there is
--     no recovery target to note.
--   · No before/after row counts. The only credential available is the anon
--     key, whose reads are RLS-filtered, so `count(*) from boards` is not
--     obtainable from here. Run the queries at the bottom of this file with
--     SQL access and record the numbers.
--
-- What makes applying it anyway defensible, stated so the judgement is
-- auditable rather than implied: this migration modifies no existing row. It
-- inserts into a table that is empty and that nothing reads, and it updates
-- and deletes nothing in any other table. Its rollback is the three statements
-- at the bottom, not a restore — so the recovery path a dump would provide is
-- not the recovery path this change would use. The HIGH RISK label is earned
-- by the consequence of getting it wrong — a board missed here is a board its
-- owner loses at M3-04 — which verification catches and a dump does not.
--
-- This reasoning does NOT carry to M3-04 or M3-05. Those replace policies and
-- can lock users out of live data, where a dump and PITR are the recovery
-- path. Resolve the backup gap before them.
--
--
-- WHY THIS ORDER: function, then trigger, then backfill.
--
-- All three run in one transaction, so they commit together or not at all and
-- no observable state has the trigger without the backfill. The order still
-- matters, for concurrency:
--
--   CREATE TRIGGER takes SHARE ROW EXCLUSIVE on boards, which conflicts with
--   the ROW EXCLUSIVE an INSERT holds. Taking that lock BEFORE the backfill
--   reads means every board is covered by exactly one mechanism:
--
--     · committed before the lock        → the backfill's snapshot sees it
--     · in flight when we ask for the lock → CREATE TRIGGER waits for it to
--       commit, then the backfill sees it
--     · attempted after the lock         → blocks until we commit, by which
--       time the trigger exists and fires for it
--
--   Backfill-first would leave a real gap: a board committing between the
--   backfill's snapshot and the lock acquisition is seen by neither. Small
--   window, unbounded consequence.


-- 1. The trigger function ------------------------------------------------------
--
-- SECURITY DEFINER is what makes this work without opening a policy.
-- board_members has RLS enabled (M3-01) and deliberately has no INSERT policy
-- — memberships are not self-service. A trigger function runs as the invoking
-- user by default, so as SECURITY INVOKER this insert would be checked against
-- the INSERT policies, find none, and fail with 42501: every board creation
-- would break. As DEFINER it executes as the function's owner, which owns
-- board_members, and RLS is not applied to a table's owner. So the membership
-- is written by the one writer that is allowed to, and the client-facing write
-- surface on board_members stays at zero.
--
-- SET search_path = '' for the reason every definer-rights function needs it:
-- the body runs with the owner's privileges, and if unqualified names resolved
-- through the caller's search_path, a caller able to create a schema could
-- shadow `board_members` and have an owner-privileged function write into
-- their table instead. Pinned to the empty string nothing resolves implicitly,
-- which is why every reference below is schema-qualified.
--
-- Nothing here is taken from client input. board_id and user_id come from NEW,
-- and the role is the literal 'owner'. There is no argument through which a
-- caller could ask for a role on a board that is not theirs — the worst a
-- caller can do is create a board they already own and become its owner.
--
-- ON CONFLICT DO NOTHING because the trigger and the backfill below must be
-- able to touch the same board without either failing, and because a future
-- writer that inserts its own membership row (M4-03) must not collide.

create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.board_members (board_id, user_id, role, joined_at)
  values (new.id, new.owner_id, 'owner', new.created_at)
  on conflict (board_id, user_id) do nothing;

  -- AFTER ROW triggers ignore the return value; null is the convention.
  return null;
end;
$$;

comment on function public.add_owner_membership() is
  'Gives every new board an owner membership for its owner_id. SECURITY '
  'DEFINER so the insert bypasses RLS on board_members, which has no INSERT '
  'policy by design. This is the only writer that mints a board''s first '
  'membership — the row cannot be authorized by membership, because there is '
  'none yet.';

-- EXECUTE is granted to PUBLIC by default. This is a trigger function and has
-- no business being reachable as an RPC, so take it away from every client
-- role. Defence in depth rather than a hole being closed: a function returning
-- `trigger` cannot be invoked directly — Postgres rejects it with "trigger
-- functions can only be called as triggers" — and PostgREST does not expose
-- one. The trigger itself is unaffected; it runs as the definer regardless of
-- who may execute the function.

revoke all on function public.add_owner_membership()
  from public, anon, authenticated;


-- 2. The trigger ---------------------------------------------------------------
--
-- AFTER INSERT, not BEFORE, for three reasons in increasing order of how much
-- they would hurt:
--
--   · NEW is final. joined_at is copied from new.created_at, and AFTER sees
--     the row as actually stored, including anything a BEFORE trigger changed.
--
--   · The board row exists. board_members.board_id references boards(id).
--     Postgres implements that check as an after-row trigger fired at the end
--     of the statement, so a BEFORE-trigger insert would probably survive it —
--     but "probably, by a timing subtlety" is not the basis for a foreign key.
--     AFTER removes the question.
--
--   · It only fires if the insert actually happened. A BEFORE trigger is for
--     modifying NEW or vetoing the row, and if any BEFORE trigger ever returns
--     NULL the insert is skipped — a membership written from BEFORE would
--     already exist, for a board that does not.
--
-- FOR EACH ROW because the values come from NEW.

create trigger boards_add_owner_membership
  after insert on public.boards
  for each row
  execute function public.add_owner_membership();


-- 3. Backfill ------------------------------------------------------------------
--
-- The plan's task, verbatim: "Every existing board gets an `owner` row for its
-- owner_id."
--
-- joined_at is boards.created_at rather than now(). M3-07 renders a joined
-- date; stamping today on a board created months ago is a visible falsehood,
-- and the owner did join when the board came into existence. It also matches
-- what the trigger writes, so backfilled and triggered rows are consistent.
--
-- The insert cannot fail on the foreign keys: boards.owner_id is NOT NULL and
-- references profiles(id), which is the same table board_members.user_id
-- references, so every board necessarily names a profile that exists.
--
-- ON CONFLICT DO NOTHING makes this statement idempotent — it absorbs a row
-- the trigger has already written, and re-running it is a no-op. The CREATE
-- TRIGGER above is not re-runnable, so the migration as a whole is applied
-- once, as migrations are.

insert into public.board_members (board_id, user_id, role, joined_at)
select b.id, b.owner_id, 'owner', b.created_at
from public.boards b
on conflict (board_id, user_id) do nothing;


-- Rollback ----------------------------------------------------------------------
--
--   drop trigger if exists boards_add_owner_membership on public.boards;
--   drop function if exists public.add_owner_membership();
--   delete from public.board_members;
--
-- Clean, and in that order — dropping the trigger first stops new rows
-- arriving between the delete and the drop. Purely additive means reversal
-- destroys nothing that existed before this migration: board_members was
-- empty, and no other table is touched. It stops being clean at M3-04, whose
-- policies read this table; from that point the delete locks everyone out.


-- Verification --------------------------------------------------------------------
--
--   -- the plan's test, line 998. Must be 0.
--   select count(*) from boards b
--   where not exists (
--     select 1 from public.board_members m
--     where m.board_id = b.id and m.role = 'owner'
--   );
--
--   -- 0 orphans does not rule out over-insertion. These do:
--   select (select count(*) from public.boards)        as boards,
--          (select count(*) from public.board_members) as members;  -- equal
--   select role, count(*) from public.board_members group by role;  -- all owner
--   select count(*) from public.board_members m
--     join public.boards b on b.id = m.board_id
--    where m.user_id <> b.owner_id;                                 -- 0
--
--   -- the trigger, which the backfill cannot prove:
--   -- create a board in the UI, then re-run the plan's test. Still 0.
--
--   -- M3-02's helpers, untestable until now because the table was empty:
--   curl -X POST "$URL/rest/v1/rpc/board_role" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
--     -H "Content-Type: application/json" -d '{"p_board_id":"<my board>"}'
--   -- expect "owner" for the board's owner, null for a second account.
--
-- Record the boards and board_members counts before and after in the PR, per
-- the standing rule for HIGH RISK tasks.
