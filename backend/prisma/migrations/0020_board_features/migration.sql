-- 0020 — boards.sprints_enabled and boards.workflow_enabled. EXPAND.
--
-- Board Settings, phase 1 of expand -> backfill -> contract. 0021 copies the
-- space's workflow setting onto its boards; 0022 drops the space column.
--
-- WHY THE BOARD AND NOT THE SPACE. 0018 put workflow_enabled on spaces, and
-- that was the wrong owner. docs/ARCHITECTURE.md: "Does this belong to a Board?
-- If yes, design it around the Board." docs/IMPLEMENTATION_PLAN.md, on this
-- exact setting: "Per-board or global? Per-board, like everything else in this
-- architecture." A space here is a private folder with an owner and no
-- membership; a board is the project -- members, roles, columns, todos,
-- sprints. It was also a live bug: a board admin who did not happen to own the
-- space could not change a rule that governed their board, because the space
-- endpoint is owner-scoped.
--
-- TYPED COLUMNS, NOT A SETTINGS BLOB. A feature flag read on a hot path
-- (every status transition reads workflow_enabled) is worth a column; a jsonb
-- bag would make it unqueryable and untyped for no gain at two settings.
--
-- BOTH DEFAULT true, so nothing changes behaviour on deploy: sprints are on
-- for every board today, and the workflow is enforced for every board today.
-- Turning either off is an explicit act.

alter table boards
  add column sprints_enabled  boolean not null default true,
  add column workflow_enabled boolean not null default true;

comment on column boards.sprints_enabled is
  'Show the Sprints/Backlog feature on this board. Off hides the surfaces and puts every card with a column back on the board; it deletes no sprint data and disables no endpoint.';

comment on column boards.workflow_enabled is
  'Enforce the sequential column-category workflow (todo -> in_progress -> in_review -> done) on this board. Read by todos.service.ts; the rule itself is lib/workflow.ts.';
