# Database Design

## Philosophy

The database is designed around **Boards**, not Users.

Every collaborative entity belongs to a Board.

This allows:

- Team collaboration
- Multiple boards
- Invitations
- Roles
- Realtime
- Future Workspaces

without redesigning the database.

---

# Entity Relationship Diagram

```
auth.users
      │
      ▼
profiles
      │
      ▼
boards
      │
      ├───────────────┐
      ▼               ▼
board_members     board_invites
      │
      ▼
columns
      │
      ▼
todos
      │
 ┌────┴───────────┬──────────────┬───────────────┐
 ▼                ▼              ▼               ▼
comments      attachments      labels       activities
```

---

# Tables

## profiles

Represents one authenticated user.

Fields

- id
- username
- email
- full_name
- avatar_url
- bio
- created_at

---

## boards

Represents a Kanban project.

Fields

- id
- owner_id
- title
- description
- icon
- cover_color
- visibility
- created_at
- updated_at

---

Visibility

- private
- team

---

## board_members

Many-to-many relation between users and boards.

Fields

- board_id
- user_id
- role
- joined_at

---

Role

- owner
- admin
- editor
- viewer

---

## board_invites

Pending invitations.

Fields

- id
- board_id
- email
- token
- role
- expires_at
- created_by
- accepted_at

---

## columns

Workflow stages.

Fields

- id
- board_id
- title
- category
- position
- min_limit
- max_limit
- created_at
- updated_at

---

Category

- todo
- in_progress
- done

---

## todos

Represents one task.

Fields

- id
- board_id
- column_id
- creator_id
- assignee_id
- title
- description
- type
- priority
- start_date
- due_date
- estimate
- parent_id
- position
- archived
- created_at
- updated_at

---

Hierarchy

`parent_id` is a nullable self-reference added by M27 and widened to a third
level by **M28-A**. A row's ROLE in the hierarchy — Epic, a top-level Task, a
Task under an Epic, or a Subtask — is never stored as its own column: it is
derived from two facts already on the row, its own `type` and its parent's
`type`, the same two facts `enforce_work_item_hierarchy` reads.

- `type = 'Epic'` → an **Epic**. An Epic never has a parent (`parent_id` must
  be `null`).
- `parent_id is null` and `type <> 'Epic'` → a top-level **Task**.
- `parent_id` names a row whose `type = 'Epic'` → a **Task under that Epic**.
  Still a real board card in a real column, exactly like a top-level Task —
  organised under an Epic, not demoted by it.
- `parent_id` names anything else (any Task, top-level or itself under an
  Epic) → a **Subtask**. `Epic → Task → Subtask` is the only legal chain:
  a Subtask may not have children of its own, and nothing may sit directly
  under an Epic except a Task.

Four things enforce that shape, each doing the part the cheaper tool cannot:

- `todos_type_check` is the CHECK that makes `'Epic'` a legal value at all —
  a fifth value beside `'Bug' | 'Task' | 'Story' | 'Feature'`, not a second
  mechanism. Epic needed no new table for the same reason Subtask didn't in
  M27: it needs a key, a title, an assignee, comments and activity, and
  `todos` already gives every row all five.
- `todos_parent_id_fkey` is composite — `(parent_id, board_id)` references
  `todos (id, board_id)` — so a parent on another board is unrepresentable,
  the same idiom `todos_column_id_fkey` uses. **`on delete cascade`**:
  deleting a work item deletes its children, because unlike a column's cards
  a child has nowhere to be rehomed to — deleting an Epic cascades through
  its Tasks to their Subtasks in one statement.
- `todos_parent_not_self` is the one depth rule a CHECK can state.
- `enforce_work_item_hierarchy` — M27's `enforce_subtask_depth`, renamed and
  widened — is a `before insert or update of parent_id, type` trigger; it now
  also watches `type` because changing a row's type to or from `'Epic'` can
  break the hierarchy without `parent_id` itself changing. It holds every
  rule needing a subquery: an Epic may not have a parent, a parent must
  resolve to a row on the same board, a Subtask's parent must itself be a
  Task rather than another Subtask, a row with children may not become a
  Subtask, and a row may not stop being an Epic while one of its Tasks still
  has a Subtask attached (that would silently create a fourth level).

A Subtask **carries a real `column_id`**, which is what gives it a status and
therefore what makes `1 of 3 done` answerable — doneness is the column's
`category`, never a field (M2-15). It also gets a `board_key` like any other
row, so a subtask is `KAN-78` under `KAN-9`. An Epic and a Task under an Epic
carry one too, and draw on the board exactly like any other card.

