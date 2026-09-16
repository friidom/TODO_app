-- Spaces, boards, membership and invitations.

create table spaces (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles (id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spaces_title_length check (char_length(btrim(title)) between 1 and 60)
);

comment on table spaces is
  'A personal folder for boards. NOT a permission scope: no membership, and '
  'boards.space_id grants nothing.';

create index spaces_owner_id_idx on spaces (owner_id);

create table boards (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles (id) on delete cascade,
  title       text,
  description text,
  icon        text,
  cover_color text,
  visibility  text not null default 'private',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  next_key    integer not null default 1,
  key_prefix  text not null default 'KAN',
  space_id    uuid references spaces (id) on delete set null,
  constraint boards_visibility_check check (visibility in ('private', 'team')),
  constraint boards_key_prefix_format check (key_prefix ~ '^[A-Z][A-Z0-9]{1,9}$')
);

comment on column boards.next_key is
  'Next value for todos.board_key, allocated by assign_todo_board_key. '
  'Forward-only: a deleted card never frees its number.';

comment on column boards.space_id is
  'Which space the board is filed under, or null for unfiled. Filing only — '
  'it confers no access. Only the space owner may set it.';

create index boards_owner_id_idx on boards (owner_id);
create index boards_space_id_idx on boards (space_id);

create table board_members (
  board_id  uuid not null references boards (id) on delete cascade,
  user_id   uuid not null references profiles (id) on delete cascade,
  role      text not null,
  joined_at timestamptz not null default now(),
  primary key (board_id, user_id),
  constraint board_members_role_check check (role in ('owner', 'admin', 'editor', 'viewer'))
);

comment on table board_members is
  'Who may access which board, and as what. The authorization source for '
  'boards, columns and todos — read through the backend authorization layer, '
  'never trusted from a client-supplied board_id.';

create index board_members_user_id_idx  on board_members (user_id);
create index board_members_board_id_idx on board_members (board_id);

create table board_invites (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references boards (id) on delete cascade,
  email       text,
  token_hash  text not null unique,
  role        text not null,
  expires_at  timestamptz not null,
  created_by  uuid references profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint board_invites_role_check check (role in ('admin', 'editor', 'viewer'))
);

comment on table board_invites is
  'Pending board invitations. Revocation DELETES the row, so a revoked token '
  'and a nonexistent token are indistinguishable; an accepted row is kept as '
  'the audit trail.';

-- S3: Supabase stored the token in plaintext, which was acceptable behind RLS.
-- Behind a REST API the token is a bearer credential and must be hashed at
-- rest like a session or a reset token. The plaintext is returned once, at
-- creation, and is unrecoverable afterwards.
comment on column board_invites.token_hash is
  'sha256 of the invite token. Never the token itself.';

-- 'owner' is absent from board_invites_role_check on purpose: ownership is
-- not grantable by invitation, and leaving it out makes that structural.
comment on constraint board_invites_role_check on board_invites is
  'Ownership cannot be granted by invitation.';

create index board_invites_board_id_idx on board_invites (board_id);
