-- M10-01 · unique usernames, step 3 of 3: CONTRACT. RISKY. Tier A.
--
-- **This file is the source of truth for "every user has a unique username".**
-- Everything in `src/utils/username.ts` and every availability check in the UI
-- is advice; this is the rule. A client that skipped the check, an RPC written
-- next year, a row inserted by hand in the dashboard — all of them meet these
-- three objects and none of them can get past.
--
-- Safe to run only because step 2 has already rewritten every row that would
-- have failed, and ended by raising if any survived.
--
-- Forward-only, as always: reversing means a new migration dropping these.

-- ---------------------------------------------------------------------------
-- 1. Case-insensitive uniqueness.
-- ---------------------------------------------------------------------------
-- **On `lower(username)`, not on `username`**, even though step 1 stores the
-- lowercased form. The storage rule is a convention that a future writer can
-- forget; the index is a guarantee that does not depend on remembering it. If
-- something ever inserts `Ada` alongside `ada`, this rejects it rather than
-- quietly creating two accounts one shift key apart.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- 2. The shape.
-- ---------------------------------------------------------------------------
-- The same pattern as `is_valid_username` and as the client's USERNAME_SHAPE,
-- written out rather than calling the function: a CHECK that calls a function
-- is only as stable as that function, and `create or replace` on the function
-- would silently change what the table permits without touching the table.
alter table public.profiles
  drop constraint if exists profiles_username_shape;

alter table public.profiles
  add constraint profiles_username_shape
  check (username ~ '^[a-z0-9][a-z0-9_]{2,29}$');

-- ---------------------------------------------------------------------------
-- 3. Required.
-- ---------------------------------------------------------------------------
-- Last, and separately, because this is the one that cannot be satisfied by
-- rewriting a value — a row either has a name or the migration stops. Step 2
-- guarantees it does.
alter table public.profiles
  alter column username set not null;

comment on column public.profiles.username is
  'Unique handle, stored trimmed and lowercased. Uniqueness is enforced '
  'case-insensitively by profiles_username_lower_key; shape by '
  'profiles_username_shape. src/utils/username.ts mirrors both for the UI.';
