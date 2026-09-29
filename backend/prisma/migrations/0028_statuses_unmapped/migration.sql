-- 0028 — a status may exist without a column.
--
-- Configure Columns has an "Unmapped statuses" lane: a status created there,
-- or dragged out of a column, belongs to the workflow but is shown on no
-- column. The composite foreign key (column_id, board_id) keeps holding for
-- every mapped status; with column_id null the default MATCH SIMPLE skips the
-- check, which is exactly the meaning wanted here.
--
-- An unmapped status cannot receive work: requirePlaceableStatus refuses it.
-- Cards already in a status that becomes unmapped are refused at publish time
-- by workflow.plan.ts, so no card is ever stranded on an invisible status.
--
-- Forward-only. Reversing means a new migration.

alter table statuses
  alter column column_id drop not null;