Every row is fetched with the board (`fetchTodos` has no `parent_id`
predicate); the client decides what to hide. `useVisibleTodos` filters out
only genuine Subtasks — `isGenuineSubtask` (in `subtasks.ts`, alongside the
rest of this module), a row whose parent's `type` is not `'Epic'` — so the
one cached array answers "what cards are on this board", "what are KAN-9's
subtasks" and "what Tasks does this Epic own" at once. `position` and `rank`
are meaningless for a Subtask — nothing orders them by either — but **are**
meaningful for a Task under an Epic, which is a normal board card; every
place that reasons about a column's contents therefore checks
`isGenuineSubtask`, never a bare `parent_id === null`.

---

Dates

`start_date` and `due_date` are the two ends of a work item's range, added in
M2-03 and M20 respectively. Both are **`timestamptz` holding midnight UTC**, and
both are read back by slicing the leading `YYYY-MM-DD` — never by parsing to a
local `Date`, which would move a task due the 13th to the 12th for a reader west
of Greenwich. `src/utils/dueDate.ts` is the only place that conversion happens.

Either may be null. A row with both is a range, a row with one is a single
dated day, and a row with neither is not on the timeline at all.

`todos_date_range_check` enforces `start_date is null or due_date is null or
start_date <= due_date`, so an inverted range cannot be stored. Equality is
allowed — a one-day task. The constraint is the reason both columns share a
type: comparing a `date` with a `timestamptz` depends on the session's TimeZone
and so is not immutable, which a CHECK constraint may not be.

`estimate` is **not** a duration and nothing derives a range from it. It meant
points or hours depending on who filled it in until M24 resolved that: it is
**story points**. `todos_estimate_check` (`is null or >= 0`) is the only
constraint on it; `null` means unestimated and is distinct from `0`, and no
scale is enforced in the database — a Fibonacci-style quick-pick, if one is
built, is a UI opinion, not a CHECK.

---

Priority

- lowest
- low
- medium
- high
- highest

---

## comments

Task discussion.

Fields

- id
- board_id
- todo_id
- author_id
- content
- created_at
- updated_at

`board_id` is denormalised from the work item, and it is the exception to this
document's own rule against duplicated information: it is a derived key used by
the security boundary, not duplicated user data. The membership helpers take a
board id, so without it every policy evaluation would join comments → todos to
find one, on every row. It cannot drift — `(todo_id, board_id)` references
`todos (id, board_id)`, the M3-18 pattern.

Any board member may post, including a viewer. An author may edit only their own
comment and only its `content` (a column-level grant, not just a policy); an
author may delete their own, and admins and owners may delete any. See
_Permission Model_ in `docs/IMPLEMENTATION_PLAN.md`.

---

## attachments

Task files.

Fields

- id
- todo_id
- uploaded_by
- storage_path
- file_name
- mime_type
- created_at

---

## labels

Reusable labels.

Fields

- id
- board_id
- name
- color

---

## todo_labels

Many-to-many

Fields

- todo_id
- label_id

---

## activities

Board history and per-item History. **Shipped in M18** —
`20260815090000_create_activities.sql` and
`20260816090000_activity_field_events.sql` — and extended in **M25** —
`20260827090000_todo_history_fields.sql` — to also watch `description` and
`estimate`, and to serve a per-item history tab rather than only the
board-wide feed. **M27** — `20260828090000_todo_parent_id.sql` — added
`parent_changed` on the child, plus `subtask_added` / `subtask_removed`
written against the **parent**, so a task's own History shows its subtasks
appearing and going. In those two the payload describes the _child_ while
`entity_id` names the _parent_; a subtask's own create, delete and status
change need no new vocabulary, because a subtask is a row and `created`,
`deleted` and `moved` already fire for every row.

**M28-A** — `20260829090000_todo_epic_hierarchy.sql` — added
`task_added_to_epic` / `task_removed_from_epic`, the same parent-side shape
as `subtask_added` / `subtask_removed`, chosen by looking up the _parent's_
type rather than assumed: attaching a child to an Epic writes the former,
attaching it to a Task writes the latter. `parent_changed`'s payload also
grew `from_type` / `from_key` / `to_type` / `to_key` — the old and new
parent's type and key, snapshotted at write time — so a reader can tell
"became a Subtask" from "assigned to an Epic" without looking either parent
up. And `log_todo_activity` now writes the parent-side entry on **UPDATE**
too, not only INSERT/DELETE: assigning an _existing_ Task to an Epic is a
reparent, and without this the Epic's own History would never mention it.

The shape below replaces the `todo_id` / `author_id` / `old_value` / `new_value`
sketch this document carried before it was built. Two things changed and both
were deliberate: the entry points at any **entity**, not only a work item, so
column and membership events fit the same table; and the before/after pair moved
into one `jsonb` payload, because different events need different fields and two
text columns could not carry a column title beside a role name.

Fields

