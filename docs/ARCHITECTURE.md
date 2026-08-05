# Architecture

## Overview

This application follows a scalable, board-centric architecture inspired by modern collaborative project management systems.

The system is designed to support:

- Multiple Boards
- Team Collaboration
- Invitations
- Realtime Updates
- Task Assignment
- Comments
- Attachments
- Notifications

without requiring future database redesign.

---

# High Level Architecture

```
Auth
 │
 ▼
Profiles
 │
 ▼
Boards
 │
 ├──────────────┐
 ▼              ▼
Board Members   Board Invites
 │
 ▼
Columns
 │
 ▼
Todos
 │
 ├──────────────┬──────────────┬──────────────┐
 ▼              ▼              ▼              ▼
Comments    Attachments     Labels      Activity
```

Every entity belongs to a Board.

The Board is the primary ownership object.

Users never own tasks directly.

---

# Ownership

Current architecture:

```
User

↓

Columns

↓

Todos
```

Future architecture:

```
User

↓

Boards

↓

Columns

↓

Todos
```

This makes collaboration possible.

---

# Database Principles

Every entity should have:

- id
- created_at
- updated_at

Every mutable entity should support:

- ownership
- permissions
- activity history

Soft deletion should be preferred over hard deletion where appropriate.

---

# Main Entities

## Profile

Represents a single authenticated user.

One Profile belongs to one Auth User.

---

## Board

A Board represents a project.

Examples:

- University
- Internship
- Startup
- Personal

Every Board has:

- Owner
- Members
- Columns
- Todos

---

## Board Member

Represents a user's membership in a Board.

One user may belong to many Boards.

One Board may have many Members.

This is a many-to-many relationship.

---

## Board Invite

Represents an invitation.

Supports:

- email invitations
- invite links

Invites should expire automatically.

---

## Column

Columns belong to Boards.

Columns NEVER belong directly to Users.

Columns define workflow stages.

Examples:

- Backlog
- Todo
- In Progress
- Review
- Done

Columns support:

- category
- position
- WIP limits

---

## Todo

Todos belong to a Board through a Column.

Every Todo should eventually support:

- title
- description
- creator
- assignee
- priority
- due date
- labels
- attachments
- comments
- activity history

---

# Ownership Rules

Everything should be scoped to a Board.

Example:

Board

↓

Columns

↓

Todos

↓

Comments

↓

Attachments

↓

Activity

This avoids permission problems.

---

# Future Scalability

The architecture must support:

- personal boards
- shared boards
- organizations
- workspaces

without redesigning existing tables.

---

# Realtime

Realtime should synchronize:

- task creation
- task deletion
- task updates
- drag & drop
- comments
- member presence

Clients should react only to Board-specific events.

---

# Performance

The application should minimize unnecessary queries.

React Query should remain the primary state layer.

Optimistic updates are preferred.

Realtime events should update existing caches instead of invalidating everything.

---

# Security

All authorization must be enforced in Supabase RLS.

Frontend authorization is only for UI convenience.

The database must always remain secure if the frontend is bypassed.

---

# Guiding Principle

Whenever a new feature is proposed, ask:

"Does this belong to a Board?"

If yes,

design it around the Board.

Never design around a User if collaboration is expected.