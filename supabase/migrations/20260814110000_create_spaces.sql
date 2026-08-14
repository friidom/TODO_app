-- M15 · Spaces, and boards filed into them. MEDIUM RISK. Tier A.
--
-- A space is a folder for boards. That is the whole concept, and keeping it
-- that small is the decision this migration exists to encode.
--
--
-- 0. THE DECISION THIS SCHEMA ENCODES: A SPACE IS NOT A PERMISSION SCOPE
--
-- Appendix B of docs/IMPLEMENTATION_PLAN.md deferred "board-level roles vs.
-- workspace/organisation roles" until workspaces became real. They are real
-- now, and the answer — settled in M14, recorded in Part II under *Permission
-- Model → Decisions* — is NO.
--
-- Membership and roles stay board-scoped. viewer/editor/admin/owner keep
-- meaning exactly what M3 says they mean, `board_role()` is untouched,
-- `accessible_board_ids()` is untouched, and not one policy on `boards`,
-- `columns`, `todos`, `board_members` or `board_invites` changes its access
-- rule. A space grants nothing and revokes nothing.
--
-- The alternative — a space role beside a board role — needs a precedence rule
-- between two systems that can disagree, a second set of privileged RPCs, and a
-- second matrix in Part II. That is a whole authorization system bought for
-- FILING, and Appendix B already names layering one on another as the hardest
-- kind of authorization change to get right.
--
-- What follows from "not a permission scope":
--
--   * `spaces` is owner-only. Its RLS returns a space to the account that
--     created it and to nobody else. There is no roster, no invite, no share.
--   * `boards.space_id` is one person's filing decision about a shared object.
--     A member who does not own the space cannot read the space row, so the
--     board simply appears unfiled to them. Two people can be on one board and
--     see it in two different places, which is correct: it is *their* sidebar.
--   * Deleting a space never deletes a board (section 4).
--   * The one rule this DOES add is section 6: you may only file a board into
--     a space you own.
--
-- Reversible without a rewrite, which is what makes "no" cheap rather than
-- limiting: if spaces later need sharing, `spaces` gains its own membership
-- table and `boards.space_id` keeps working unchanged.


-- 1. The table -------------------------------------------------------------------
--
-- Deliberately four columns. No icon, no colour, no visibility, no position:
-- each is a product decision this milestone has no requirement for, and an
-- unused nullable column is a question every future reader has to ask.
--
-- No `position`. Boards sort by title inside a space and spaces sort by title
-- too — a stored order would be a third ranked surface, and this plan has spent
-- a whole milestone (M6-A) on what ranked surfaces cost. If drag-to-reorder is
-- wanted later it wants M6-A's rank type, not a dense integer added here first.
--
-- `on delete cascade` from profiles, matching `boards.owner_id`: a space is
-- personal filing and outlives nothing. Its boards survive — see section 4.

create table if not exists public.spaces (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Trimmed length, so a title of three spaces is refused rather than stored
  -- and rendered as an empty row in the sidebar. The client trims too; this is
  -- what makes it true for every writer.
  constraint spaces_title_length check (char_length(btrim(title)) between 1 and 60)
);

comment on table public.spaces is
  'A personal folder for boards. NOT a permission scope: owner-only RLS, no '
  'membership, and boards.space_id grants nothing. See M15 in '
  'docs/IMPLEMENTATION_PLAN.md.';

create index if not exists spaces_owner_id_idx
  on public.spaces (owner_id);

-- The M2-04 shared trigger, same as boards, columns and todos.
drop trigger if exists spaces_set_updated_at on public.spaces;
create trigger spaces_set_updated_at
  before update on public.spaces
  for each row execute function public.set_updated_at();


-- 2. RLS: owner only ---------------------------------------------------------------
--
-- Four policies, one predicate. No helper function is needed and none is
-- wanted: `board_role` and `is_board_member` exist because a policy on
-- `board_members` that sub-selects `board_members` recurses. Nothing here
-- sub-selects itself, so the predicate is the column.
--
-- `(select auth.uid())` rather than bare `auth.uid()`, so Postgres evaluates it
-- once as an InitPlan instead of per row — the form every policy in this schema
-- has used since M2-01.

alter table public.spaces enable row level security;

drop policy if exists "Owners select their spaces" on public.spaces;
create policy "Owners select their spaces" on public.spaces
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners insert their spaces" on public.spaces;
create policy "Owners insert their spaces" on public.spaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners update their spaces" on public.spaces;
create policy "Owners update their spaces" on public.spaces
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners delete their spaces" on public.spaces;
create policy "Owners delete their spaces" on public.spaces
  for delete to authenticated
  using (owner_id = (select auth.uid()));


