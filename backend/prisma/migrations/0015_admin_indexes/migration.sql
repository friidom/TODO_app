-- 0015 — the five indexes the admin queries need. Indexes only; no response
-- body changes with this migration.
--
-- Every existing index on activities leads with board_id, because until M34
-- every question this schema answered was "what happened on THIS board".
-- The admin surface asks the two questions that shape does not serve:
-- "what has this person done across the system" and "what happened across
-- the system", and both were full scans.
--
-- Each of these was confirmed missing by reading the schema, not assumed:
--
--   activities  has (board_id, created_at desc) and (board_id, entity_id).
--               No actor_id index of any kind, and nothing leading with
--               created_at.
--   todos       has board_id, (column_id, position), (column_id, rank),
--               parent_id and sprint_id. No assignee_id.
--   comments    has exactly one non-primary index, (todo_id, created_at).
--               No author_id.
--
-- The todos partial index is the KPI query's covering shape: every
-- per-developer points figure filters completed_by and orders by
-- completed_at, and the partial clause keeps the index to the small minority
-- of rows that are finished.
--
-- Not concurrently. CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, and prisma migrate deploy wraps each migration in one.
-- The tables are small enough that the ACCESS SHARE lock is momentary; when
-- one is not, the index is created by hand and this file records it.
--
-- Forward-only. Reversing means a new migration dropping them.

create index activities_actor_created_idx on activities (actor_id, created_at desc);

create index activities_created_idx on activities (created_at desc);

create index todos_assignee_idx on todos (assignee_id);

create index todos_completed_by_idx
  on todos (completed_by, completed_at desc)
  where completed_at is not null;

create index comments_author_created_idx on comments (author_id, created_at desc);
