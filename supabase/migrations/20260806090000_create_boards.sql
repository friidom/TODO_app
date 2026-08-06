-- M2-01 · Create boards, expand phase.
--
-- The first table of the ownership migration. Nothing reads it yet — columns
-- and todos still carry user_id and nothing points at a board — so this is
-- purely additive: the running app is unaffected. See docs/IMPLEMENTATION_PLAN.md
-- Milestone 2 for the full expand -> backfill -> contract sequence this opens.
--
-- Interim RLS: owner-only, mirroring the pattern M0-07 set for columns/todos.
-- M3 replaces this with board_members-based policies once membership exists.

-- `owner_id` delete rule is a decision the plan leaves open. `on delete
-- cascade` matches the convention already in the schema (profiles.id and
-- todos.user_id both cascade from auth.users) and keeps the invariant that a
-- board always has an owner, which the policies below depend on. The
-- alternatives were rejected: `restrict` would make account deletion fail
-- rather than succeed, since profiles already cascades from auth.users; `set
-- null` would require a nullable owner_id and leave orphan boards no policy
-- can reach. Note this means deleting a user destroys the boards they own —
-- DATABASE.md's "preserve created tasks" rule is about tasks on *other
-- people's* boards, which M2-03 handles via `creator_id ... on delete set
-- null`. Revisit in M3, when board_members makes ownership transfer possible.

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  description text,
  icon text,
  cover_color text,
  visibility text not null default 'private'
    check (visibility in ('private', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- Index backing the owner policies below and the "my boards" list query.

create index if not exists boards_owner_id_idx on public.boards (owner_id);


-- Row-level security -----------------------------------------------------
--
-- Same shape as the todos/columns policies from M0-07: four verbs spelled
-- out separately so the upsert paths (an owner renaming or re-theming a
-- board) are checked against an explicit INSERT and an explicit UPDATE
-- policy rather than a single FOR ALL.

alter table public.boards enable row level security;

drop policy if exists "Users select own boards" on public.boards;
create policy "Users select own boards" on public.boards
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Users insert own boards" on public.boards;
create policy "Users insert own boards" on public.boards
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users update own boards" on public.boards;
create policy "Users update own boards" on public.boards
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users delete own boards" on public.boards;
create policy "Users delete own boards" on public.boards
  for delete to authenticated
  using (owner_id = (select auth.uid()));


-- Grants -------------------------------------------------------------------
--
-- The revoke is not redundant. The linked project carries
--
--   alter default privileges for role postgres in schema public
--     grant all on tables to anon;
--
-- (captured in the baseline dump), so a table created here is granted to the
-- publishable key that ships in the client bundle the moment it exists. The
-- policies above are all `to authenticated`, so anon still reads nothing —
-- but M0-07 removed anonymous access on todos and columns deliberately, and a
-- new table should not quietly reintroduce it. Runs after CREATE TABLE
-- because that is when the default privilege fires.
--
-- service_role carries BYPASSRLS and is granted for consistency with the
-- other tables.

revoke all on table public.boards from anon;

grant select, insert, update, delete on table public.boards to authenticated;
grant all on table public.boards to service_role;


-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, put the following in a NEW migration:
--
--   drop policy if exists "Users select own boards" on public.boards;
--   drop policy if exists "Users insert own boards" on public.boards;
--   drop policy if exists "Users update own boards" on public.boards;
--   drop policy if exists "Users delete own boards" on public.boards;
--   drop index if exists public.boards_owner_id_idx;
--   drop table if exists public.boards;
--
-- The anon revoke needs no reversal: dropping the table drops its grants.
--
-- Safe to reverse at this stage: nothing else references boards until M2-02.