-- 3. Grants ------------------------------------------------------------------------
--
-- The revoke is not redundant, for the reason M3-13 and M4-01 both record: the
-- linked project carries `alter default privileges ... grant all on tables to
-- anon`, so a table created here starts out granted to anon. Revoke first, then
-- grant back exactly the verbs that are wanted.
--
-- Unlike `board_members` and `board_invites`, the client writes this table
-- DIRECTLY — insert, update and delete are granted to `authenticated`. Those
-- two tables route every write through a SECURITY DEFINER RPC because their
-- writes GRANT PRIVILEGE, and an RPC is where a caller's rank is checked.
-- Creating a folder grants nothing to anyone, so there is no rank to check and
-- no escalation to prevent: the owner_id predicate is the whole rule, and RLS
-- states it completely.

revoke all on table public.spaces from anon;
revoke all on table public.spaces from authenticated;

grant select, insert, update, delete on table public.spaces to authenticated;
grant all on table public.spaces to service_role;


-- 4. boards.space_id ----------------------------------------------------------------
--
-- Nullable, and it stays nullable. Rule 3's expand → backfill → contract is
-- three phases when the column must end up NOT NULL; this one must not.
--
-- **Unfiled is a real state, not a migration that has not finished.** A board
-- someone else shared with you sits in no space of yours, and it never will
-- unless you file it. NOT NULL would make that state inexpressible and force
-- every account to own a space before it could be a member of anything.
--
-- Which is also why there is NO BACKFILL. Existing boards stay unfiled and the
-- sidebar renders them under their own heading. A backfill would be an UPDATE
-- against existing rows — Tier B under Rule 6, needing the dump procedure — to
-- pre-make a filing decision on the user's behalf that they can make in one
-- click. It buys nothing and costs the one thing this project cannot currently
-- do safely.
--
-- `on delete set null` is the load-bearing part. A cascade here would let one
-- person deleting their own folder destroy boards that other people are members
-- of — a space is filing, a board is content, and the blast radius of confusing
-- the two is every member of every board inside it.

alter table public.boards
  add column if not exists space_id uuid
  references public.spaces (id) on delete set null;

comment on column public.boards.space_id is
  'Which space the board is filed under, or null for unfiled. Filing only — it '
  'confers no access. Only the space owner may set it (see owns_space).';

-- The sidebar groups every board the caller can reach by this column, so the
-- lookup is by space and it is the read path, not the write path.
create index if not exists boards_space_id_idx
  on public.boards (space_id);


-- 5. owns_space() ---------------------------------------------------------------------
--
-- SECURITY DEFINER for the same reason `is_board_member` is: it is called from
-- inside a policy on ANOTHER table, and the caller must not need read access to
-- `spaces` for the check to be meaningful. An admin filing a board is asking a
-- question about a row RLS will not show them, and the honest answer is "no"
-- rather than "no rows visible, therefore null".
--
-- STABLE, and `set search_path = ''` with everything schema-qualified — the
-- convention every function since M3-02 follows.

create or replace function public.owns_space(p_space_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.spaces s
     where s.id = p_space_id
       and s.owner_id = (select auth.uid())
  );
$$;

comment on function public.owns_space(uuid) is
  'Whether the caller owns this space. For the boards write policies only — a '
  'space confers no board access.';

revoke all on function public.owns_space(uuid) from public;
revoke all on function public.owns_space(uuid) from anon;
grant execute on function public.owns_space(uuid) to authenticated;


-- 6. Only a board's OWNER files it, and only into a space they own -----------------------
--
-- **The only permission rule this milestone adds**, and it is stricter than the
-- one M15 sketched. The sketch said "space_id may only be set to a space the
-- caller owns". That is necessary and it is not sufficient, because `space_id`
-- is ONE column on a SHARED row:
--
--   A owns a board and files it into A's space.
--   B is an admin on it and files it into B's space — legal under "a space you
--   own" — and the column now holds B's space id.
--   A cannot read B's space, so the board has silently left A's sidebar.
--
-- B did not gain access to anything, so it is not an escalation; it is one
-- member rearranging another's sidebar with no way to explain what happened.
-- Adding "and you own the board" removes it completely. A member still sees a
-- board shared with them as unfiled, which is exactly the experience M15
-- describes.
--
-- **The limitation this accepts, stated rather than discovered later:** filing
-- is therefore per-BOARD, not per-USER. Two people on one board cannot each
-- file it in their own folder. Per-user filing is a `space_boards(space_id,
-- board_id)` join table — a strictly larger change, not on any milestone's
-- path, and not built. `boards.space_id` is what M15 specifies.
--
-- **A TRIGGER, NOT A POLICY, AND THE REASON IS EXACT.** WITH CHECK sees only
-- the new row, so a policy cannot ask "did space_id change?" — the same
-- limitation M3-17 §3 records for `owner_id`. A conjunct on M3-17's UPDATE
-- policy would therefore be evaluated on EVERY update, so an admin renaming a
-- board that its owner had filed would be refused for a column they never
-- touched. Comparing OLD to NEW is what a BEFORE trigger is for, and M3-15's
-- owner-immutability triggers are the precedent.
--
-- Consequently **no policy on `boards` is modified by this migration.** M2-01's
-- INSERT and DELETE and M3-17's UPDATE keep their definitions byte for byte.
--
-- SECURITY INVOKER: the only privileged read it needs is inside owns_space(),
-- which is already DEFINER. `auth.uid()` is null under service_role, so
-- provision_new_user() — which creates boards with no space — passes through
-- the null branch untouched.