- id
- board_id — the policy key, as on every board-scoped child table
- actor_id — who did it, recorded at write time and never inferred at read time
- entity_type — `todo` | `column` | `member`
- entity_id — **no foreign key**, deliberately
- action — see the pair list below
- payload — `jsonb not null default '{}'`
- created_at

`(entity_type, action)` is checked as a **pair**, so a combination no trigger
writes and no reader can render cannot be stored:

| entity_type | actions                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `todo`      | `created`, `moved`, `assigned`, `retitled`, `priority_changed`, `due_changed`, `type_changed`, `description_changed`, `estimate_changed`, `parent_changed`, `subtask_added`, `subtask_removed`, `task_added_to_epic`, `task_removed_from_epic`, `deleted` |
| `column`    | `created`, `renamed`, `deleted`                                                                                                                                                                                                                           |
| `member`    | `added`, `role_changed`, `removed`                                                                                                                                                                                                                        |

The logged set of todo fields is exactly the set the UI can write — column,
assignee, title, priority, due date, type, description, estimate, and, since
M28-A's `EpicParentControl` gave `parent_id` its first UI path that patches an
_existing_ row, parent. `rank` and `position` are **not** in it: a drag
upserts a whole column's worth of rows to renumber them, and logging that
would fill the feed in a day.

**`description_changed` carries no `from`/`to` in its payload** — only that it
changed, plus `title`/`board_key` to name the card. Every other action's
payload is a short scalar and is genuinely the whole explanation a reader
needs; `description` is unbounded free text with no compact chip to render a
diff in, and doubling a large edit's size into a permanent, unprunable-by-size
log for a value no reader displays inline was not a trade worth making.
`estimate_changed` gets the ordinary treatment — it is a short `numeric`
scalar, same as `priority`/`type`.

### Two rules this table exists to keep

1. **Record the actor, never infer it at read time.** `actor_id` is written from
   `auth.uid()` inside the trigger. `on delete set null`, not cascade — a
   departing account must not take the board's history with it.
2. **An entry must still explain itself after the row it points at is deleted.**
   `entity_id` carries no foreign key, and `payload` snapshots whatever the
   sentence needs — column titles rather than column ids, the card's title and
   `board_key`, the role name. A foreign key here would either cascade the
   history away with the card or block the delete.

### There is no client write path

`activities` has a SELECT policy and nothing else — no INSERT policy, and no
INSERT grant. The only writers are three `security definer` trigger functions
(`log_todo_activity`, `log_column_activity`, `log_member_activity`). A client
cannot forge, backdate, delete or omit an entry, because the triggers are on the
tables themselves rather than in the API layer.

Read policy: `board_id in (select accessible_board_ids())` — the same predicate
`columns` and `todos` use, so an entry is visible under exactly the same rule as
the card it describes.

### Retention

`prune_activities(p_keep_days integer default 180)`, service-role only, scheduled
via `pg_cron` where the extension is enabled. This is the one table with no
natural bound: every other one is proportional to how much work exists, and this
one to how much work has ever been done.

---

# Foreign Keys

profiles.id
→ auth.users.id

boards.owner_id
→ profiles.id

board_members.board_id
→ boards.id

board_members.user_id
→ profiles.id

columns.board_id
→ boards.id

todos.board_id
→ boards.id

todos.column_id
→ columns.id

todos.creator_id
→ profiles.id

todos.assignee_id
→ profiles.id

todos.(parent_id, board_id)
→ todos.(id, board_id) — composite, on delete cascade (M27)

comments.(todo_id, board_id)
→ todos.(id, board_id) — composite, on delete cascade

comments.author_id
→ profiles.id — on delete cascade, unlike todos.creator_id

attachments.todo_id
→ todos.id

labels.board_id
→ boards.id

activities.board_id
→ boards.id (on delete cascade)

activities.actor_id
→ profiles.id (on delete set null)

activities.entity_id
→ nothing, deliberately — see the table above

---

# Deletion Rules

Deleting a Board deletes:

- Members
- Columns
- Todos
- Comments
- Attachments
- Activities

Deleting a Column should NOT delete Todos.

Todos should be moved into another Column.

Deleting a User should:

- preserve activity history
- preserve created tasks
- remove board membership

---

# Indexes

boards(owner_id)

columns(board_id, position)

todos(column_id, position)

todos(board_id)

todos(parent_id) where parent_id is not null — a work item's children (M27):
subtasks, an Epic's Tasks, and the count behind `1 of 3 done`

comments(todo_id, created_at) — one thread, in posting order, no sort node

activities(board_id, created_at desc) — the feed

activities(board_id, entity_id) — one work item's own history

board_members(user_id)

board_members(board_id)

---

# Design Rules

Never store duplicated information.

Never store presentation data.

Colors belong in the frontend.

Permissions belong in board_members.

Ownership belongs to boards.

Everything collaborative belongs to a board.
