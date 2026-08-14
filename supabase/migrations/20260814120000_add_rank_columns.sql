-- M6-01 · Fractional rank on todos and columns. HIGH RISK (expand). Tier A.
--
-- The first of the three migrations that replace dense integer ordering. This
-- one only adds; nothing reads `rank` until the client deploy that follows the
-- backfill, and nothing writes it until then either.
--
--
-- WHY THE ORDERING MODEL IS BEING REPLACED
--
-- `todos.position` and `columns.position` are dense integers, so moving one
-- card renumbers every card in both affected columns and writes all of them.
-- With one editor that is merely wasteful. With two it is silent data loss:
-- each client renumbers from its own snapshot and the whole array is
-- last-write-wins, so B's drag does not conflict with A's — it overwrites it,
-- including cards B never touched.
--
-- That is why the plan puts the ordering migration ahead of any realtime
-- channel (M6-B). A fractional rank makes a move a **single-row write** to the
-- card that moved, which is a conflict only when two people move the same card.
--
--
-- WHY `double precision` AND NOT `numeric` OR A LEXICOGRAPHIC STRING
--
-- The operation is "give me a value strictly between these two". A float gives
-- it in one arithmetic step, and the failure mode is bounded and known: about
-- 50 consecutive midpoint insertions between the same two neighbours before the
-- mantissa runs out and the midpoint equals one of them. That is precisely the
-- exhaustion M6-06's rebalance exists to absorb, and the client detects it
-- before writing rather than discovering a collision afterwards.
--
-- `numeric` would postpone exhaustion at the cost of unbounded digit growth and
-- a rebalance that is still needed for length; a LexoRank-style string trades
-- arithmetic for a string algorithm and an index on text. Neither buys anything
-- the rebalance does not already have to provide.


-- 1. The columns ------------------------------------------------------------------
--
-- Nullable, deliberately, and it stays nullable through this milestone. NOT NULL
-- belongs to the contract phase (M6-05) alongside dropping `position`, and
-- adding it here would mean the backfill and the constraint in one migration —
-- exactly what Rule 3 forbids.
--
-- No default. A constant default is meaningless for an ordering value: every
-- row would tie. Ranks come from the backfill, then from the client.

alter table public.todos
  add column if not exists rank double precision;

alter table public.columns
  add column if not exists rank double precision;

comment on column public.todos.rank is
  'Fractional order within a column (M6-A). Replaces the dense integer '
  'position, which is still written by the insert path until M6-05 drops it.';

comment on column public.columns.rank is
  'Fractional order within a board (M6-A).';


-- 2. Indexes ----------------------------------------------------------------------
--
-- The board query reads every card for a board and orders them; the column
-- query does the same per board. These match the shape of both reads, and they
-- replace nothing — the M2-05 position indexes stay until M6-05, because
-- `position` is still what the app orders by until the client deploy lands.

create index if not exists todos_column_id_rank_idx
  on public.todos (column_id, rank);

create index if not exists columns_board_id_rank_idx
  on public.columns (board_id, rank);


-- 3. Rollback ---------------------------------------------------------------------
--
-- Free, and it stays free until the backfill runs:
--
--   drop index if exists public.todos_column_id_rank_idx;
--   drop index if exists public.columns_board_id_rank_idx;
--   alter table public.todos   drop column rank;
--   alter table public.columns drop column rank;
--
-- Nothing reads or writes the column at this point, so dropping it cannot
-- affect a single row of application data.