create or replace function public.boards_space_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Nothing to police unless the filing itself changes. `is not distinct from`
  -- rather than `=` so a null-to-null update is caught too, instead of
  -- evaluating to null and falling through to the checks below.
  if tg_op = 'UPDATE' and new.space_id is not distinct from old.space_id then
    return new;
  end if;

  -- Unfiling is always allowed, for anyone who may update the board at all.
  -- Taking a board out of a space is not an escalation, and it is the only way
  -- out of a filing you did not choose.
  if new.space_id is null then
    return new;
  end if;

  if new.owner_id is distinct from (select auth.uid()) then
    raise exception
      'Only a board''s owner may file it into a space'
      using errcode = '42501';
  end if;

  if not public.owns_space(new.space_id) then
    raise exception
      'A board can only be filed into a space you own'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.boards_space_ownership() is
  'Filing guard for boards.space_id (M15). Fires only when space_id changes, so '
  'M3-17 admin updates to other columns are unaffected.';

drop trigger if exists boards_space_ownership on public.boards;
create trigger boards_space_ownership
  before insert or update on public.boards
  for each row execute function public.boards_space_ownership();


-- 7. What this migration deliberately does NOT touch --------------------------------------
--
--   * The board key. `boards.key_prefix` (M14) and `boards.next_key` (M2-21)
--     are the board's own, so moving a board between spaces cannot renumber or
--     re-label a single card. There is no code path here that reads either.
--   * `board_members`, `board_invites`, and every policy on `columns` and
--     `todos`. A space is not a permission scope, so none of them has anything
--     to say about one.
--   * `accessible_board_ids()` and `board_role()`. Unchanged, uncalled, and the
--     swap point they were built to be stays available.
--   * `boards.archived`. M8-03 asks for archiving and its semantics question —
--     does an archived board disappear for its members too? — is still open.
--     An open question is not a column.
--   * Every policy on `boards`. See section 6: the rule is a trigger precisely
--     so that M2-01's and M3-17's policies keep their exact definitions.


-- 8. Rollback -----------------------------------------------------------------------------
--
-- Forward-fix, in this order. Nothing needs restoring from a prior definition,
-- because nothing was replaced:
--
--   drop trigger if exists boards_space_ownership on public.boards;
--   drop function if exists public.boards_space_ownership();
--   drop function if exists public.owns_space(uuid);
--   alter table public.boards drop column space_id;   -- destroys filing only
--   drop table public.spaces;
--
-- The last two destroy every filing decision and the spaces themselves, so once
-- users have organised anything this stops being a free reversal. No board,
-- column, todo, membership or invite is touched by any of it.


-- 9. Verification ---------------------------------------------------------------------------
--
-- Not run from here — the CLI exposes no arbitrary-SQL path, the limitation
-- M3-16 records. What proves this, at REST level, with two accounts A and B
-- where B is an ADMIN on a board A owns:
--
--   * A creates a space                                        → 201
--   * B selects spaces                                         → [] (not A's)
--   * A files their board into their own space                 → 204
--   * B files that board into a space B owns                   → 42501 (§6)
--   * B files that board into A's space id                     → 42501
--   * B renames the board while it is filed                    → 204 — the
--                                                                 trigger does
--                                                                 not fire on
--                                                                 an unchanged
--                                                                 space_id, and
--                                                                 this is the
--                                                                 case a WITH
--                                                                 CHECK would
--                                                                 have broken
--   * B sets space_id = null                                   → 204
--   * A deletes the space                                      → 204, board
--                                                                 survives with
--                                                                 space_id null
--   * A reads the board's cards                                → keys unchanged
