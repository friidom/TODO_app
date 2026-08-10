-- M3-01 · Create board_members. SAFE.
--
-- The table that makes "who can touch this board" a question with an answer
-- other than "the owner". Nothing reads it yet: no policy references it, no
-- helper queries it, no frontend fetches it. Purely additive, so the running
-- application is unaffected.
--
-- The sequence it opens (docs/IMPLEMENTATION_PLAN.md, Milestone 3):
--
--   M3-01  this table                                 ← you are here
--   M3-02  is_board_member / board_role helpers, SECURITY DEFINER
--   M3-03  backfill an owner row for every existing board
--   M3-04  boards RLS via the helpers
--   M3-05  columns and todos RLS via the helpers
--
-- M3-03 must land before M3-04/M3-05 or the new policies lock every existing
-- owner out of their own board — the table is empty until then.


-- 1. The table ----------------------------------------------------------------
--
-- Both foreign keys cascade, matching boards.owner_id: deleting a board takes
-- its memberships with it, and deleting a profile takes that person's
-- memberships. Neither leaves a row no policy can reach.
--
-- The primary key is the uniqueness rule, not a surrogate id: one person holds
-- one role on one board. A serial id would permit two rows for the same pair
-- and make "what is this user's role here" a question with two answers.
--
-- `role` has no default. A membership without an explicit role is a bug at the
-- call site, and 'viewer' as a default would silently paper over it.

create table if not exists public.board_members (
  board_id  uuid not null references public.boards(id)   on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

comment on table public.board_members is
  'Who may access which board, and as what. From M3-04 this table is the '
  'authorization source for boards, columns and todos — always via the '
  'SECURITY DEFINER helpers, never by sub-selecting it from a policy.';


-- 2. Index --------------------------------------------------------------------
--
-- One index, not two. The primary key already builds a btree on
-- (board_id, user_id), whose leading column serves every board_id lookup —
-- "who is on this board", and the membership check the M3-02 helpers perform.
-- A separate index on board_id would duplicate that for no read benefit and a
-- write cost on every membership change.
--
-- user_id is the direction the PK cannot serve: "which boards am I on", which
-- is what M3-04 turns the boards list into.

create index if not exists board_members_user_id_idx
  on public.board_members (user_id);


-- 3. Row-level security -------------------------------------------------------
--
-- ⚠ THE RECURSION TRAP — the reason this policy looks the way it does.
--
-- A policy on board_members that sub-selects board_members ("I may read this
-- row if I am a member of its board") recurses infinitely in Postgres and
-- surfaces as a hard 500 on every read. The remedy is the M3-02 helpers:
-- SECURITY DEFINER, which bypasses RLS on the tables they read and so breaks
-- the cycle. That remedy has to be in place BEFORE any policy needs it.
--
-- So this policy needs nothing: user_id is a column of the row being checked,
-- compared against auth.uid() directly. No sub-select, nothing to recurse
-- into. It is the minimum that lets a user answer "what are my memberships"
-- and is deliberately narrower than M3 ends up needing — M3-07's member list
-- wants everyone on a shared board, and that widening is what routes through
-- public.is_board_member(). Adding it here, before the helper exists, is
-- exactly how the outage happens.
--
-- auth.uid() is wrapped in a scalar sub-select so the planner evaluates it
-- once per statement as an InitPlan rather than once per row — the pattern
-- M2-08 established for accessible_board_ids().
--
-- INSERT, UPDATE and DELETE get no policy at all. With RLS enabled and no
-- permissive policy for a verb, that verb is denied — memberships are not
-- self-service. They arrive through M3-03's backfill (which runs as the
-- migration role and is not subject to RLS) and later through M3-08's role
-- management, which brings the write policies it needs along with it.

alter table public.board_members enable row level security;

drop policy if exists "Users select own memberships" on public.board_members;
create policy "Users select own memberships" on public.board_members
  for select to authenticated
  using (user_id = (select auth.uid()));


-- Rollback ---------------------------------------------------------------------
--
--   drop table if exists public.board_members;
--
-- Clean while this is the last M3 migration applied: nothing references the
-- table. It stops being clean at M3-02, whose helpers read it, and at M3-04,
-- whose policies depend on those helpers.


-- Verification ------------------------------------------------------------------
--
--   -- shape
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'board_members';
--
--   -- the check constraint rejects an unknown role
--   insert into public.board_members (board_id, user_id, role)
--   values ('<board>', '<user>', 'admiral');   -- expect: check violation
--
--   -- one role per person per board
--   insert into public.board_members (board_id, user_id, role)
--   values ('<board>', '<user>', 'editor');    -- twice; expect: PK violation
--
-- Then as an authenticated user, per the plan's test: insert a membership for
-- yourself and select from the table — your row comes back, and a membership
-- belonging to someone else does not.
