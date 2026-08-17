-- M20 · Add todos.start_date — the column the Timeline is built on.
--
-- The plan states this migration plainly and it is the only schema change the
-- 2026-08-14 direction forces: "todos.start_date is required. Today the row has
-- due_date and estimate. There is no start, so there is no range, so there is
-- no bar to draw." Two other shapes were considered and rejected there — a
-- duration (the end date becomes derived, and every reader recomputes it) and a
-- work_item_schedule child table (a second set of policies, cache functions and
-- realtime handlers, permanently, to hold two dates).
--
--
-- THE TYPE — timestamptz, not date, and this is a correction to the plan
-- ---------------------------------------------------------------------------
--
-- The plan says `todos.start_date date null`, and gives its reason for the
-- recommended shape as: "Reuses the type, the control idiom and the timezone
-- rule due_date already established." That reason is what is being followed
-- here; the literal word `date` is not, because the premise behind it is false.
--
-- **due_date is timestamptz** (20260806092902_todos_task_fields.sql), and has
-- been since M2-03. The plan was written believing it was a `date` — Appendix D
-- even calls it "the date-not-timestamptz rule" — and M19 surfaced the
-- discrepancy while building the calendar, which is precisely the job M20's
-- dependency line gave M19: "needs Calendar to have already surfaced whatever
-- M16 got wrong about dates."
--
-- So "reuse the type due_date established" resolves to timestamptz, and mixing
-- the two would be worse than a stylistic inconsistency:
--
--   1. The range's two ends would need two different read paths. Everything in
--      the app converts a stored due date with `toCalendarDay` and writes one
--      with `fromCalendarDay` (midnight UTC, sliced back out in UTC). A `date`
--      column round-trips differently, so every reader of a range would have to
--      remember which end is which — the exact trap the M19 timezone rule
--      exists to close.
--
--   2. **The CHECK below could not be created at all.** Comparing `date` with
--      `timestamptz` promotes the date using the session's TimeZone setting, so
--      the comparison is STABLE rather than IMMUTABLE — and Postgres refuses a
--      non-immutable expression in a check constraint. Even if it were allowed,
--      a constraint whose truth depends on a GUC is a constraint that accepts a
--      row from one connection and rejects it from another: with TimeZone set
--      west of UTC, start_date '2026-08-13' promotes to 2026-08-13T04:00Z and
--      is no longer <= a due_date stored as 2026-08-13T00:00Z, so a task that
--      starts and ends on the same day would be rejected.
--
-- The convention is therefore due_date's, unchanged and now shared: **a date is
-- midnight UTC, and the day is read back in UTC.** utils/dueDate.ts carries the
-- full reasoning and both columns go through it.
--
--
-- BLAST RADIUS
-- ---------------------------------------------------------------------------
--
-- Tier A. Additive, nullable, no default, no backfill, no data written. Every
-- existing row gets NULL, which the constraint's first branch admits, so the
-- validation scan cannot fail. Nothing reads the column until the same commit's
-- client change ships, and nothing writes it until a user picks a start date.
--
-- The ADD CONSTRAINT does take a brief ACCESS EXCLUSIVE lock to validate — at
-- this table's size that is milliseconds, which is why it is written as a plain
-- ADD rather than the NOT VALID / VALIDATE CONSTRAINT pair a large table would
-- need.
--
-- Grants and RLS are untouched. The grants on todos are table-level, so they
-- extend to a column added later without a new GRANT (the same note M2-03 made
-- when it added due_date), and every policy filters on board_id.
--
-- No index. Row order on the timeline is derived client-side from rows the
-- board query already fetches in full — the plan's "row order is derived from
-- start_date, never stored" — so no query filters or orders by this column
-- server-side. An index here would cost every write to serve no read.


-- 1. The column ---------------------------------------------------------------

alter table public.todos add column if not exists start_date timestamptz;


-- 2. The range constraint -----------------------------------------------------
--
-- The plan asks for this by name: "cheap here; the alternative is every reader
-- defending against inverted ranges forever."
--
-- Both NULL branches are explicit rather than relying on NULL propagation. A
-- CHECK evaluates to NULL for a NULL input and Postgres treats only an explicit
-- false as a violation, so `start_date <= due_date` alone would already admit a
-- row with one date missing — but writing that out is what makes "a task with
-- only one date is a point, not a violation" a stated rule rather than an
-- accident of three-valued logic.
--
-- Equality is allowed: start = due is a one-day task, which is a range of a
-- single day and the most common shape a small task takes.
--
-- Drop-then-add, the shape every constraint in this repository uses, so the
-- migration is idempotent and the constraint's name is pinned rather than
-- generated (the generated TypeScript relationships key off these names).

alter table public.todos drop constraint if exists todos_date_range_check;

alter table public.todos
  add constraint todos_date_range_check
  check (
    start_date is null
    or due_date is null
    or start_date <= due_date
  );


-- Rollback ---------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, put the following in a NEW migration:
--
--   alter table public.todos drop constraint if exists todos_date_range_check;
--   alter table public.todos drop column if exists start_date;
--
-- Free to reverse while the column is empty. Once users have set start dates,
-- dropping the column discards them permanently and the drop becomes Tier B.
--
--
-- Verification -------------------------------------------------------------------
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'todos'
--      and column_name  = 'start_date';
--   -- expect: start_date | timestamp with time zone | YES
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.todos'::regclass
--      and conname  = 'todos_date_range_check';
--   -- expect the three-branch CHECK above
--
-- And the constraint actually biting, from the client — this must fail with
-- 23514 rather than storing an inverted range:
--
--   update todos set start_date = '2026-09-01T00:00:00Z',
--                    due_date   = '2026-08-01T00:00:00Z'
--    where id = '<some id>';
