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
- due_date
- estimate
- position
- archived
- created_at
- updated_at

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
- todo_id
- author_id
- content
- created_at
- updated_at

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

Audit history.

Fields

- id
- board_id
- todo_id
- author_id
- action
- old_value
- new_value
- created_at

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

comments.todo_id
→ todos.id

attachments.todo_id
→ todos.id

labels.board_id
→ boards.id

activities.todo_id
→ todos.id

activities.author_id
→ profiles.id

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

comments(todo_id)

activities(todo_id)

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
