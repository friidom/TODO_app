-- M24-A · Story point estimate, the constraint. SAFE. Tier A.
--
-- `todos.estimate numeric` has existed since M2-03
-- (`20260806092902_todos_task_fields.sql`) and has never had a reader or a
-- writer: M5-07 excluded it from the board query as "a number rendered by
-- nothing", and M20 records that it "means points or hours depending on who
-- filled it in" without resolving which. M24 resolves that — story points,
-- not hours or a duration — and gives the column its first constraint.
--
-- This migration is the constraint only. It adds no column and changes no
-- application read path; `TODO_FIELDS` / `TODO_LIST_FIELDS` widen in the same
-- commit, in code, and need no migration of their own.


-- 1. The constraint -----------------------------------------------------------
--
-- `estimate is null or estimate >= 0` rather than `estimate >= 0` alone: a
-- CHECK evaluates to NULL — not FALSE — for a NULL input, and Postgres only
-- rejects an explicit FALSE, so the bare form would already have let NULL
-- through. It is written out anyway, the same way `todos_date_range_check`
-- spells out its NULL branches, so "unestimated is allowed" is a stated fact
-- here rather than something a future reader has to know about three-valued
-- logic to notice.
--
-- No upper bound and no scale (no "must be a Fibonacci number"). The column
-- stays free `numeric` — half-points and values outside a Fibonacci sequence
-- are real inputs a team can choose to allow, and pinning a scale in the
-- database means a migration every time a team disagrees with it. A UI
-- quick-pick is the right place for that opinion, not a CHECK.
--
-- Drop-then-add, matching every other constraint in this schema: naming it
-- explicitly pins the name Postgres would otherwise generate, and the
-- drop-if-exists makes the migration replayable.

alter table public.todos drop constraint if exists todos_estimate_check;

alter table public.todos
  add constraint todos_estimate_check
  check (estimate is null or estimate >= 0);


-- 2. What is deliberately NOT changed ------------------------------------------
--
-- The column itself. Already nullable numeric; NULL keeps meaning "no
-- estimate", not zero — every rollup this wave adds (M27's subtask sum, M28's
-- epic total, M30's sprint commitment) has to keep that distinction rather
-- than silently summing NULL as 0.
--
-- RLS and grants. `estimate` is covered by the existing whole-row policies
-- exactly like `priority` and `type` — M3-05 gates INSERT/UPDATE/DELETE on
-- `board_role(board_id)`, and policies are not per-column. An editor may set
-- an estimate because an editor may edit the card.
--
-- No index. Nothing filters or sorts server-side by estimate; M24's sort is
-- client-side over the already-cached board array, like every other
-- `SORT_KEYS` entry.
--
-- No backfill. Every existing row is NULL, and NULL already means
-- "unestimated" under this constraint — there is nothing to populate.


-- Rollback ----------------------------------------------------------------------
--
-- Forward-fix in a NEW migration:
--
--   alter table public.todos drop constraint if exists todos_estimate_check;
--
-- Reversible with no data loss: the column and its values are untouched
-- either way, only the constraint goes.


-- Verification --------------------------------------------------------------------
--
--   -- the constraint exists
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.todos'::regclass and conname = 'todos_estimate_check';
--   -- expect: todos_estimate_check | CHECK ((estimate IS NULL) OR (estimate >= 0))
--
--   -- NULL still passes (unestimated)
--   update public.todos set estimate = null where id = '<a card>';   -- expect: 1 row
--
--   -- zero and a positive value pass
--   update public.todos set estimate = 0 where id = '<a card>';      -- expect: 1 row
--   update public.todos set estimate = 5 where id = '<a card>';      -- expect: 1 row
--
--   -- a negative value is rejected
--   update public.todos set estimate = -1 where id = '<a card>';
--   -- expect: new row for relation "todos" violates check constraint "todos_estimate_check"
--
-- No `npm run db:types` step needed afterward: `estimate: number | null` is
-- already in `src/types/database.ts` from M2-03, and a CHECK constraint does
-- not change a column's generated TypeScript type.
