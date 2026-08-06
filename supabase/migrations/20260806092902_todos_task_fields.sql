-- M2-03 · Add the task fields docs/DATABASE.md specifies for todos.
--
-- DATABASE.md lists fourteen fields on todos; nine of them did not exist.
-- M2-02 added the ninth (board_id); this migration adds the remaining eight.
--
-- Every column is nullable or defaulted, nothing reads them yet, and no
-- existing behaviour depends on them, so the running app is unchanged. The UI
-- for these lands in M5 — they are added now, while the table is already being
-- rewritten, because adding them later means doing it after comments and
-- attachments hold foreign keys into todos.
--
-- Constraints follow the drop-then-add shape already used in
-- add_column_limits.sql: `add column if not exists` skips the whole statement
-- when the column is present, which would silently skip an inline constraint
-- too. Naming them explicitly also pins the names Postgres would otherwise
-- generate, so the generated TypeScript relationships stay stable.


-- 1. Plain task fields -------------------------------------------------------
--
-- `archived` is the only NOT NULL of the group. Adding NOT NULL together with
-- a default is a catalog-only change in Postgres 11+ (the "fast default"
-- optimisation) — existing rows are not rewritten, they read false until they
-- are next written.
--
-- `updated_at` is deliberately bare: no default, no trigger. M2-04 adds the
-- shared moddatetime-style trigger that maintains it across boards, columns
-- and todos. Until then it stays NULL, which is why M6 cannot rely on it yet.

alter table public.todos add column if not exists description text;
alter table public.todos add column if not exists priority    text;
alter table public.todos add column if not exists due_date    timestamptz;
alter table public.todos add column if not exists estimate    numeric;
alter table public.todos add column if not exists archived    boolean not null default false;
alter table public.todos add column if not exists updated_at  timestamptz;


-- 2. Priority constraint -----------------------------------------------------
--
-- The five levels DATABASE.md defines. `priority` is nullable and NULL is not
-- rejected here: a CHECK evaluates to NULL for a NULL input, and Postgres
-- treats only an explicit false as a violation. That is intended — priority is
-- optional, "unset" is a real state, and it is distinct from 'medium'.

alter table public.todos drop constraint if exists todos_priority_check;

alter table public.todos
  add constraint todos_priority_check
  check (priority in ('lowest', 'low', 'medium', 'high', 'highest'));


-- 3. People ------------------------------------------------------------------
--
-- `on delete set null` implements DATABASE.md's rule that deleting a user
-- preserves the tasks they created: the task survives, it just stops naming an
-- author. This is the opposite choice from boards.owner_id in M2-01, which
-- cascades — a board with no owner is unreachable by any policy, whereas a
-- task with no creator is merely unattributed.
--
-- Both columns are NULL on every existing row, so validating these foreign
-- keys scans nothing meaningful and the lock is brief.
--
-- creator_id stays NULL until M2-06 backfills it from todos.user_id. That
-- backfill has to happen before M2-13 drops user_id, because dropping it
-- destroys the only record of who created each task.

alter table public.todos add column if not exists creator_id  uuid;
alter table public.todos add column if not exists assignee_id uuid;

alter table public.todos drop constraint if exists todos_creator_id_fkey;
alter table public.todos
  add constraint todos_creator_id_fkey
  foreign key (creator_id) references public.profiles(id) on delete set null;

alter table public.todos drop constraint if exists todos_assignee_id_fkey;
alter table public.todos
  add constraint todos_assignee_id_fkey
  foreign key (assignee_id) references public.profiles(id) on delete set null;


-- Grants and RLS -------------------------------------------------------------
--
-- Both untouched. The grants on todos are table-level, so they extend to
-- columns added later without a new GRANT, and M0-07's table-level revoke of
-- anon still holds. The policies filter on user_id and are unaffected.
--
-- No indexes here: the index set for this milestone is M2-05, and it does not
-- call for one on creator_id or assignee_id. Adding them speculatively would
-- cost writes for reads no query makes yet.


-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, put the following in a NEW migration:
--
--   alter table public.todos drop constraint if exists todos_assignee_id_fkey;
--   alter table public.todos drop constraint if exists todos_creator_id_fkey;
--   alter table public.todos drop constraint if exists todos_priority_check;
--
--   alter table public.todos drop column if exists assignee_id;
--   alter table public.todos drop column if exists creator_id;
--   alter table public.todos drop column if exists updated_at;
--   alter table public.todos drop column if exists archived;
--   alter table public.todos drop column if exists estimate;
--   alter table public.todos drop column if exists due_date;
--   alter table public.todos drop column if exists priority;
--   alter table public.todos drop column if exists description;
--
-- Free to reverse while these columns hold no data. After M2-06 backfills
-- creator_id, dropping that column discards authorship permanently.
