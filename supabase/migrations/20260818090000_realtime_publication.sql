-- M6-07 · Publish todos and columns to supabase_realtime.
--
-- The channel half of M6 (M6-B). M6-A shipped fractional ranks in
-- 20260814120000..122000, which is the precondition the plan states for opening
-- any channel at all: with dense integer positions, every remote event would
-- re-apply a whole-column renumber from the sender's snapshot, which is silent
-- data loss arriving over a socket instead of from a second tab.
--
--
-- VERIFIED LIVE STATE BEFORE WRITING THIS
-- ---------------------------------------------------------------------------
--
-- Not assumed from the absence of a migration. Queried against the linked
-- project (`supabase db query --linked`, no Docker):
--
--   select pubname, puballtables from pg_publication;
--   -- supabase_realtime | false          (exists; NOT "for all tables")
--
--   select schemaname, tablename from pg_publication_tables
--    where pubname = 'supabase_realtime';
--   -- 0 rows                             (nothing was being replicated)
--
--   select relname, relreplident, relrowsecurity from pg_class ...;
--   -- todos    | d | true
--   -- columns  | d | true                (RLS on, replica identity DEFAULT)
--
-- So this migration is the first thing to put any table on the wire, and the
-- publication is a named-table one — adding a table is an explicit act, which
-- is the property worth keeping.
--
--
-- REPLICA IDENTITY STAYS "DEFAULT", AND THAT IS A SECURITY DECISION
-- ---------------------------------------------------------------------------
--
-- The tempting change is `replica identity full`, because it puts every column
-- of the *old* row into UPDATE and DELETE payloads — which would let a
-- subscription filter (`board_id=eq.…`) match a DELETE, since the deleted row's
-- board_id would be on the wire.
--
-- It is not done, because Realtime does not apply RLS to DELETE payloads the
-- way it does to INSERT/UPDATE: an INSERT or UPDATE is checked against the new
-- record, and a DELETE has only the old one. Under `full` that old record is
-- the entire row — title, description, assignee — of a work item on a board the
-- receiving client may have no right to read. Under `default` it is the primary
-- key and nothing else: a uuid, which identifies a row without describing it.
--
-- The client absorbs the consequence instead. `useBoardRealtime` subscribes to
-- DELETE **without** the board filter (a filter on a column that is not in the
-- payload can never match, so filtered deletes would simply never arrive) and
-- removes the id from this board's cached array if it is there. An id belonging
-- to another board is a no-op. This is written down in that file too.
--
--
-- NO COLUMN LIST, AND THE REASON IS THE POLICY MODEL
-- ---------------------------------------------------------------------------
--
-- Postgres 15+ (this project is on 17.6) allows publishing a subset of columns,
-- and the plan asks that "nothing in a payload exposes a column the client could
-- not have read through a query". It does not need a column list to be true:
-- RLS here is row-level, `accessible_board_ids()` decides whole rows, and
-- `fetchTodo` already returns `select("*")` for any row a member can read. So
-- every column of a row a client receives is a column that client could have
-- selected. A list would add a coupling — widen `TODO_FIELDS`, remember to
-- widen the publication — to buy nothing.
--
--
-- BLAST RADIUS
-- ---------------------------------------------------------------------------
--
-- Tier A. Adds two tables to a publication: no schema change, no data written,
-- no policy touched, no grant touched. Reversible with SQL in a forward
-- migration (`alter publication supabase_realtime drop table …`), and reversible
-- from the dashboard in one click.
--
-- The write path is unaffected either way: nothing in the app subscribes until
-- the client half of M6-B ships alongside this, and a publication with no
-- subscriber costs one WAL decode slot and no query.
--
-- **Realtime is a permission surface, not only a transport** (M6's own note).
-- What this migration does NOT do is make that true — RLS does, and the
-- verification that it holds over replication is M6-07's test list, recorded in
-- docs/REALTIME_VERIFICATION.md because it needs two accounts and two browsers.


-- 1. Publish the two tables the board reads ----------------------------------
--
-- Guarded rather than bare: `alter publication … add table` raises
-- "relation is already member of publication" on a re-run, and every migration
-- in this repository is written to survive being applied twice.
--
-- `boards`, `board_members`, `spaces`, `profiles` and `activities` stay off the
-- publication. A board rename is not something a second client needs within a
-- second, membership changes are read through an RPC rather than a table, and
-- `activities` would put an append-only audit feed on every open socket. M6-B
-- is the board's two live-editable collections and nothing else.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'todos'
  ) then
    alter publication supabase_realtime add table public.todos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'columns'
  ) then
    alter publication supabase_realtime add table public.columns;
  end if;
end
$$;


-- Rollback ---------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, put the following in a NEW migration:
--
--   alter publication supabase_realtime drop table public.columns;
--   alter publication supabase_realtime drop table public.todos;
--
-- Free to reverse at any time: nothing is stored, so dropping a table from the
-- publication only stops future events. Clients subscribed at that moment stay
-- connected and go quiet.
--
--
-- Verification -------------------------------------------------------------------
--
--   select schemaname, tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' order by tablename;
--   -- expect exactly: public | columns
--   --                 public | todos
--
--   select relname, relreplident from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and relname in ('todos','columns');
--   -- expect relreplident = 'd' on both — if either reads 'f', the DELETE
--   -- payload decision above has been reversed and the client's unfiltered
--   -- DELETE subscription is now receiving whole rows from other boards.
--
-- The four security checks this migration's task owns are behavioural, need a
-- second account, and are listed in docs/REALTIME_VERIFICATION.md.
