-- Columns, sprints and work items.
--
-- sprints is created before todos because todos.sprint_id points into it.
-- Nothing points the other way: a sprint never references a work item.

create table columns (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards (id) on delete cascade,
  title      text,
  position   bigint,
  rank       double precision,
  category   text,
  min_limit  integer,
  max_limit  integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint columns_category_check check (category in ('todo', 'in_progress', 'done')),
  constraint columns_limits_check check (
    (min_limit is null or min_limit >= 0)
    and (max_limit is null or max_limit >= 0)
    and (min_limit is null or max_limit is null or min_limit <= max_limit)
  ),
  constraint columns_id_board_id_key unique (id, board_id)
);

-- Not a primary key, but todos_column_id_fkey references it. It is what pins a
-- work item to its column's board instead of letting a client assert one.
comment on constraint columns_id_board_id_key on columns is
  'Target of todos_column_id_fkey. Do not drop.';

comment on column columns.position is
  'Dense integer mirror, lazily updated. Read only as the byRank fallback in '
  'src/utils/rank.ts, and written on create. Removing it is M6-05, not this '
  'migration: nine frontend files still write it.';

comment on column columns.min_limit is
  'Advisory only. A breach warns in the column header; nothing blocks a drop.';

create index columns_board_id_position_idx on columns (board_id, position);
create index columns_board_id_rank_idx     on columns (board_id, rank);

create table sprints (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards (id) on delete cascade,
  name       text not null,
  goal       text,
  start_date timestamptz,
  end_date   timestamptz,
  state      text not null default 'future',
  rank       double precision not null default 1024,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprints_state_check check (state in ('future', 'active', 'completed')),
  constraint sprints_date_range_check check (
    start_date is null or end_date is null or start_date <= end_date
  ),
  constraint sprints_name_check check (length(btrim(name)) between 1 and 120)
);

comment on table sprints is
  'A time-boxed container with its own lifecycle. Not a work item. '
  'todos.sprint_id points into this table; this table never points into todos.';

-- The client reads the running sprint with find(s => s.state === 'active').
-- This partial unique index is what makes that safe.
create unique index sprints_one_active_per_board on sprints (board_id)
  where state = 'active';

create index sprints_board_id_idx on sprints (board_id);

create table todos (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references boards (id) on delete cascade,
  column_id    uuid,
  position     bigint,
  rank         double precision,
  backlog_rank double precision,
  board_key    integer,
  title        text,
  description  text,
  type         text not null default 'Task',
  priority     text,
  start_date   timestamptz,
  due_date     timestamptz,
  estimate     numeric,
  creator_id   uuid references profiles (id) on delete set null,
  assignee_id  uuid references profiles (id) on delete set null,
  parent_id    uuid,
  sprint_id    uuid references sprints (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now(),

  constraint todos_id_board_id_key unique (id, board_id),

  constraint todos_column_id_fkey
    foreign key (column_id, board_id) references columns (id, board_id)
    on delete restrict,

  constraint todos_parent_id_fkey
    foreign key (parent_id, board_id) references todos (id, board_id)
    on delete cascade,

  constraint todos_parent_not_self  check (parent_id is null or parent_id is distinct from id),
  constraint todos_type_check       check (type in ('Bug', 'Task', 'Story', 'Feature', 'Epic')),
  constraint todos_priority_check   check (priority in ('lowest', 'low', 'medium', 'high', 'highest')),
  constraint todos_estimate_check   check (estimate is null or estimate >= 0),
  constraint todos_date_range_check check (
    start_date is null or due_date is null or start_date <= due_date
  )
);

comment on column todos.id is
  'Minted by the client and upserted, which is why the optimistic row and the '
  'stored row are the same row and there is no isOptimistic flag anywhere.';

comment on column todos.column_id is
  'Answers: is this on the Board? Nullable, because a backlog item has no '
  'column. Independent of sprint_id -- conflating the two emptied every board.';

comment on column todos.sprint_id is
  'Answers: is this planned into a Sprint? ON DELETE SET NULL, so deleting a '
  'sprint returns its work to the backlog. CASCADE here would destroy it.';

comment on column todos.rank is
  'Fractional order within a column. A move computes one value between its two '
  'neighbours and writes ONE row; renumbering whole columns made two '
  'simultaneous drags overwrite each other cards.';

comment on column todos.backlog_rank is
  'Order in the Backlog planning view. A second, independent rank, because a '
  'place in a Kanban column and a place in a sprint plan are different '
  'questions.';

comment on column todos.board_key is
  'Per-board counter rendered as KAN-n, allocated by a BEFORE INSERT trigger '
  'and never reused. Null means the card is in flight, and the UI reads that '
  'absence as the pending state.';

comment on column todos.estimate is
  'Story points, not hours. null and 0 are different answers and are counted '
  'separately. numeric because points may be fractional and numeric is exact; '
  'convert to a JS number at the DTO boundary, never deeper.';

comment on column todos.parent_id is
  'The whole hierarchy. A row role is read from its parent, never from its own '
  'type: no parent is top level, under an Epic is a Task, under anything else '
  'is a Subtask. There is no Subtask type.';

-- Composite rather than a plain FK to columns(id): board_id must agree on both
-- sides, or board_id becomes a claim the client makes and authorization believes.
comment on constraint todos_column_id_fkey on todos is
  'Pins a work item to its column board. RESTRICT: deleting a column rehomes '
  'its items first, it does not delete them.';

create index todos_board_id_idx           on todos (board_id);
create index todos_column_id_position_idx on todos (column_id, position);
create index todos_column_id_rank_idx     on todos (column_id, rank);

create index todos_parent_idx    on todos (parent_id) where parent_id is not null;
create index todos_sprint_id_idx on todos (sprint_id) where sprint_id is not null;
create index todos_backlog_idx   on todos (board_id)  where column_id is null;

create unique index todos_board_key_unique on todos (board_id, board_key);
