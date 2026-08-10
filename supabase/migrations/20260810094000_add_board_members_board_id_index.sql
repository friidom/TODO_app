-- M3-01 correction · The standalone board_members(board_id) index. SAFE.
--
-- M3-01 shipped one index where the plan asks for two. `docs/DATABASE.md`
-- lines 332-348 enumerate board_members(user_id) and board_members(board_id)
-- as separate entries, and IMPLEMENTATION_PLAN.md line 987 requires "indexes
-- on both columns per docs/DATABASE.md". Only board_members_user_id_idx was
-- created; this supplies the other.
--
-- A new migration rather than an edit to 20260810090000: that one is applied
-- to the linked project, and migrations are forward-only.
--
--
-- WHY IT LOOKS REDUNDANT, AND WHY IT STAYS
--
-- It is redundant for reads today, and that is not a reason to delete it.
-- The primary key from M3-01 builds a btree on (board_id, user_id), whose
-- leading column already serves every `where board_id = ...` lookup —
-- including the one the M3-02 helpers perform. This index adds no access path
-- the planner did not already have; it costs one more btree to maintain on
-- every membership write.
--
-- It is here because the schema specification calls for it and the
-- specification is the source of truth, not because a measurement demanded it.
-- Recorded plainly so that whoever finds it later reads it as a decision
-- rather than an oversight, and so the case for dropping it is argued against
-- docs/DATABASE.md rather than against this file.
--
-- It stops being redundant if the primary key ever changes — reordered to
-- (user_id, board_id), or replaced by a surrogate id with a unique constraint.
-- Then this becomes the only index serving board_id.

create index board_members_board_id_idx
on public.board_members (board_id);


-- No CONCURRENTLY: it is not permitted inside the transaction the migration
-- runs in, and board_members is empty until M3-03 backfills, so the lock is
-- momentary regardless.


-- Rollback ---------------------------------------------------------------------
--
--   drop index if exists public.board_members_board_id_idx;
--
-- Clean in the sense that no query plan depends on it — see above. It would
-- put the schema back out of step with docs/DATABASE.md.


-- Verification ------------------------------------------------------------------
--
--   select indexname, indexdef
--   from pg_indexes
--   where tablename = 'board_members';
--   -- expect three: board_members_pkey, board_members_user_id_idx,
--   -- board_members_board_id_idx
