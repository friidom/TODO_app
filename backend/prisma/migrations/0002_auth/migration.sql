-- Authentication. These three tables have no counterpart in Supabase — GoTrue
-- provided them. profiles is re-rooted from auth.users onto our own users (S7).

create table users (
  id                uuid primary key default gen_random_uuid(),
  email             citext not null unique,
  password_hash     text not null,
  email_verified_at timestamptz,
  deactivated_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Deactivation rather than deletion: profiles is referenced by todos,
-- comments and activities, and history must survive a departing employee.
comment on column users.deactivated_at is
  'Reserved for B5. Non-null means the account cannot authenticate.';

create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  family_id  uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip         inet,
  created_at timestamptz not null default now()
);

-- sha256 of the opaque refresh token. Storing the token itself would make a
-- database read equivalent to stealing every live session.
comment on column sessions.token_hash is
  'sha256 of the refresh token. Never the token itself.';

comment on column sessions.family_id is
  'Rotation lineage. Presenting an already-rotated token from a family means '
  'the token leaked — B5 revokes the whole family rather than one row.';

create index sessions_user_id_idx on sessions (user_id);

create index sessions_active_expires_idx on sessions (expires_at)
  where revoked_at is null;

create table password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index password_reset_tokens_user_id_idx on password_reset_tokens (user_id);

create table profiles (
  id         uuid primary key references users (id) on delete cascade,
  username   text not null,
  full_name  text,
  bio        text,
  avatar_url text,
  created_at timestamptz default now(),
  email      text,
  constraint profiles_username_shape check (username ~ '^[a-z0-9][a-z0-9_]{2,29}$')
);

comment on table profiles is
  'Public identity, readable by every board member. Kept separate from users '
  'because credentials are read by the auth module alone.';

comment on column profiles.username is
  'Unique handle, stored trimmed and lowercased. Uniqueness is enforced '
  'case-insensitively by profiles_username_lower_key; shape by '
  'profiles_username_shape. src/utils/username.ts mirrors both for the UI.';

create unique index profiles_username_lower_key on profiles (lower(username));
