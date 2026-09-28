-- 0024 — statuses become their own rows (Flexible Workflow, Phase A: expand).
--
-- Until now a card's status WAS its column: todos.column_id, read through
-- columns.category. One column could therefore hold exactly one status, and a
-- status could not be retired without deleting the column it lived in. This
-- splits the two the way Jira does:
--
--   todos.status_id -> statuses (name, category, is_hidden) -> column_id -> columns
--
-- A status belongs to exactly one column; a column may show several statuses.
-- The category moves from the column to the status, which is what every
-- stamping trigger, the sequential workflow and every aggregate now read.
--
-- Expand only. 0025 backfills one status per existing column and points every
-- card at it; 0026 moves the triggers and drops todos.column_id and
-- columns.category. Nothing here changes behaviour on its own.
--
-- todos.status_id is NULLABLE, exactly as column_id was. null keeps its old
-- meaning — in the backlog, not on the board — so isOnBoard, sprint start,
-- "move to Unplanned" and sprint completion keep their rules unchanged.
--
-- name is citext so uniqueness is case-insensitive ("Done" and "done" are one
-- status), and the unique constraint is DEFERRABLE because one workflow
-- publish may legitimately swap two names or delete "Review" and create
-- "review": only the committed state has to be unique. It is INITIALLY
-- IMMEDIATE, so every other writer still gets its violation at the statement.
--
-- Forward-only. Reversing means a new migration.

create table statuses (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards (id) on delete cascade,
  column_id  uuid not null,
  name       citext not null,
  category   text not null,
  rank       double precision not null,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint statuses_column_id_fkey
    foreign key (column_id, board_id) references columns (id, board_id)
    on delete restrict,

  constraint statuses_category_check
    check (category in ('todo', 'in_progress', 'in_review', 'done')),

  constraint statuses_name_check
    check (name::text = btrim(name::text) and length(name::text) between 1 and 60),

  constraint statuses_id_board_id_key unique (id, board_id),

  constraint statuses_board_id_name_key unique (board_id, name)
    deferrable initially immediate
);

comment on table statuses is
  'A workflow status. Belongs to one column; a column may show several. The '
  'category is the status model every trigger and aggregate reads.';

comment on constraint statuses_id_board_id_key on statuses is
  'Target of todos_status_id_fkey. Do not drop.';

comment on constraint statuses_column_id_fkey on statuses is
  'Pins a status to a column on its own board. RESTRICT: a column that still '
  'shows a status cannot be deleted.';

comment on column statuses.rank is
  'Order inside its column. The board-wide order is column rank, then this.';

comment on column statuses.is_hidden is
  'Retired from new placement. Cards already in a hidden status stay valid and '
  'keep rendering in its column; the status is only no longer offered.';

create index statuses_column_id_rank_idx on statuses (column_id, rank);

create trigger statuses_set_updated_at
  before update on public.statuses
  for each row execute function public.set_updated_at();

alter table todos add column status_id uuid;

alter table todos
  add constraint todos_status_id_fkey
    foreign key (status_id, board_id) references statuses (id, board_id)
    on delete restrict;

comment on column todos.status_id is
  'Answers: is this on the Board, and in which status? Nullable, because a '
  'backlog item has none. Independent of sprint_id.';

comment on constraint todos_status_id_fkey on todos is
  'Pins a work item to a status on its own board. RESTRICT: deleting a status '
  'migrates its items first, it does not delete them.';

create index todos_status_id_rank_idx on todos (status_id, rank);

alter table boards
  add column workflow_version integer not null default 1,
  add constraint boards_workflow_version_check check (workflow_version >= 1);

comment on column boards.workflow_version is
  'Optimistic lock for publishing the workflow. Every publish names the version '
  'it was edited from and bumps it; a stale version is refused with 409.';

alter table activities drop constraint activities_event_valid;

alter table activities add constraint activities_event_valid check (
  (entity_type, action) in (
    ('todo',   'created'),
    ('todo',   'moved'),
    ('todo',   'assigned'),
    ('todo',   'retitled'),
    ('todo',   'deleted'),
    ('todo',   'priority_changed'),
    ('todo',   'due_changed'),
    ('todo',   'type_changed'),
    ('todo',   'description_changed'),
    ('todo',   'estimate_changed'),
    ('todo',   'parent_changed'),
    ('todo',   'subtask_added'),
    ('todo',   'subtask_removed'),
    ('todo',   'task_added_to_epic'),
    ('todo',   'task_removed_from_epic'),
    ('column', 'created'),
    ('column', 'renamed'),
    ('column', 'deleted'),
    ('status', 'created'),
    ('status', 'renamed'),
    ('status', 'deleted'),
    ('member', 'added'),
    ('member', 'role_changed'),
    ('member', 'removed')
  )
);
