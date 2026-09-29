-- 0029 — status_transitions: the workflow's edges, stored.
--
-- Until now a "transition" was derived from status categories
-- (backend/src/lib/workflow.ts). The workflow editor edits real A -> B edges,
-- so they need a home. A missing edge means the move is refused.
--
-- Both endpoints are composite-keyed to statuses (id, board_id), so an edge
-- cannot join two boards, and both cascade: deleting a status deletes its edges.
-- Self-edges are meaningless (a reorder is not a transition) and refused.
--
-- Backfilled by 0030; expand and backfill are separate migrations.
--
-- Forward-only. Reversing means a new migration.

create table status_transitions (
  board_id       uuid not null references boards (id) on delete cascade,
  from_status_id uuid not null,
  to_status_id   uuid not null,
  created_at     timestamptz not null default now(),
  primary key (from_status_id, to_status_id),
  constraint status_transitions_no_self check (from_status_id <> to_status_id),
  constraint status_transitions_from_fkey
    foreign key (from_status_id, board_id) references statuses (id, board_id) on delete cascade,
  constraint status_transitions_to_fkey
    foreign key (to_status_id, board_id) references statuses (id, board_id) on delete cascade
);

create index status_transitions_board_id_idx on status_transitions (board_id);
