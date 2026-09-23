-- 0018 — spaces.workflow_enabled, the switch for the sequential workflow.
--
-- Phase 2 of the task workflow. Phase 1 put the rule in lib/workflow.ts and
-- enforced it from todos.service.ts for every board on the installation; this
-- makes that enforcement a per-space choice. The rule itself does not move and
-- is not duplicated — only whether it is consulted.
--
-- WHY spaces AND NOT boards. A workflow is a way of working, and a space is
-- the folder a person keeps a way of working in; putting it on boards would
-- make it a per-board toggle that has to be set again for every new board.
-- boards_space_ownership already guarantees a board's owner owns the space it
-- is filed into, so the space's owner is exactly the person entitled to
-- decide this — which is why the setting needs no new permission of its own.
--
-- DEFAULT true, AND THAT IS DELIBERATE. The obvious default for a new
-- restriction is off, but Phase 1 is already live and already enforces the
-- workflow for every board, so defaulting to false would silently REVERT
-- behaviour that exists today — a board that refused todo -> done yesterday
-- would accept it after this migration, with nobody having asked for that.
-- true preserves exactly what the system does now, and makes the setting an
-- opt-OUT. It is also what keeps Phase 1's integration tests meaningful
-- without editing a single one of them.
--
-- NOT NULL with a default rather than nullable: a null would be a third state
-- ("unset") that every reader would then have to interpret, and there is no
-- question a space cannot answer. An UNFILED board — boards.space_id is
-- nullable, and it is set null when a space is deleted — has no row to read,
-- so spaces.repo.ts#workflowEnabledForBoard falls back to this same default
-- and an unfiled board keeps enforcing. That fallback lives in one function,
-- beside the query, so the two cannot drift.
--
-- Expand only. Nothing is backfilled because the default fills every existing
-- row, and no existing behaviour changes on deploy.

alter table spaces
  add column workflow_enabled boolean not null default true;

comment on column spaces.workflow_enabled is
  'Enforce the sequential column-category workflow (todo -> in_progress -> done) for boards in this space. Read by todos.service.ts; the rule itself is lib/workflow.ts.';
