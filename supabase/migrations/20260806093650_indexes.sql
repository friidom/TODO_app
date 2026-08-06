-- M2-05 · The indexes docs/DATABASE.md specifies.
--
-- Deliberately ahead of the RLS rewrite in M2-08. Those policies reach the
-- board to decide whether a row is visible, and that predicate is evaluated
-- per row — unindexed, every board load degrades into a sequential scan per
-- policy check. The same indexes also back the foreign keys M2-07 adds:
-- Postgres does not create an index for a foreign key, and a cascading delete
-- on boards has to find the referencing rows in columns and todos.
--
-- DATABASE.md's index list also names comments(todo_id), activities(todo_id),
-- board_members(user_id) and board_members(board_id). Those tables do not
-- exist yet — they arrive with M3 and M5 — and each index belongs in the
-- migration that creates its table, per the rule that a table ships with the
-- objects that protect and serve it.
--
-- Existing indexes are left alone. todos_user_id_idx and columns_user_id_idx
-- (M0-07) still back the live policies and fetchTodos' user_id filter; they
-- stop being load-bearing when M2-08 rewrites the policies and become dead
-- when M2-13 drops user_id. Dropping them is that task's business, not this
-- one's.
--
-- All created non-concurrently, matching the reasoning recorded in M0-07:
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and the
-- Supabase CLI wraps each migration file in one. The task allows CONCURRENTLY
-- "if the tables have meaningful size" — these tables hold one user's board,
-- so the brief ACCESS EXCLUSIVE lock is cheaper than splitting this into a
-- transaction-less migration. Revisit if this ever runs against a populated
-- production database.


-- 1. boards(owner_id) --------------------------------------------------------
--
-- Already created by M2-01, which was told to add it alongside the table. This
-- is a no-op guard, written out so the four indexes the task lists all appear
-- here rather than three appearing and one going unexplained.

create index if not exists boards_owner_id_idx
  on public.boards (owner_id);


-- 2. columns(board_id, position) ---------------------------------------------
--
-- The board-load query: every column of one board, in order. board_id leads
-- because it is the equality predicate; position follows so the sort is read
-- off the index rather than performed.
--
-- The leading column also serves the FK M2-07 adds from columns.board_id to
-- boards.id, which cascades on delete.

create index if not exists columns_board_id_position_idx
  on public.columns (board_id, "position");


-- 3. todos(column_id, position) ----------------------------------------------
--
-- The same shape one level down, and the index the current application would
-- already have benefited from: useTodosByColumns groups and position-sorts the
-- flat todos array client-side, but deleteColumn rehomes a column's todos
-- server-side, and the existing todos_column_id_fkey has no index behind it —
-- so that path has been scanning the whole table to find a column's cards.
--
-- `position` is quoted throughout: it is a reserved word in SQL, and while
-- Postgres accepts it bare in this context, the baseline schema quotes it and
-- being inconsistent about which identifiers are quoted is how a later
-- migration ends up referring to a column that does not exist.

create index if not exists todos_column_id_position_idx
  on public.todos (column_id, "position");


-- 4. todos(board_id) ----------------------------------------------------------
--
-- Single-column, not composite: todos are ordered within a column, never
-- within a board, so there is no position to append. This serves the
-- board-scoped fetch M2-11 introduces and the cascade from the
-- todos.board_id foreign key in M2-07.

create index if not exists todos_board_id_idx
  on public.todos (board_id);


-- Verification ---------------------------------------------------------------
--
-- The task asks for EXPLAIN ANALYZE of the board-load query before and after,
-- recorded in the PR. That has to be run against a live database once this is
-- applied; it cannot be captured from the migration file. The query to plan is
-- the pair the board issues:
--
--   explain analyze
--   select * from public.columns where board_id = '<id>' order by position;
--
--   explain analyze
--   select * from public.todos   where board_id = '<id>';
--
-- Expect Seq Scan before and Index Scan after on a table with enough rows to
-- make the planner prefer one; on a near-empty table the planner will keep
-- choosing a sequential scan and that is correct behaviour, not a missing
-- index.


-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, put the following in a NEW migration:
--
--   drop index if exists public.todos_board_id_idx;
--   drop index if exists public.todos_column_id_position_idx;
--   drop index if exists public.columns_board_id_position_idx;
--
-- boards_owner_id_idx is not listed: this migration did not create it, M2-01
-- did, and reversing this task should not remove an index another task owns.
--
-- Dropping an index is always safe for correctness — it costs query time, it
-- cannot lose data. But do not drop these while the M2-07 foreign keys or the
-- M2-08 policies are in place: both depend on them for anything better than a
-- sequential scan per row.
