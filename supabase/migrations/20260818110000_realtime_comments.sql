-- M7-04 · Publish comments to supabase_realtime. Tier A.
--
-- M7-01 deliberately left this out and said so: *"comments is not added to the
-- supabase_realtime publication. M7-04 owns that."* This is that.
--
-- Every decision M6-07 made for `todos` and `columns` carries over unchanged,
-- so this migration is short and the reasoning lives there. The two that are
-- worth restating because a reader will ask:
--
--   · **REPLICA IDENTITY stays DEFAULT.** A DELETE payload is therefore the
--     primary key and nothing else — no `todo_id`, no `board_id`. The client
--     absorbs that: `useBoardRealtime` subscribes to comment DELETEs *without*
--     the board filter (a filter on a column that is not in the payload can
--     never match) and finds the thread holding that id among the cached ones.
--     Widening to `full` would put the text of a comment on a board the
--     receiving client may not read onto its socket, which is the exact trade
--     M6-07 refused and it is worse here — a comment is prose, where a work
--     item's deleted payload would at least have been a row of fields.
--
--   · **No column list.** RLS is row-level, `board_id in (select
--     accessible_board_ids())` decides whole rows, and `fetchComments` already
--     returns every column to anyone who can read the row. There is no column
--     a payload could leak that a query would not.
--
-- **What this does NOT do is scope events to one work item.** The subscription
-- filter is `board_id=eq.<board>`, so a client with a board open receives
-- comment events for every card on it, including cards nobody has open. That is
-- deliberate and it is where M7-04 diverges from its own sketch — see
-- `useBoardRealtime`'s `patchComments` for why the board channel is the right
-- home — and it costs nothing on the wire that the board's own card events do
-- not already cost. RLS is unchanged either way: a client receives comment
-- events only for boards it is a member of, which is the same predicate that
-- lets it read the thread in the first place.
--
--
-- BLAST RADIUS
--
-- Adds one table to a publication. No schema change, no data written, no policy
-- touched, no grant touched. A publication with no subscriber costs one WAL
-- decode slot and no query, and the client half ships alongside it.


-- 1. Publish -------------------------------------------------------------------
--
-- Guarded, like M6-07's: `alter publication … add table` raises "relation is
-- already member of publication" on a re-run, and every migration here is
-- written to survive being applied twice.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end
$$;


-- Rollback ----------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, put this in a NEW migration:
--
--   alter publication supabase_realtime drop table public.comments;
--
-- Free to reverse at any time: nothing is stored, so dropping the table from the
-- publication only stops future events. Clients subscribed at that moment stay
-- connected and their threads go quiet — they still refetch when a task is
-- reopened, because the thread query is enabled per open work item.
--
--
-- Verification --------------------------------------------------------------------
--
--   select schemaname, tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' order by tablename;
--   -- expect exactly: public | columns
--   --                 public | comments
--   --                 public | todos
--
--   select relname, relreplident from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and relname = 'comments';
--   -- comments | d          — DEFAULT, not 'f'
--
-- Behavioural: two browsers on the same task. A comment posted in one appears
-- in the other without a refetch (check the network tab — there must be no GET
-- on /rest/v1/comments), an edit rewrites it in place, a delete removes it, and
-- the poster's own copy never doubles.
