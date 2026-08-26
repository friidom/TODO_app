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

`parent_id` is a nullable self-reference added by M27. `null` is a normal
top-level work item — what every row was before it existed. Anything else
makes the row a **subtask** of that work item.

The hierarchy is exactly two levels: `Task → Subtask`, never
`Task → Subtask → Subtask`. Three things enforce that, each doing the part
the cheaper tool cannot:

- `todos_parent_id_fkey` is composite — `(parent_id, board_id)` references
  `todos (id, board_id)` — so a parent on another board is unrepresentable,
  the same idiom `todos_column_id_fkey` uses. **`on delete cascade`**:
  deleting a task deletes its subtasks, because unlike a column's cards a
  subtask has nowhere to be rehomed to.
- `todos_parent_not_self` is the one depth rule a CHECK can state.
- `enforce_subtask_depth` is a `before insert or update of parent_id`
  trigger, and holds the two halves needing a subquery: a parent must itself
  be top level, and a row that already has children may not become a child.

A subtask **carries a real `column_id`**, which is what gives it a status and
therefore what makes `1 of 3 done` answerable — doneness is the column's
`category`, never a field (M2-15). It also gets a `board_key` like any other
row, so a subtask is `KAN-78` under `KAN-9`.

Subtasks are fetched with the board (`fetchTodos` has no `parent_id`
predicate) and filtered out client-side in `useVisibleTodos`, so the one
cached array answers both "what cards are on this board" and "what are
KAN-9's children". `position` and `rank` are meaningless for a subtask —
nothing orders them by either — and the three places that reason about a
*column's* contents say `parent_id === null` out loud.

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
*Permission Model* in `docs/IMPLEMENTATION_PLAN.md`.

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
appearing and going. In those two the payload describes the *child* while
`entity_id` names the *parent*; a subtask's own create, delete and status
change need no new vocabulary, because a subtask is a row and `created`,
`deleted` and `moved` already fire for every row.

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

| entity_type | actions |
| --- | --- |
| `todo` | `created`, `moved`, `assigned`, `retitled`, `priority_changed`, `due_changed`, `type_changed`, `description_changed`, `estimate_changed`, `parent_changed`, `subtask_added`, `subtask_removed`, `deleted` |
| `column` | `created`, `renamed`, `deleted` |
| `member` | `added`, `role_changed`, `removed` |

The logged set of todo fields is exactly the set the UI can write — column,
assignee, title, priority, due date, type, description, estimate. `rank` and
`position` are **not** in it: a drag upserts a whole column's worth of rows to
renumber them, and logging that would fill the feed in a day.

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
