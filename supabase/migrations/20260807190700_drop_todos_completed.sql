-- M2-15 · Drop todos.completed, retire clearCompleted. MEDIUM RISK. BREAKING.
--
-- Two competing sources of truth for one concept, and they were already out of
-- sync: dragging a card into a Done column never set `completed`. The board has
-- always derived doneness from the column's category — `categoryOf(column) ===
-- 'done'` — so this column was write-only, and only ever written as `false`.
--
-- The visible consequence: clearCompleted() deleted `where completed = true`,
-- which matched nothing, so the feature had been silently dead. It is removed
-- with the column rather than repaired against it, because docs/DATABASE.md
-- lists no such field: *"Never store duplicated information."*
--
-- `todos.status` is a different dead column and is left alone — it is not the
-- board's completion signal either, but it is out of scope here.

alter table public.todos drop column completed;


-- Rollback --------------------------------------------------------------------
--
--   alter table public.todos add column completed boolean default false;
--
-- restores the shape and loses nothing real: every surviving row held `false`,
-- and the column that actually decides doneness is columns.category. This is
-- the one contraction in M2 that is effectively reversible.


-- Verification -----------------------------------------------------------------
--
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'todos'
--     and column_name = 'completed';
--   -- expect: 0 rows
--
-- Then in the browser: cards in a Done column still read as done, and the
-- green done-flash still fires when a card is dragged into one.
