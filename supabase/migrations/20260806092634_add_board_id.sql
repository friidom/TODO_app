-- M2-02 · Add nullable board_id to columns and todos, expand phase.
--
-- Second step of the Milestone 2 ownership migration. Both columns are
-- nullable and carry no foreign key, so every existing row keeps a NULL
-- board_id and nothing in the running app changes: ownership is still
-- decided by user_id, and no query reads board_id yet.
--
-- Deliberately NOT in this migration, per the expand -> backfill -> contract
-- rule in docs/IMPLEMENTATION_PLAN.md:
--
--   * the backfill that points existing rows at a board   -> M2-06
--   * NOT NULL and the foreign keys to boards.id          -> M2-07
--   * the indexes on columns(board_id, position) and
--     todos(board_id)                                     -> M2-05
--
-- Splitting them is the point. While board_id is nullable and unconstrained
-- this migration is reversible with a single DROP COLUMN and cannot fail on
-- pre-existing data; the moment a NOT NULL lands it can, and reversing stops
-- being free.

-- Adding a nullable column with no default is a catalog-only change in
-- Postgres 11+ — no table rewrite, just a brief ACCESS EXCLUSIVE lock to
-- update the catalog.

alter table public.columns add column if not exists board_id uuid;
alter table public.todos   add column if not exists board_id uuid;


-- Grants and RLS -------------------------------------------------------------
--
-- Both untouched, and both already cover the new column.
--
-- The grants on these tables are table-level (and M0-07's revoke of anon was
-- table-level too), so they extend to columns added later — no new GRANT is
-- needed and no anonymous access is reintroduced.
--
-- The policies filter on user_id and do not mention board_id, so they behave
-- exactly as before. M2-08 rewrites them in terms of board ownership, but only
-- after M2-06 has given every row a board to be owned through — a policy
-- keyed on board_id while board_id is still NULL everywhere would deny every
-- row to everyone.


-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, put the following in a NEW migration:
--
--   alter table public.columns drop column if exists board_id;
--   alter table public.todos   drop column if exists board_id;
--
-- Free to reverse until M2-06 writes data into these columns; after that,
-- dropping them discards the board mapping.
