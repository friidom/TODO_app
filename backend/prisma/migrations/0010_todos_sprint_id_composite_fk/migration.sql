-- 0010 — todos.sprint_id must pin board_id on both sides, like every other
-- cross-table reference on this table.
--
-- 0004 gave todos three references to rows that belong to a board:
--
--   todos_column_id_fkey  (column_id, board_id) -> columns (id, board_id)
--   todos_parent_id_fkey  (parent_id, board_id) -> todos   (id, board_id)
--   sprint_id             uuid references sprints (id)          <- plain
--
-- and 0004's own comment on todos_column_id_fkey says why the first two are
-- composite: "board_id must agree on both sides, or board_id becomes a claim
-- the client makes and authorization believes". sprint_id was left plain, and
-- it is the same class of hole.
--
-- Found by a B7 cross-board test, reproduced over HTTP:
--
--   alice:   PATCH /boards/<alice board>/todos/<alice card>
--            { "sprint_id": "<a sprint on mallory's board>" }   -> 200
--
-- boardAccess guards ids in the PATH; a body is guarded only by the composite
-- keys, so the two composite references refused their equivalents (409) and
-- this one accepted. The result is a card on one board holding a reference
-- into another board's object graph. It is not a read leak — alice already had
-- to know the uuid, and every sprint query in the API is board-scoped — but it
-- is cross-board corruption, and it would put a foreign card in mallory's
-- sprint rollups the moment anything aggregates by sprint_id alone.
--
-- Fixing it in the schema rather than in the service is deliberate: the other
-- two are enforced here, a service check would be a second place for the rule
-- to live, and the FK also covers writes that never pass through the API.
--
-- ON DELETE SET NULL (sprint_id) names the column to null, because board_id is
-- NOT NULL and the unqualified form would try to null both. PostgreSQL 15+;
-- this database is 18.
--
-- Forward-only. Reversing means a new migration restoring the plain reference.

alter table sprints
  add constraint sprints_id_board_id_key unique (id, board_id);

comment on constraint sprints_id_board_id_key on sprints is
  'Target of todos_sprint_id_fkey. Not a primary key, and redundant as one; it '
  'exists so a work item cannot reference a sprint on another board. Do not drop.';

alter table todos
  drop constraint todos_sprint_id_fkey;

alter table todos
  add constraint todos_sprint_id_fkey
    foreign key (sprint_id, board_id) references sprints (id, board_id)
    on delete set null (sprint_id);

comment on constraint todos_sprint_id_fkey on todos is
  'Pins a work item to its sprint board, the same way todos_column_id_fkey and '
  'todos_parent_id_fkey pin the other two. SET NULL on sprint_id alone: '
  'deleting a sprint returns its work to the Backlog rather than deleting it, '
  'and board_id is NOT NULL so it must not be nulled with it.';
