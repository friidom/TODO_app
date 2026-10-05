-- 0033 — boards.key_prefix is unique and has no default.
--
-- board_keys_pkey already refuses a duplicate through boards_reserve_key, but
-- the seed scripts insert with user triggers disabled; this index holds even
-- then. The 'KAN' default goes because it is the bug this replaces: an insert
-- that forgets the key should fail, not quietly share one.
--
-- Forward-only. Reversing means a new migration.

create unique index boards_key_prefix_key on boards (key_prefix);

alter table boards alter column key_prefix drop default;

comment on column boards.key_prefix is
  'The board''s current key, the prefix of every task key (MNH-42). Chosen by '
  'the API from the title, editable by admins. Every key it has held is in '
  'board_keys.';
