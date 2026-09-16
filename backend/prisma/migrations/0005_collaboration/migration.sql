-- Comments, attachments, activity and notifications.

create table comments (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null,
  todo_id    uuid not null,
  author_id  uuid not null references profiles (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_todo_id_fkey
    foreign key (todo_id, board_id) references todos (id, board_id)
    on delete cascade,
  constraint comments_content_not_blank check (length(btrim(content)) > 0)
);

comment on column comments.author_id is
  'NOT NULL and ON DELETE CASCADE: unlike todos.creator_id, a comment is its '
  'author words rather than attribution on someone else row, so deleting the '
  'account takes them with it.';

comment on column comments.board_id is
  'Denormalised from the work item so every authorization check is one hop. '
  'Cannot drift from todos.board_id -- comments_todo_id_fkey refuses it.';

create index comments_todo_created_idx on comments (todo_id, created_at);

create table attachments (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null,
  todo_id      uuid not null,
  uploader_id  uuid references profiles (id) on delete set null,
  filename     text not null,
  storage_path text not null unique,
  size_bytes   integer not null,
  mime_type    text not null,
  created_at   timestamptz not null default now(),
  constraint attachments_todo_id_fkey
    foreign key (todo_id, board_id) references todos (id, board_id)
    on delete cascade,
  constraint attachments_filename_not_blank check (length(btrim(filename)) > 0),
  constraint attachments_size_non_negative  check (size_bytes >= 0)
);

-- No updated_at, no UPDATE path: the row is immutable, so a rename is a delete
-- and a re-upload.
comment on table attachments is
  'Files on a work item. Metadata only -- the bytes live in the attachment '
  'store at storage_path. Immutable by design.';

comment on column attachments.uploader_id is
  'Nullable and ON DELETE SET NULL: a file is a contribution to a shared work '
  'item rather than its uploader own words, so deleting the account must not '
  'take the file with it. Follows todos.creator_id, not comments.author_id.';

comment on column attachments.storage_path is
  'Object key: <board_id>/<todo_id>/<attachment_id>.<ext>. UNIQUE, so the row '
  'and the object are one pair. Carries no user-supplied text -- the display '
  'name is in filename -- because the first segment is read as the board.';

-- int4 holds ~2.1 billion against a 25 MB (26_214_400) upload limit. bigint
-- would cross Number.MAX_SAFE_INTEGER, so Prisma maps it to BigInt, which
-- JSON.stringify throws on. Raising the limit past 2 GB needs a migration.
comment on column attachments.size_bytes is
  'integer, not bigint. See the migration header.';

create index attachments_todo_created_idx on attachments (todo_id, created_at);

create table activities (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references boards (id) on delete cascade,
  actor_id    uuid references profiles (id) on delete set null,
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint activities_event_valid check (
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
      ('member', 'added'),
      ('member', 'role_changed'),
      ('member', 'removed')
    )
  )
);

comment on table activities is
  'Board history, written only by triggers. No API write path exists, and that '
  'is what makes an entry evidence rather than a claim.';

-- entity_id carries no foreign key on purpose: an entry must still explain
-- itself after the row it points at is deleted, which is what payload is for.
comment on column activities.entity_id is
  'Deliberately not a foreign key. See the migration header.';

comment on column activities.actor_id is
  'Recorded at write time from app.actor_id, never inferred at read time. '
  'Null for a deleted account or a write with no session.';

comment on column activities.payload is
  'Enough of a snapshot to render the entry without joining anything that may '
  'since have been deleted -- titles, keys and role names, not ids alone.';

create index activities_board_created_idx on activities (board_id, created_at desc);
create index activities_board_entity_idx  on activities (board_id, entity_id);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  type        text not null,
  board_id    uuid references boards (id) on delete cascade,
  entity_type text,
  entity_id   uuid,
  actor_id    uuid references profiles (id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint notifications_type_check        check (type in ('invite', 'assigned')),
  constraint notifications_entity_type_check check (entity_type in ('todo', 'invite'))
);

comment on table notifications is
  'Per-recipient inbox, trigger-written only. Same reason as activities: no '
  'write path from the API means an entry cannot be faked.';

create index notifications_user_created_idx on notifications (user_id, created_at desc);
create index notifications_user_unread_idx  on notifications (user_id) where read_at is null;
