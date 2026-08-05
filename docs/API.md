# API Architecture

## Philosophy

The application follows a layered architecture.

UI never communicates with Supabase directly.

Every request follows the same flow.

```
Component

↓

Feature Hook

↓

API Service

↓

Supabase

↓

PostgreSQL
```

---

# Layers

## UI

Responsible for rendering.

May call hooks.

Must never import Supabase.

Example

TodoCard

Column

BoardHeader

---

## Hooks

Responsible for business logic.

Hooks orchestrate:

- React Query
- optimistic updates
- cache updates
- loading state
- errors

Hooks should never contain SQL.

---

## API

Responsible only for database communication.

Every file in

services/api

should contain pure Supabase calls.

Example

boardsApi.ts

todosApi.ts

columnsApi.ts

membersApi.ts

---

## Database

The final layer.

Only API files communicate with it.

---

# Folder Structure

```
services/

    boards/

        boardsApi.ts

        useBoards.ts

        useBoard.ts

        useCreateBoard.ts

        useUpdateBoard.ts

        useDeleteBoard.ts

    todos/

        todosApi.ts

        useTodos.ts

        useTodo.ts

        useCreateTodo.ts

        useUpdateTodo.ts

        useDeleteTodo.ts

        useMoveTodo.ts
```

---

# Query Keys

Every feature owns its query keys.

Examples

```
["profile"]

["boards"]

["board", boardId]

["columns", boardId]

["todos", boardId]

["members", boardId]

["comments", todoId]

["labels", boardId]
```

Never invent random query keys.

Keep them predictable.

---

# Mutations

Every mutation should follow the same lifecycle.

```
onMutate

↓

optimistic update

↓

mutation

↓

rollback on error

↓

final cache sync
```

Avoid invalidating everything.

Prefer updating cache directly.

---

# Optimistic Updates

Required for:

- create todo

- delete todo

- move todo

- rename todo

- create column

- reorder columns

- assign user

Realtime should later reuse the same cache update logic.

---

# Error Handling

Every mutation must:

- return typed errors

- rollback optimistic updates

- show user feedback

Unexpected errors should never fail silently.

---

# Pagination

Avoid until necessary.

When needed,

cursor pagination is preferred.

---

# Filtering

Filtering belongs in hooks.

Never inside UI components.

Example

```
useFilteredTodos()

↓

useTodos()

↓

React Query

↓

Supabase
```

---

# Realtime

Realtime should update React Query caches.

Never refetch the whole board.

Example

```
Supabase Realtime

↓

Event

↓

Update Cache

↓

React Re-render
```

---

# Naming

Fetching

```
getBoards()

getTodos()

getMembers()
```

Creation

```
createBoard()

createTodo()
```

Updating

```
updateBoard()

updateTodo()
```

Deletion

```
deleteBoard()

deleteTodo()
```

Hooks

```
useBoards()

useBoard()

useCreateBoard()

useDeleteBoard()
```

---

# Return Types

Every API function returns typed objects.

Never use any.

Never return unknown.

Prefer

```
Promise<Board>

Promise<Todo[]>

Promise<Member[]>
```

---

# Validation

Validation should happen before API calls.

Examples

trim()

required fields

length

date validation

email validation

The database should also validate critical rules.

---

# Security

Frontend validation improves UX.

Backend validation guarantees correctness.

Never rely only on frontend validation.

---

# Rule of Thumb

If a component imports Supabase directly,

the architecture is broken.

Only API files may import the Supabase client.
