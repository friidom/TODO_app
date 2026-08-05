# Frontend Architecture

## Philosophy

The frontend follows a feature-oriented architecture.

Business logic should never live inside UI components.

Components render.

Hooks orchestrate.

Services communicate with Supabase.

React Query owns server state.

---

# Folder Structure

src/

    app/

    pages/

    layouts/

    components/

    hooks/

    services/

    providers/

    constants/

    types/

    utils/

---

# Responsibilities

## app

Application bootstrap.

Examples:

- App.tsx
- Router
- Providers

---

## pages

Top level routes.

Examples

Login

Dashboard

Board

Settings

Profile

404

Pages should compose features.

Pages should NOT contain business logic.

---

## layouts

Application layouts.

Examples

Dashboard Layout

Auth Layout

Settings Layout

---

## components

Reusable UI.

Examples

Button

Modal

Avatar

Todo Card

Column

Board Card

Sidebar

Components should only receive props.

Components should never communicate with Supabase directly.

---

## hooks

Feature orchestration.

Examples

useTodos()

useBoards()

useCreateTodo()

useBoardMembers()

Hooks combine:

React Query

Local State

Business Logic

---

## services

Communication with backend.

Example

boardsApi.ts

todosApi.ts

profilesApi.ts

Only services know Supabase.

Nothing else should import Supabase.

---

## providers

Global providers.

Examples

Theme

Auth

Language

React Query

---

## constants

Enums.

Colors.

Configuration.

Routes.

Categories.

Priorities.

---

## utils

Pure helper functions.

Must have no React dependencies.

---

# React Query

React Query is the single source of truth for server state.

Do not duplicate server state in Context.

Prefer optimistic updates.

Avoid unnecessary invalidation.

Update caches directly whenever possible.

---

# State Management

Use Local State for:

- modal open
- selected item
- input fields

Use React Query for:

- boards
- todos
- members
- comments
- notifications

Avoid global stores unless truly necessary.

---

# Component Rules

A component should ideally do one thing.

Example:

TodoCard

should not

fetch data

call Supabase

know routing

manage global state

It only renders.

---

# Feature Structure

Example

components/

    board/

        Board.tsx

        BoardHeader.tsx

        BoardMenu.tsx

        BoardSettings.tsx

---

services/

    boards/

        boardsApi.ts

        useBoards.ts

        useCreateBoard.ts

        useUpdateBoard.ts

        useDeleteBoard.ts

---

# Mutations

Every mutation should:

optimistically update cache

rollback on failure

avoid full invalidation

---

# Forms

Every form should:

validate

trim inputs

show loading state

show success/error feedback

---

# Routing

Public

/login

/register

/forgot-password

---

Private

/dashboard

/boards

/boards/:boardId

/profile

/settings

---

# Error Handling

Never silently ignore errors.

Every mutation must:

show feedback

rollback optimistic updates

log unexpected failures

---

# Performance

Avoid unnecessary renders.

Memoize only when beneficial.

Virtualize long lists if necessary.

Use lazy loading for large routes.

---

# Code Style

Prefer composition over inheritance.

Prefer small reusable hooks.

Prefer explicit naming.

Avoid magic strings.

Avoid duplicated logic.

---

# Future Features

Every new feature should be isolated.

Examples

services/comments

services/attachments

services/notifications

services/members

should all follow the same structure.

The architecture should remain predictable regardless of project size.
