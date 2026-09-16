# Supabase Database Audit

**What this is:** a plain-language description of the database as it exists today, written so you can understand every part of it before we replace any of it.

**Status:** inspection only. No code was written, no migration was created, nothing in Supabase was touched.
**Date:** 2026-09-15
**Read from:** the 69 files in `supabase/migrations/`, the generated `src/types/database.ts`, and the client code in `src/services/` that calls into the database.

> **No decisions were made in this document.** Where a choice will have to be made later, it is listed in §14 as an open question, not settled quietly in a paragraph.

> **Update, 2026-09-15 — the migration strategy changed to CLEAN START.** No Supabase data, users, passwords or files are being migrated. This audit stays fully valid and is now **promoted from background reading to the working specification** for the new schema: §4–§7 are the source `BACKEND_MIGRATION_PLAN.md` B3 builds from, and §8 is what its B6 turns into Express authorization.
>
> Three of §13's unknowns are now moot — **13.1** (password-hash portability), **13.3** (data volume) and **13.4** (orphaned storage objects) — because nothing is being carried across. **13.2, 13.5, 13.6, 13.7** and **13.8** still stand, though 13.2 and 13.7 now matter only for confirming that the migration files describe the whole schema we are copying rules *from*. §14's open questions are superseded by `BACKEND_MIGRATION_PLAN.md` §21.

---

## Contents

1. [The 60-second version](#1-the-60-second-version)
2. [Vocabulary you need first](#2-vocabulary-you-need-first)
3. [How the database got to where it is](#3-how-the-database-got-to-where-it-is)
4. [The tables, one by one](#4-the-tables-one-by-one)
5. [Relationships](#5-relationships)
6. [Constraints — the rules the database refuses to break](#6-constraints--the-rules-the-database-refuses-to-break)
7. [Triggers and functions](#7-triggers-and-functions)
8. [RLS policies and what they enforce](#8-rls-policies-and-what-they-enforce)
9. [Auth and profiles](#9-auth-and-profiles)
10. [Storage](#10-storage)
11. [Realtime, from the database side](#11-realtime-from-the-database-side)
12. [What must be recreated in standalone PostgreSQL](#12-what-must-be-recreated-in-standalone-postgresql)
13. [What is still unknown and needs manual verification](#13-what-is-still-unknown-and-needs-manual-verification)
14. [Open questions — decisions not yet made](#14-open-questions--decisions-not-yet-made)

---

# 1. The 60-second version

The database has **12 tables**. One of them, `todos`, holds every work item — Epics, Tasks and Subtasks are all rows in it, distinguished only by what they point at.

A **board** is the unit of ownership and the unit of permission. Almost every other table carries a `board_id`, and almost every security rule is the same sentence: *"can this person reach this board, and in what role?"*

Three things do work that, in an ordinary application, the server would do:

- **Row Level Security (RLS)** decides who can see and change which rows. There are about 30 of these rules.
- **Triggers** fire automatically on writes — they stamp timestamps, allocate the `KAN-14` style card numbers, refuse invalid work-item shapes, and write the activity feed and the notification inbox.
- **Database functions (RPCs)** hold the multi-step operations: accepting an invite, starting a sprint, deleting a column and rehoming its cards. There are about 30 of these too.

The browser talks to PostgreSQL almost directly, through Supabase's auto-generated REST layer. **There is no application server.** That is why so much lives in the database: it was the only place it could live.

---

# 2. Vocabulary you need first

Five terms that appear constantly below. If these are clear, the rest of the document is readable.

### Row Level Security (RLS)

Normally, "can this user read this table?" is a yes/no permission. RLS makes it a **per-row** question. You attach a rule to a table, and PostgreSQL silently adds it to the `WHERE` clause of every query against that table.

So when the browser asks for *all* todos, PostgreSQL quietly rewrites it to *all todos on boards this person is a member of*. The browser cannot opt out. It cannot even tell that rows were removed — a denied read looks identical to "there is nothing there."

**This is the single most important thing to understand about the current system**, because it means the queries in `src/services/` are deliberately incomplete. `fetchNotifications()` has no `WHERE user_id = …` because RLS supplies it.

### Policy

One RLS rule. A policy names a table, an operation (`SELECT`/`INSERT`/`UPDATE`/`DELETE`), and a boolean expression. If the expression is true for a row, the operation is allowed on that row.

- `USING (…)` — which existing rows you may see or touch.
- `WITH CHECK (…)` — what the row is allowed to look like after you write it.

An `UPDATE` policy usually needs both: `USING` stops you editing someone else's row, `WITH CHECK` stops you editing your own row *into* someone else's.

### Trigger

Code the database runs automatically when a row is inserted, updated or deleted. `BEFORE` triggers can change or reject the row; `AFTER` triggers can only react to it.

The key property: **a trigger runs for every writer.** A trigger cannot be bypassed by the browser, by a `psql` session, or by a bug in application code. That is why the invariants live there.

### SECURITY DEFINER

A function marked `SECURITY DEFINER` runs with the permissions of whoever *created* it, not whoever *called* it. It is PostgreSQL's equivalent of "run as administrator."

It is used here for two reasons:

1. To read a table the caller is not allowed to read directly. `board_role()` reads `board_members`, which the browser can only self-read.
2. To avoid infinite recursion. A policy on `board_members` that itself queried `board_members` would loop forever; a `SECURITY DEFINER` function sidesteps RLS entirely and breaks the loop.

### RPC

A database function the browser can call over HTTP, as if it were an API endpoint. `supabase.rpc("start_sprint", { p_sprint_id: id })` executes a PL/pgSQL function on the server.

**This is the closest thing the project currently has to a backend.** Roughly 30 of them exist, and they hold all the logic that is more than one write.

---

# 3. How the database got to where it is

The 69 migrations are worth skimming as a story, because the shape of today's schema is a consequence of it.

| Phase | Migrations | What changed |
|---|---|---|
| **Baseline** | `20260804…` | A single-user app. `todos` had a `bigint` id, a `completed` boolean, a `status` text column and a `user_id` pointing straight at `auth.users`. No boards. |
| **Boards become the owner (M2)** | `20260806…` – `20260807…` | `boards` created. `board_id` added to `columns` and `todos`, backfilled, then made `NOT NULL`. `user_id` **dropped** from both. `todos.id` converted from `bigint` to `uuid`. `todos.completed` **dropped** — doneness became "the card's column has category `done`". Card numbering (`KAN-4`) added. |
| **Membership and roles (M3)** | `20260810…` – `20260811…` | `board_members` created with four roles. Every RLS policy rewritten to ask about membership instead of ownership. Owner immutability triggers added. Multi-step operations moved into RPCs. |
| **Collaboration** | `20260814…` – `20260821…` | Invites, spaces, fractional ranks, activity feed, comments, usernames, notifications. |
| **Jira-depth wave** | `20260826…` – `20260831…` | Estimates, richer history, `parent_id` hierarchy (Epic → Task → Subtask), sprints and the backlog, attachments. |

Two patterns repeat and are worth naming, because they are good practice and we will want to keep them:

**Expand → backfill → contract.** A column is added nullable, filled in, and only then made `NOT NULL` — three separate migrations. Never combined.

**Preflight checks.** Several migrations start with a `DO $$ … RAISE EXCEPTION` block that counts bad rows and aborts with a readable message rather than letting a constraint fail cryptically. `20260806095331_board_id_constraints.sql` is the clearest example.

**Migrations are forward-only.** There is no `down`. Reversing means writing a new migration.

---

# 4. The tables, one by one

12 tables in the `public` schema. For each: what it is for, its columns, and anything surprising.

---

## 4.1 `profiles` — who someone is

The public face of a user account. Every board member can read it.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | Same value as `auth.users.id`. Not generated here. |
| `username` | text **NOT NULL** | Unique, case-insensitively. Shape enforced by regex. |
| `email` | text | Copied from `auth.users`. |
| `full_name` | text | |
| `avatar_url` | text | Points into the `avatars` storage bucket. |
| `bio` | text | |
| `created_at` | timestamptz | |

**Surprising bit:** `id` is both the primary key *and* a foreign key to `auth.users(id)` with `ON DELETE CASCADE`. There is no separate "profile id". Deleting the auth account deletes the profile, which cascades onward.

---

## 4.2 `spaces` — folders for boards

A personal folder. Purely organisational.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | |
| `owner_id` | uuid → `profiles` | cascade delete |
| `title` | text **NOT NULL** | 1–60 characters after trimming |
| `created_at`, `updated_at` | timestamptz | |

**The important thing about spaces is what they are *not*.** The table comment says it outright: *"NOT a permission scope."* Filing a board into a space grants nobody access to it. Spaces are owner-only; boards have their own membership. Do not let the two concepts merge.

Every user gets one called **"Unfiled"** at signup.

---

## 4.3 `boards` — the unit of ownership and permission

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | |
| `owner_id` | uuid → `profiles` **NOT NULL** | **Immutable** — a trigger refuses any change |
| `space_id` | uuid → `spaces` | `ON DELETE SET NULL` — deleting a folder does not delete boards |
| `title`, `description`, `icon`, `cover_color` | text | |
| `visibility` | text **NOT NULL** default `'private'` | `'private'` or `'team'`. **Written once, never read** (see §13) |
| `key_prefix` | text **NOT NULL** default `'KAN'` | The `KAN` in `KAN-14`. Must match `^[A-Z][A-Z0-9]{1,9}$` |
| `next_key` | integer **NOT NULL** default `1` | The counter the card-numbering trigger reads and increments |
| `created_at`, `updated_at` | timestamptz | |

**Ownership cannot be transferred.** Two triggers enforce this — one on `boards`, one on `board_members`. This is a deliberate product decision, not an oversight: the migration comments call the operation "does not exist."

---

## 4.4 `board_members` — who can do what, on which board

| Column | Type | Notes |
|---|---|---|
| `board_id` | uuid → `boards` | part of the primary key |
| `user_id` | uuid → `profiles` | part of the primary key |
| `role` | text **NOT NULL** | `owner` \| `admin` \| `editor` \| `viewer` |
| `joined_at` | timestamptz | |

Primary key is the pair `(board_id, user_id)` — one role per person per board, enforced structurally.

**The owner appears here too.** `boards.owner_id` names the owner; `board_members` contains a row for them with `role = 'owner'`. Two sources for one fact, kept in agreement by triggers. Worth remembering: *membership ≠ ownership*, and the code must not use one to mean the other.

**This table has no write permission for the browser at all.** `GRANT SELECT` only — and even that `SELECT` is restricted by RLS to your own row. Every membership change goes through an RPC. The client code says so explicitly in `src/services/members/membersApi.ts`: *"never `.from("board_members").select()` — that table is self-read only, would silently return just the caller's own row."*

---

## 4.5 `board_invites` — pending invitations

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | |
| `board_id` | uuid → `boards` | cascade |
| `token` | text **NOT NULL UNIQUE** | **The credential.** Generated in the database, 24 random bytes as hex |
| `role` | text **NOT NULL** | `admin` \| `editor` \| `viewer` — note `owner` is **not** in the list |
| `email` | text | optional; used to match an existing account and notify them |
| `expires_at` | timestamptz **NOT NULL** | |
| `accepted_at` | timestamptz | null = unused; non-null = spent |
| `created_by` | uuid → `profiles` | `ON DELETE SET NULL` |
| `created_at` | timestamptz | |

**Whoever holds the token can join the board.** That makes the token a password, and the design reflects it: it is generated server-side (never in the browser), and **revoking an invite deletes the row** so that a revoked token and a token that never existed are indistinguishable from outside.

---

## 4.6 `columns` — the vertical lanes on a board

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | |
| `board_id` | uuid → `boards` **NOT NULL** | cascade |
| `title` | text | user-editable free text |
| `category` | text | `todo` \| `in_progress` \| `done` |
| `rank` | double precision | the real ordering (see §4.7) |
| `position` | bigint | legacy integer ordering, now only a fallback |
| `min_limit`, `max_limit` | integer | advisory work-in-progress limits |
| `created_at`, `updated_at` | timestamptz | |

Also carries `UNIQUE (id, board_id)` — redundant on its own (id is already unique), but required so that `todos` can point at the *pair* and thereby prove a card and its column are on the same board.

**`category` vs `title`:** the title is whatever the user typed and is never translated. The category is one of three fixed values and *is* translated. Running a title through the translation system was an actual bug once — renaming a column to "todo" made it render as a translation key.

**Limits are advisory.** Exceeding `max_limit` shows a warning and nothing else. Nothing in the drag handler consults them.

---

## 4.7 `todos` — every work item

The central table. Epics, Tasks and Subtasks are all rows here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | **Generated by the browser**, not the database |
| `board_id` | uuid → `boards` **NOT NULL** | cascade |
| `column_id` | uuid | composite FK with `board_id`; `ON DELETE RESTRICT` |
| `parent_id` | uuid | composite FK to `todos` itself; `ON DELETE CASCADE` |
| `sprint_id` | uuid → `sprints` | `ON DELETE SET NULL` |
| `board_key` | integer | the `14` in `KAN-14`; assigned by trigger |
| `title`, `description` | text | |
| `type` | text **NOT NULL** | `Task` \| `Bug` \| `Story` \| `Feature` \| `Epic` |
| `priority` | text | `lowest` \| `low` \| `medium` \| `high` \| `highest` |
| `estimate` | numeric | story points, `>= 0` |
| `assignee_id`, `creator_id` | uuid → `profiles` | both `ON DELETE SET NULL` |
| `start_date`, `due_date` | timestamptz | `start_date <= due_date` enforced |
| `rank` | double precision | order within its Kanban column |
| `backlog_rank` | double precision | order within its backlog / sprint section |
| `position` | bigint | legacy integer ordering, fallback only |
| `archived` | boolean **NOT NULL** default false | **unused** (see §13) |
| `status`, `previous_status` | text | **dead columns** (see §13) |
| `created_at`, `updated_at` | timestamptz | |

Four things here deserve explanation.

### The id comes from the browser

`crypto.randomUUID()` in JavaScript. This is unusual and it is deliberate: when you drag a card, the UI updates instantly with a row it invented, and when the server confirms, *it is the same row* — same id. No reconciliation step, no `isOptimistic` flag anywhere in the codebase.

It is also why the client **upserts** instead of inserting: a retry cannot create a duplicate.

### Two rank columns, both fractional

`rank` is a floating-point number, not a position index. To drop a card between two neighbours ranked `1024` and `2048`, the client computes `1536` and writes **one row**.

The alternative — renumbering the whole column 0,1,2,3… — is what the app used to do, and it meant two people dragging at the same time overwrote each other's cards, *including cards neither had touched*.

`backlog_rank` is the same idea for a different question. A card's place in a Kanban column and its place in a sprint's planning list are unrelated, so they are separate columns.

Floating point eventually runs out of room between two neighbours. When that happens the client calls a rebalance function that respaces the whole column.

### `column_id` and `sprint_id` are independent

This is the trap the codebase warns about most loudly.

- `column_id` answers: **is this on the board?**
- `sprint_id` answers: **is this planned into a sprint?**

They are not the same question and must not be combined. A card with a column and no sprint is on the board. A card with a column *and* a sprint is on the board only if that sprint is the running one.

A previous change made board membership require the active sprint, and it **emptied every board** and made every newly created card invisible.

### Hierarchy comes from `parent_id` alone

There is no `Subtask` type. A row's role is read from its parent:

- no parent → **top level** (an Epic, or a standalone Task)
- parent is an Epic → **Task**
- parent is anything else → **Subtask**

A trigger enforces this (§7.4).

---

## 4.8 `sprints` — time-boxed containers

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | |
| `board_id` | uuid → `boards` **NOT NULL** | cascade |
| `name` | text **NOT NULL** | 1–120 characters trimmed |
| `goal` | text | |
| `state` | text **NOT NULL** default `'future'` | `future` \| `active` \| `completed` |
| `start_date`, `end_date` | timestamptz | `start <= end` enforced |
| `rank` | double precision **NOT NULL** default 1024 | order in the backlog view |
| `created_at`, `updated_at` | timestamptz | |

**A sprint is a container with a lifecycle, not a work item** — which is why it is its own table rather than another `todos.type`.

**At most one sprint per board can be `active`.** This is enforced by a *partial unique index* — a unique index with a `WHERE state = 'active'` clause. That is what makes the client's `sprints.find(s => s.state === 'active')` safe: the database guarantees there is never a second one.

Deleting a sprint does **not** delete its work — `todos.sprint_id` is `ON DELETE SET NULL`, so the cards simply return to the backlog.

---

## 4.9 `comments` — discussion on a work item

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | browser-generated |
| `board_id` | uuid **NOT NULL** | denormalised from the todo |
| `todo_id` | uuid **NOT NULL** | composite FK with `board_id`; cascade |
| `author_id` | uuid → `profiles` **NOT NULL** | **cascade** |
| `content` | text **NOT NULL** | must not be blank after trimming |
| `created_at`, `updated_at` | timestamptz | |

**Why `board_id` is duplicated here** even though it could be looked up through `todo_id`: every security rule then becomes a single-column check on this table, with no join. And it cannot drift, because the composite foreign key points at `todos (id, board_id)` — the pair must exist together.

**The `authenticated` role is granted `UPDATE (content)` only** — a column-level grant. Even if a policy allowed it, the database would refuse an attempt to change `author_id`.

---

## 4.10 `attachments` — files on a work item

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | |
| `board_id` | uuid **NOT NULL** | composite FK with `todo_id`; cascade |
| `todo_id` | uuid **NOT NULL** | |
| `uploader_id` | uuid → `profiles` | **`ON DELETE SET NULL`** |
| `filename` | text **NOT NULL** | the display name; must not be blank |
| `storage_path` | text **NOT NULL UNIQUE** | the key of the actual file in storage |
| `size_bytes` | bigint **NOT NULL** | `>= 0` |
| `mime_type` | text **NOT NULL** | |
| `created_at` | timestamptz | |

**Note what is missing: there is no `updated_at`.** There is also no UPDATE policy and no UPDATE grant. Attachments are **immutable by construction** — renaming a file means deleting it and uploading again.

**`uploader_id` sets null on delete; `comments.author_id` cascades.** That difference is intentional and documented: a comment is *its author's words*, a file is *a contribution to a shared work item*. Do not "tidy" them into agreement.

`storage_path` is UNIQUE so that the row and the file are exactly one pair.

---

## 4.11 `activities` — board history

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | |
| `board_id` | uuid → `boards` **NOT NULL** | cascade |
| `actor_id` | uuid → `profiles` | `ON DELETE SET NULL` |
| `entity_type` | text **NOT NULL** | `todo` \| `column` \| `member` |
| `entity_id` | uuid | **deliberately not a foreign key** |
| `action` | text **NOT NULL** | `created`, `moved`, `assigned`, … |
| `payload` | jsonb **NOT NULL** default `{}` | a snapshot of the details |
| `created_at` | timestamptz | |

Three design points worth understanding:

**`entity_id` has no foreign key on purpose.** An entry must still make sense after the thing it describes is deleted. "Alice deleted KAN-7" cannot point at KAN-7; it no longer exists. A cascade here would rewrite history.

**`payload` stores titles and names, not just ids**, for the same reason — an entry must be renderable without joining anything that may have been deleted.

**The pair `(entity_type, action)` is checked together**, not each column separately. Checking them independently would allow `('member', 'moved')` — a combination no code writes and no reader can render. One constraint over the pair is the complete statement of what an entry may be.

**This table has no INSERT permission for anyone but `service_role`.** Only triggers write it. That is what makes an entry *evidence* rather than a claim.

---

## 4.12 `notifications` — the personal inbox

| Column | Type | Notes |
|---|---|---|
| `id` | uuid **PK** | |
| `user_id` | uuid → `profiles` **NOT NULL** | whose inbox; cascade |
| `type` | text **NOT NULL** | `invite` \| `assigned` |
| `board_id` | uuid → `boards` | nullable; cascade |
| `entity_type` | text | `todo` \| `invite` |
| `entity_id` | uuid | **no foreign key**, same reasoning as `activities` |
| `actor_id` | uuid → `profiles` | who caused it; `ON DELETE SET NULL` |
| `payload` | jsonb **NOT NULL** | board title, item title, actor name |
| `read_at` | timestamptz | **null means unread** |
| `created_at` | timestamptz | |

**`read_at` is a nullable timestamp, not a boolean.** "When you read it" is strictly more information than "whether you read it", and costs the same.

Like `activities`, this is **trigger-written only**. There is no insert grant.

---

# 5. Relationships

## The shape, in one picture

```
auth.users (Supabase-owned)
     │ 1:1, cascade
     ▼
  profiles ──────────┬──────────────┬─────────────┬──────────────┐
     │               │              │             │              │
     │ owns          │ member of    │ authored    │ assigned /   │ recipient
     │               │              │             │ created      │
     ▼               ▼              ▼             ▼              ▼
  spaces        board_members    comments       todos      notifications
     │               │              ▲             │
     │ files         │              │             │
     ▼               ▼              │             │
  boards ◄───────────┘              │             │
     │                              │             │
     ├──< columns ◄─────────────────┼─────────────┤ (column_id, board_id)
     ├──< sprints ◄─────────────────┼─────────────┤ (sprint_id)
     ├──< board_invites             │             │
     ├──< activities                │             │
     └──< todos ────────────────────┴──< attachments
              └──< todos  (parent_id — self-reference)
```

## Every foreign key, and what happens on delete

| From | To | On delete | Why that choice |
|---|---|---|---|
| `profiles.id` | `auth.users.id` | cascade | the profile has no meaning without the account |
| `spaces.owner_id` | `profiles.id` | cascade | a personal folder |
| `boards.owner_id` | `profiles.id` | cascade | |
| `boards.space_id` | `spaces.id` | **set null** | deleting a folder must not delete the boards in it |
| `board_members.board_id` | `boards.id` | cascade | |
| `board_members.user_id` | `profiles.id` | cascade | |
| `board_invites.board_id` | `boards.id` | cascade | |
| `board_invites.created_by` | `profiles.id` | **set null** | the invite outlives the inviter's account |
| `columns.board_id` | `boards.id` | cascade | |
| `todos.board_id` | `boards.id` | cascade | |
| `todos.(column_id, board_id)` | `columns (id, board_id)` | **restrict** | you cannot delete a column with cards in it — they are rehomed first |
| `todos.(parent_id, board_id)` | `todos (id, board_id)` | cascade | deleting a parent deletes its children |
| `todos.sprint_id` | `sprints.id` | **set null** | deleting a sprint returns its work to the backlog |
| `todos.creator_id` | `profiles.id` | **set null** | a departing person's work survives |
| `todos.assignee_id` | `profiles.id` | **set null** | |
| `sprints.board_id` | `boards.id` | cascade | |
| `comments.(todo_id, board_id)` | `todos (id, board_id)` | cascade | a thread on a deleted card is an orphan, not history |
| `comments.author_id` | `profiles.id` | **cascade** | a comment is its author's own words |
| `attachments.(todo_id, board_id)` | `todos (id, board_id)` | cascade | |
| `attachments.uploader_id` | `profiles.id` | **set null** | a file is a contribution to a shared item |
| `activities.board_id` | `boards.id` | cascade | |
| `activities.actor_id` | `profiles.id` | **set null** | history outlives the account |
| `notifications.user_id` | `profiles.id` | cascade | |
| `notifications.board_id` | `boards.id` | cascade | |
| `notifications.actor_id` | `profiles.id` | **set null** | |

## Composite foreign keys — the pattern worth understanding

Four foreign keys point at a **pair** of columns rather than one:

```
todos.(column_id, board_id)      → columns (id, board_id)
todos.(parent_id, board_id)      → todos   (id, board_id)
comments.(todo_id, board_id)     → todos   (id, board_id)
attachments.(todo_id, board_id)  → todos   (id, board_id)
```

**Why.** Without them, `board_id` on a comment is just a claim the browser makes, and the security policy believes it. Someone could file a comment under a board they *can* reach while pointing it at a card on a board they *cannot*.

Pointing at the pair makes that impossible: PostgreSQL will only accept the row if a todo exists with **both** that id and that board. The two can never disagree.

This pattern requires the target table to have a `UNIQUE (id, board_id)` constraint, which is why both `columns` and `todos` carry one that looks redundant.

## Indexes

| Table | Index | Kind |
|---|---|---|
| `profiles` | `profiles_username_lower_key` on `lower(username)` | unique, expression |
| `boards` | `boards_owner_id_idx`, `boards_space_id_idx` | |
| `board_members` | `board_members_user_id_idx`, `board_members_board_id_idx` | |
| `board_invites` | `board_invites_board_id_idx` | |
| `spaces` | `spaces_owner_id_idx` | |
| `columns` | `columns_board_id_rank_idx`, `columns_board_id_position_idx` | |
| `todos` | `todos_board_id_idx`, `todos_column_id_rank_idx`, `todos_column_id_position_idx`, `todos_parent_idx` | |
| `todos` | `todos_board_key_unique` on `(board_id, board_key)` | **unique** |
| `todos` | `todos_sprint_id_idx` | **partial** — `WHERE sprint_id IS NOT NULL` |
| `todos` | `todos_backlog_idx` on `board_id` | **partial** — `WHERE column_id IS NULL` |
| `sprints` | `sprints_board_id_idx` | |
| `sprints` | `sprints_one_active_per_board` on `board_id` | **partial unique** — `WHERE state = 'active'` |
| `comments` | `comments_todo_created_idx` | |
| `attachments` | `attachments_todo_created_idx` | |
| `activities` | `activities_board_created_idx`, `activities_board_entity_idx` | |
| `notifications` | `notifications_user_created_idx` | |
| `notifications` | `notifications_user_unread_idx` on `user_id` | **partial** — `WHERE read_at IS NULL` |

**Partial indexes** are indexes over a subset of rows. `notifications_user_unread_idx` only contains unread rows, so the unread-badge count reads a small index instead of scanning the whole inbox. A **partial unique index** additionally enforces a rule — `sprints_one_active_per_board` is what makes "at most one active sprint per board" a guarantee rather than a convention.

---

# 6. Constraints — the rules the database refuses to break

A constraint is a rule PostgreSQL enforces on **every** writer: the browser, an RPC, a trigger, a migration, a `psql` session. It cannot be bypassed.

The project's working agreement states the principle directly: *an invariant that must hold for every writer belongs in a constraint.*

## CHECK constraints

| Table | Constraint | Rule | Why it exists |
|---|---|---|---|
| `profiles` | `profiles_username_shape` | `username ~ '^[a-z0-9][a-z0-9_]{2,29}$'` | 3–30 chars, lowercase, starts alphanumeric |
| `spaces` | `spaces_title_length` | 1–60 chars after trimming | stops a title of three spaces rendering as a blank sidebar row |
| `boards` | `boards_key_prefix_format` | `^[A-Z][A-Z0-9]{1,9}$` | the `KAN` part of a card key |
| `boards` | *(visibility)* | `visibility in ('private','team')` | |
| `board_members` | *(role)* | `role in ('owner','admin','editor','viewer')` | the complete list of roles |
| `board_invites` | *(role)* | `role in ('admin','editor','viewer')` | **`owner` is absent** — ownership is not grantable by invitation |
| `columns` | `columns_category_check` | `category in ('todo','in_progress','done')` | |
| `columns` | `columns_limits_check` | both `>= 0` if set, and `min <= max` | |
| `todos` | `todos_type_check` | `type in ('Bug','Task','Story','Feature','Epic')` | note: **no `Subtask`** — being a subtask is structural |
| `todos` | `todos_priority_check` | `priority in ('lowest','low','medium','high','highest')` | |
| `todos` | `todos_estimate_check` | `estimate is null or estimate >= 0` | **null and 0 are different answers** |
| `todos` | `todos_date_range_check` | `start_date <= due_date` when both set | |
| `todos` | `todos_parent_not_self` | `parent_id <> id` | a card cannot be its own parent |
| `sprints` | `sprints_state_check` | `state in ('future','active','completed')` | |
| `sprints` | `sprints_date_range_check` | `start_date <= end_date` | |
| `sprints` | `sprints_name_check` | 1–120 chars trimmed | |
| `comments` | `comments_content_not_blank` | non-blank after trimming | |
| `attachments` | `attachments_filename_not_blank` | non-blank after trimming | |
| `attachments` | `attachments_size_non_negative` | `size_bytes >= 0` | |
| `notifications` | *(type)* | `type in ('invite','assigned')` | |
| `notifications` | *(entity_type)* | `entity_type in ('todo','invite')` | |
| `activities` | `activities_event_valid` | **the pair** `(entity_type, action)` is in an explicit list of 16 | see below |

### The one that teaches the most: `activities_event_valid`

```sql
constraint activities_event_valid check (
  (entity_type, action) in (
    ('todo',   'created'), ('todo',   'moved'),    ('todo', 'assigned'),
    ('todo',   'retitled'), ('todo',  'deleted'),  ('todo', 'priority_changed'),
    ('todo',   'due_changed'), ('todo', 'type_changed'),
    ('todo',   'description_changed'), ('todo', 'estimate_changed'),
    ('column', 'created'), ('column', 'renamed'),  ('column', 'deleted'),
    ('member', 'added'),   ('member', 'role_changed'), ('member', 'removed')
  )
)
```

Checking `entity_type in (…)` and `action in (…)` *separately* would admit `('member', 'moved')` — a combination no trigger writes and no part of the UI can render. Checking the **pair** is the complete statement of what an entry may be.

## Why some rules are enums-by-CHECK rather than PostgreSQL `ENUM` types

Every fixed set here (`role`, `category`, `type`, `priority`, `state`) is a `text` column with a CHECK constraint, not a real `ENUM` type and not a lookup table.

The reasoning, from the migration comments: these are sets **the product defines and users never define**. Widening one is a simple `ALTER … DROP CONSTRAINT … ADD CONSTRAINT` in a migration, whereas changing a PostgreSQL `ENUM` is more awkward, and a lookup table would add a join to every query for a set that has three members.

## Unique constraints

| Table | Unique on | Purpose |
|---|---|---|
| `profiles` | `lower(username)` | case-insensitive handle uniqueness |
| `board_members` | `(board_id, user_id)` — the primary key | one role per person per board |
| `board_invites` | `token` | the credential is the key |
| `columns` | `(id, board_id)` | supports the composite FK from `todos` |
| `todos` | `(id, board_id)` | supports three composite FKs |
| `todos` | `(board_id, board_key)` | card numbers are unique per board |
| `sprints` | `board_id` **where** `state = 'active'` | at most one running sprint |
| `attachments` | `storage_path` | one row ↔ one file |

---

# 7. Triggers and functions

## 7.1 The full trigger list

**17 triggers on `public`**, backed by **12 trigger functions** (`set_updated_at` backs six of them). Two more sit on `auth.users` and have no counterpart in a standalone PostgreSQL.

> **Corrected 2026-09-15.** An earlier revision of this table listed 18 rows and was wrong twice: it omitted `boards_add_owner_membership`, and it counted the two `auth.users` triggers inside the `public` total. `todos_enforce_subtask_depth` is **not** live — `20260829090000_todo_epic_hierarchy.sql` drops it and replaces it with `todos_enforce_work_item_hierarchy`.

| Trigger | On table | Fires | Function | What it does |
|---|---|---|---|---|
| `boards_set_updated_at` | `boards` | BEFORE UPDATE | `set_updated_at` | stamps `updated_at = now()` |
| `columns_set_updated_at` | `columns` | BEFORE UPDATE | `set_updated_at` | " |
| `todos_set_updated_at` | `todos` | BEFORE UPDATE | `set_updated_at` | " |
| `spaces_set_updated_at` | `spaces` | BEFORE UPDATE | `set_updated_at` | " |
| `comments_set_updated_at` | `comments` | BEFORE UPDATE | `set_updated_at` | " |
| `sprints_set_updated_at` | `sprints` | BEFORE UPDATE | `set_updated_at` | " |
| `todos_assign_board_key` | `todos` | BEFORE INSERT | `assign_todo_board_key` | allocates the `KAN-14` number |
| `todos_enforce_work_item_hierarchy` | `todos` | BEFORE INSERT/UPDATE OF `parent_id`, `type`, `sprint_id` | `enforce_work_item_hierarchy` | keeps the three-level shape valid |
| `boards_add_owner_membership` | `boards` | AFTER INSERT | `add_owner_membership` | **inserts the owner's `board_members` row.** See 7.2b |
| `boards_owner_immutable` | `boards` | BEFORE UPDATE | `enforce_board_owner_immutable` | freezes `owner_id` |
| `board_members_owner_immutable` | `board_members` | BEFORE INSERT/UPDATE/DELETE | `enforce_owner_membership_immutable` | protects the owner's membership row |
| `boards_space_ownership` | `boards` | BEFORE INSERT/UPDATE | `boards_space_ownership` | only the owner may file a board into a space they own |
| `todos_log_activity` | `todos` | AFTER INSERT/UPDATE/DELETE | `log_todo_activity` | writes the activity feed |
| `columns_log_activity` | `columns` | AFTER INSERT/UPDATE/DELETE | `log_column_activity` | " |
| `board_members_log_activity` | `board_members` | AFTER INSERT/UPDATE/DELETE | `log_member_activity` | " |
| `board_invites_notify` | `board_invites` | AFTER INSERT | `notify_on_invite` | notification inbox |
| `todos_notify_assignment` | `todos` | AFTER INSERT/UPDATE | `notify_on_assignment` | " |
| — *the two below are on `auth.users`, outside the 17* | | | | |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user` | creates the profile row. **Not defined in any migration** — created through the dashboard before the baseline. See §13.7 |
| `on_auth_user_confirmed` | `auth.users` | AFTER UPDATE OF `email_confirmed_at` | `handle_user_confirmed` | provisions the board and columns |

### Not triggers

`rebalance_column_ranks(column)` and `rebalance_board_column_ranks(board)` are **plain functions called as RPCs** by the client when fractional ranks run out of room. They are maintenance routines, not trigger functions, and are listed under §7.8.

## 7.2 `assign_todo_board_key` — the card numbering

Cards are labelled `KAN-14`, not by their uuid (unreadable) but by a per-board counter.

```
BEFORE INSERT on todos:
  1. if board_key was supplied explicitly → keep it, return
  2. if a row with this id already exists → this is an upsert-that-is-really-an-update, return
  3. UPDATE boards SET next_key = next_key + 1 WHERE id = … RETURNING next_key - 1
```

**Step 2 matters more than it looks.** PostgREST turns an upsert into `INSERT … ON CONFLICT DO UPDATE`, and a `BEFORE INSERT` trigger fires *before* the conflict is detected. Without that check, the old `reorderTodos` call — which upserts a whole column on every drag — would burn a key per card per drag.

**Step 3 takes a row lock on the board.** Two people creating a card at the same moment serialise, so they cannot be handed the same number.

**Keys are never reused.** Delete KAN-2, create another card, and you get KAN-4. `board_key` is null for the instant a card is in flight, and **that absence is how the UI knows the card is still pending.**

## 7.3 `set_updated_at`

Three lines. It exists because "the client sets `updated_at`" is a rule that holds until the first code path forgets.

## 7.4 `enforce_work_item_hierarchy` — the three-level rule

The single place the Epic → Task → Subtask shape is enforced. **Nothing in React re-checks it.**

It refuses, in order:

1. An Epic with a parent.
2. Changing a row away from `Epic` while one of its children has children of its own — that would silently create a fourth level.
3. A parent that does not exist **on the same board**.
4. A Subtask under a Subtask.
5. A row that already has children becoming a subtask itself.
6. A Subtask carrying its own `sprint_id` — a subtask inherits its parent's sprint, read at display time, never stored.

Everything else passes. Notably, a Task under an Epic may carry any sprint it likes, independent of the Epic's — those are two separate relationships by design.

## 7.2b `add_owner_membership` — how a board gets its first member

**This trigger was missing from the first revision of this audit, and it is load-bearing.**

```
AFTER INSERT on boards:
  insert into board_members (board_id, user_id, role, joined_at)
  values (new.id, new.owner_id, 'owner', new.created_at)
  on conflict (board_id, user_id) do nothing;
```

**Why it cannot be left to application code.** Permission on a board is read from `board_members`. A freshly inserted board has no membership rows, so there is no membership that could authorize inserting the first one — `board_role()` returns NULL even for the owner, and every RLS write policy denies them. The trigger is `SECURITY DEFINER` precisely so that this one insert bypasses a table that has no INSERT policy at all.

Its own function comment puts it plainly: *"This is the only writer that mints a board's first membership — the row cannot be authorized by membership, because there is none yet."*

**Consequence for a standalone backend.** Without an equivalent, `POST /boards` creates a board its own owner cannot read, edit or delete. Either the trigger comes across, or the board-creation service inserts both rows in one transaction. The trigger is the safer of the two, because it also covers a board created by a seed script, a migration or a `psql` session.

It pairs with `board_members_owner_immutable`, which then refuses to let that row be changed or deleted.

## 7.5 The two ownership triggers

`enforce_board_owner_immutable` refuses any change to `boards.owner_id`. Full stop.

`enforce_owner_membership_immutable` is the other half, on `board_members`, and it is more subtle:

- **On DELETE** of an owner row: refuse — *unless* the board itself is already gone, or the profile is already gone. Those two exceptions are the cascade case, and they are checked by looking for the parent row rather than by trusting the ordering of cascades (which PostgreSQL does not guarantee).
- **On UPDATE:** an owner row's `role`, `user_id` and `board_id` are all frozen. Separately, no row may be *promoted into* ownership.
- **On INSERT** of an owner row: it must agree with `boards.owner_id`, and there must not already be one.

Together these guarantee: exactly one owner per board, always matching `boards.owner_id`, and **ownership transfer does not exist as an operation.**

## 7.6 The three activity loggers

`log_todo_activity` is the largest. On UPDATE it checks fields independently and can write **several rows for one update** — a patch that retitles and reassigns a card produces two entries, because collapsing them would mean the feed could not say which happened.

Two details worth learning from:

**It uses `IS DISTINCT FROM`, not `<>`.** Both sides are nullable (an unassigned card, a card in no column). `NULL <> 'x'` evaluates to `NULL`, which is not true — so a genuine change to or from null would be silently dropped by `<>`.

**It records titles, not just ids.** A column can be deleted, so an entry holding only `to_column_id` becomes unreadable the moment the destination goes away.

**It is silent on rank, position and other field changes** — a drag must not fill the feed.

## 7.7 The two notification triggers

`notify_on_invite` — on a new invite with an email, look for an existing account with that address and, if found and it is not the inviter themselves, insert a notification.

`notify_on_assignment` — when `assignee_id` changes to someone other than the actor, notify them. It checks `TG_OP` before touching `OLD`, because `OLD` does not exist on an INSERT.

## 7.8 The database functions (RPCs), grouped

### Permission helpers — the heart of the security model

| Function | Returns | Purpose |
|---|---|---|
| `accessible_board_ids()` | set of uuid | boards you own **∪** boards you are a member of |
| `board_role(board_id)` | text | your role there, or NULL |
| `is_board_member(board_id)` | boolean | |
| `is_board_owner(board_id, user_id)` | boolean | |
| `board_role_rank(role)` | integer | viewer 1, editor 2, admin 3, owner 4 |
| `owns_space(space_id)` | boolean | |

All are `SECURITY DEFINER` and `STABLE`. Being stable and row-independent means PostgreSQL evaluates them **once per statement**, not once per row — which is why a policy reading `accessible_board_ids()` is not slow.

`accessible_board_ids()` is described in the codebase as *"the single swap point"* — and it has already proved it once. When the project moved from owner-only boards to shared membership, this one function was widened and **not a single policy needed editing.**

### Membership and invitations

`add_board_member`, `set_member_role`, `remove_board_member`, `leave_board`, `board_roster`, `create_invite`, `accept_invite`, `decline_invite`, `revoke_invite`, `my_pending_invites`, `search_board_invitees`.

These carry rules the policies do not. Two appear in all of them:

1. **Ownership is never grantable.** Each refuses `'owner'` explicitly, *and* the rank arithmetic would also catch it. Two independent refusals, so the rule survives a future edit to the arithmetic.
2. **Strictly below your own rank.** `if actor_rank <= new_rank then raise` — one line, two rules: an admin cannot promote another admin, and nobody can grant above themselves.

`create_invite` contains the best comment in the repository, and it is worth reading before writing any replacement:

> Validate the requested role **before** any rank comparison can see a NULL. `null <= 3` is NULL and an `IF` on NULL does not branch, which would turn a deny into an allow — the single most dangerous shape in this file.

`accept_invite` locks the invite row with `SELECT … FOR UPDATE`. Without that lock, two people opening the same link at the same instant would both read `accepted_at` as NULL and both be admitted. It also returns a clean `already_member` **before** checking whether the invite is spent, which is what makes a repeated click by the person who just accepted idempotent rather than an error.

### Multi-step operations

| Function | What it does in one transaction |
|---|---|
| `delete_column(column, destination)` | validates both are on the same board, moves the cards across appending after the destination's last card, then deletes the column |
| `start_sprint(sprint)` | must be `future`; finds the board's first `todo`-category column; assigns it to every sprint item that has none; sets `active` |
| `complete_sprint(sprint, move_to?)` | must be `active`; moves every item **not** in a `done` column to the destination sprint or to the backlog; sets `completed`. Finished items keep their `sprint_id` as the record of what shipped |
| `provision_user(user_id)` | creates profile + "Unfiled" space + "My Board" + four default columns. **Idempotent** |
| `provision_new_user()` | the same, for the current session |

**Why these are functions and not several client calls:** a function body is one transaction. Two client writes are not. A dropped connection halfway through `delete_column` used to leave cards orphaned or a column half-deleted.

### Username helpers

`normalize_username`, `is_valid_username`, `username_available`, `available_username` (resolves a taken name to a free suggestion), `login_email_for` (turns a username into the email GoTrue authenticates with — callable by `anon`, because the login screen is signed out).

### Maintenance

`rebalance_column_ranks(column)`, `rebalance_board_column_ranks(board)` — respace ranks when fractional values run out of room. `prune_activities(keep_days)` — deletes old history, `service_role` only, scheduled weekly via `pg_cron` if that extension is present.

---

# 8. RLS policies and what they enforce

## 8.1 Two layers, not one

Before the policies: **PostgreSQL grants**. A policy can only narrow what a grant already permits.

| Table | What `authenticated` is granted |
|---|---|
| `boards`, `spaces` | SELECT, INSERT, UPDATE, DELETE |
| `columns`, `todos` | full DML (inherited from the original baseline) |
| `sprints` | SELECT, INSERT, UPDATE, DELETE |
| `comments` | SELECT, INSERT, DELETE, **UPDATE (content) only** |
| `attachments` | SELECT, INSERT, DELETE — **no UPDATE** |
| `activities` | **SELECT only** |
| `board_invites` | **SELECT only** |
| `board_members` | **SELECT only** |
| `notifications` | SELECT, UPDATE, DELETE — **no INSERT** |
| every table | `anon` is revoked from all of them |

Read that column carefully — it is half the security model. `activities` and `notifications` **cannot be written by the browser at all**, regardless of any policy, which is what makes them evidence. `comments` has a **column-level** UPDATE grant, so an attempt to change `author_id` is refused by the grant before any policy runs.

## 8.2 The policies

### Board-scoped tables — `columns`, `todos`, `sprints`, `activities`, `attachments`, `comments`

**Read:**
```sql
using (board_id in (select public.accessible_board_ids()))
```
*In plain terms:* you can see rows on boards you own or are a member of.

**Write** (`columns`, `todos`, `sprints`):
```sql
using / with check (public.board_role(board_id) in ('owner','admin','editor'))
```
*In plain terms:* you can change things only if you are at least an editor. A viewer is refused. `board_role()` returns NULL for a non-member, and `NULL in (…)` is not true, so non-membership is denied by the same expression — no separate branch needed.

### `boards`

| Operation | Rule |
|---|---|
| SELECT | `owner_id = auth.uid() OR is_board_member(id)` |
| INSERT | `owner_id = auth.uid()` — you cannot create a board owned by someone else |
| UPDATE | `board_role(id) in ('owner','admin')` |
| DELETE | owner only |

### `comments`

| Operation | Rule |
|---|---|
| SELECT | board membership |
| INSERT | `author_id = auth.uid()` **and** any role including viewer — **viewers may comment** |
| UPDATE | author only. No rank widens this: rewriting someone's words is not moderation |
| DELETE | author, **or** admin/owner |

### `attachments`

| Operation | Rule |
|---|---|
| SELECT | board membership — **a viewer reads and downloads every file** |
| INSERT | `uploader_id = auth.uid()` **and** role ≥ editor |
| UPDATE | **no policy exists** — attachments are immutable |
| DELETE | admin/owner, **or** the uploader (who must be ≥ editor) |

**Attachments and comments deliberately disagree.** A viewer may comment but may not attach. `src/services/members/permissions.ts` records this as the one intentional divergence between the two matrices.

### `notifications`

All three policies are `user_id = auth.uid()`. There is no INSERT policy and no INSERT grant.

### `spaces`

All four are `owner_id = auth.uid()`. Spaces are strictly personal.

### `board_members`

One policy, SELECT only: `user_id = auth.uid()`. **You can only see your own membership row.** The roster comes from the `board_roster` RPC instead, which checks membership and then returns everyone.

### `board_invites`

One policy, SELECT only: `board_role(board_id) in ('owner','admin')`. Creation and revocation are RPC-only.

### `profiles`

One policy from the original baseline: `auth.uid() = id`, for all operations.

## 8.3 The complete role matrix

| Operation | viewer | editor | admin | owner |
|---|:-:|:-:|:-:|:-:|
| read board, columns, todos, sprints, comments, attachments, activities | ✓ | ✓ | ✓ | ✓ |
| create / edit / delete todos, columns, sprints | | ✓ | ✓ | ✓ |
| upload an attachment | | ✓ | ✓ | ✓ |
| download an attachment | ✓ | ✓ | ✓ | ✓ |
| post a comment | ✓ | ✓ | ✓ | ✓ |
| edit own comment | ✓ | ✓ | ✓ | ✓ |
| delete own comment | ✓ | ✓ | ✓ | ✓ |
| delete own attachment | — | ✓ | ✓ | ✓ |
| delete anyone's comment or attachment | | | ✓ | ✓ |
| change board settings | | | ✓ | ✓ |
| invite, add, remove, re-role members | | | ✓ | ✓ |
| delete the board | | | | ✓ |
| transfer ownership | **nobody — the operation does not exist** |

Plus one rule that cuts across the whole table: **you may only act on, or grant, a role strictly below your own.** An admin cannot remove another admin.

## 8.4 The consequence for the migration

**Most queries in `src/services/` are deliberately incomplete**, because RLS finishes them. A few examples, all correct today:

```ts
// notificationsApi.ts — no user filter at all; RLS adds user_id = auth.uid()
.from("notifications").update({ read_at }).is("read_at", null)

// forYouApi.ts — no board filter; RLS adds board_id in accessible_board_ids()
.from("todos").select(…).is("parent_id", null).limit(25)

// profileApi.ts — the id comes from the client; RLS refuses anyone else's
.from("profiles").update(…).eq("id", profile.id)
```

Remove RLS without replacing it and the first of those marks **every user's** notifications read.

This is not a criticism of the code — the comments in those files explain the reliance explicitly. It is the single most important thing to carry forward.

---

# 9. Auth and profiles

## 9.1 Two tables, one identity

Supabase owns a schema called `auth` that the project does not control. The table that matters is **`auth.users`**, holding the email, the hashed password (in a column named `encrypted_password` — a misnomer; it is hashed, not encrypted), the confirmation timestamp, and a metadata blob.

`public.profiles` holds everything *the application* wants to know about a person. Its primary key **is** `auth.users.id` — same uuid, one-to-one, cascade on delete.

```
auth.users                       public.profiles
  id            ────1:1────────▶   id  (PK and FK, cascade)
  email                            email      (copy)
  encrypted_password               username   (unique, NOT NULL)
  email_confirmed_at               full_name
  raw_user_meta_data               avatar_url
                                   bio
```

**Why split at all?** `auth.users` is not ours to extend, and it should not be readable by other users. `profiles` is readable by every board member — that is how avatars and comment authors render.

## 9.2 The signup sequence

```
1. Browser: supabase.auth.signUp({ email, password,
                                   options: { data: { username } } })
     └── the username rides in raw_user_meta_data, because there is no
         session yet with which to write profiles directly

2. Supabase inserts into auth.users
     └── TRIGGER on_auth_user_created → handle_new_user()
           inserts profiles (id, email, username)
           username = available_username(requested or email local-part)
           ON CONFLICT (id) DO NOTHING

3. User clicks the confirmation link
     └── auth.users.email_confirmed_at is set
           └── TRIGGER on_auth_user_confirmed → handle_user_confirmed()
                 calls provision_user(id), which creates:
                   • the "Unfiled" space
                   • a board titled "My Board"
                   • four columns: To Do / In Progress / In Review / Done

4. Every later sign-in: the client calls provision_new_user() again
     └── idempotent; repairs an account whose provisioning failed
```

Three design choices here are worth understanding, because they will need deliberate reproduction:

**`handle_new_user` must never raise.** It runs *inside* the `auth.users` insert. If it threw, account creation itself would fail.

**`handle_user_confirmed` swallows every error** and only logs a warning. The comment states the reasoning: provisioning must not be load-bearing for confirming an account. The user gets in either way; the next sign-in repairs the board.

**`provision_user` is idempotent by looking for an existing board first.** Signup can be retried — a dropped connection after the account exists is ordinary — and a retry must not mint a second board.

## 9.3 Login by username

The login form accepts an email *or* a username. A username is resolved by the `login_email_for` RPC, which is `SECURITY DEFINER` and callable by `anon` (the login screen has no session).

When a username does not exist, the client throws the **same** literal message as a wrong password — `"Invalid login credentials"` — so the form is not an account-existence oracle.

## 9.4 What `auth.uid()` actually is

`auth.uid()` reads the user id out of the JWT that Supabase attaches to the request. It appears in roughly 30 policies, 8 trigger functions and most RPCs.

**It has no equivalent in a standalone PostgreSQL.** Every one of those uses will need a replacement, and how to replace it is an open question (§14).

---

# 10. Storage

Supabase Storage is an object store with its own tables in a `storage` schema. Access is controlled by RLS policies on `storage.objects`, where the **file path itself is the security key**.

## 10.1 `avatars` — public bucket

| Setting | Value |
|---|---|
| Public | yes |
| Size limit | 2 MB |
| Allowed types | `image/png`, `image/jpeg`, `image/webp` |
| Key shape | `<user_id>/avatar.<ext>` |

Policies: INSERT and UPDATE allowed when `(storage.foldername(name))[1] = auth.uid()::text` — in plain terms, *you may write into a folder named after your own user id, and nowhere else.*

The filename is fixed, so uploading a new avatar overwrites the old one. No orphans accumulate.

## 10.2 `task-attachments` — private bucket

| Setting | Value |
|---|---|
| Public | **no** |
| Size limit | 25 MB (`26214400`) |
| Allowed types | **none configured — any file type is accepted** |
| Key shape | `<board_id>/<todo_id>/<attachment_id>.<ext>` |

Three policies mirror the table policies, reading the **first path segment as the board id**:

| Operation | Rule |
|---|---|
| SELECT | first segment is in `accessible_board_ids()` |
| INSERT | exactly 2 folder levels, and `board_role(first segment) in ('owner','admin','editor')` |
| DELETE | there is an `attachments` row whose `storage_path` equals this object's name, and you are an admin/owner or its uploader |

### Three rules in this feature that are easy to break

**The key contains no user-supplied text.** Because the policies read the first path segment as a board id, a filename able to inject a `/` would let an uploader nominate a different board. The display name lives in `attachments.filename`; the key is built from ids only.

**Downloads force `Content-Disposition: attachment`.** The bucket has no MIME allow-list, so an uploaded `.html` is a stored cross-site-scripting payload waiting for an origin to execute on. Forcing the download header is the entire defence. The one exception is image and PDF previews, which are gated by an explicit allow-list in the client.

**The file is written before the row, and deleted before the row** — on both paths. The storage DELETE policy finds an object *through* its row, so reversing the order creates permanently invisible orphans. This order fails instead to a visible, retryable broken row.

**One known gap:** cascade. Deleting a todo or a board removes `attachments` rows and leaves the objects behind. The sweep query is recorded in the migration header and runs as `service_role`.

---

# 11. Realtime, from the database side

Supabase Realtime works by reading PostgreSQL's **logical replication stream** — the same mechanism a replica uses. A table must be added to a publication called `supabase_realtime` to appear in it.

Exactly three tables are published:

```sql
alter publication supabase_realtime add table public.todos;
alter publication supabase_realtime add table public.columns;
alter publication supabase_realtime add table public.comments;
```

`sprints`, `attachments`, `activities`, `board_members` and `notifications` are **not** live. The UI handles those by refetching.

Two consequences worth understanding:

**Every write broadcasts**, whatever made it — a trigger cascade, a bulk `UPDATE` inside `start_sprint`, even a manual `psql` fix. Nothing has to remember to publish.

**A DELETE event carries only the primary key.** The tables are `REPLICA IDENTITY DEFAULT`, which means the "old row" in a delete payload is just the key. The client is written for that, and it is also why the delete subscriptions are not filtered by `board_id` — such a filter could never match.

RLS applies to the stream too: you only receive rows you would have been allowed to read.

---

# 12. What must be recreated in standalone PostgreSQL

Grouped by how much work each represents. **This is a description of the problem, not a plan for solving it** — the plan is `docs/BACKEND_MIGRATION_PLAN.md`, and the decisions in §14 are still open.

## 12.1 Moves across unchanged — plain PostgreSQL

Nothing in this group references Supabase at all:

- all 12 tables, their columns, types and defaults
- every primary key, foreign key (including the four composite ones) and unique constraint
- all 22 CHECK constraints
- all 8 unique constraints, including the partial unique `sprints_one_active_per_board`
- all 24 indexes, including the partial and expression ones
- `set_updated_at` and its 6 triggers
- `assign_todo_board_key` and its trigger
- `enforce_work_item_hierarchy` and its trigger
- **`add_owner_membership` and its trigger** (§7.2b — without it a new board has no owner membership)
- `enforce_board_owner_immutable`, `enforce_owner_membership_immutable` and their triggers
- `rebalance_column_ranks`, `rebalance_board_column_ranks` — **functions, not triggers**; called as RPCs
- `prune_activities` (the function; its `pg_cron` schedule is a separate question)

That is **6 of the 12 trigger functions, carrying 11 of the 17 triggers**, portable verbatim. The other 6 functions (carrying the other 6 triggers) are §12.2's. `rebalance_*` and `prune_activities` are standalone functions on top of those 12.

**Note the `gen_random_uuid()` default** used by nearly every table. It needs the `pgcrypto` extension on PostgreSQL 12 and earlier; it is **built into core from PostgreSQL 13 onward**, so on the target PostgreSQL 18.6 no extension is required for it.

## 12.2 Needs a small, mechanical change

Six functions are pure PostgreSQL apart from one expression: `(select auth.uid())`.

| Function | Uses `auth.uid()` for |
|---|---|
| `log_todo_activity` | who moved / renamed / assigned the card |
| `log_column_activity` | who created / renamed / deleted the column |
| `log_member_activity` | who changed the membership |
| `notify_on_invite` | not notifying someone about their own action |
| `notify_on_assignment` | the actor, and skipping self-assignment |
| `boards_space_ownership` | whether the caller owns the board and the space |

Each needs some other way for the database to learn who the acting user is. **How is an open question (§14.2).**

## 12.3 Must be replaced entirely — this is the real work

| Thing | Count | What it currently does | What replacing it means |
|---|---|---|---|
| **RLS policies** | ~30 | decide, per row, who can read and write | every rule must be reproduced somewhere else, and **every query in `src/services/` that relies on them must gain the filter it currently omits** |
| **Permission helper functions** | 6 | `accessible_board_ids`, `board_role`, and friends | the same two questions, answered somewhere else |
| **Business-logic RPCs** | ~20 | invites, membership, sprint transitions, column deletion, provisioning | each is a multi-step transaction; the *ordering of their checks* is part of the specification |
| **`auth.users`** | 1 table | email, password hash, confirmation state | our own users table, and a decision about the existing password hashes (§13.1) |
| **GoTrue itself** | — | signup, login, JWT minting and refresh, password reset email | all of it |
| **Supabase Storage** | 2 buckets, 5 policies | the files, and path-based access control | a file store and an access-control path of our own |
| **`supabase_realtime` publication** | 3 tables | live updates for free | some other way to notify connected clients |
| **`anon` / `authenticated` / `service_role` roles** | — | every GRANT and every `to authenticated` clause | a single application role, with access decided elsewhere |
| **`pg_cron`** | 1 job | weekly activity pruning | some scheduler |

## 12.4 The order things must exist in

Not a schedule — a dependency fact. Nothing can be tested without the thing above it:

```
tables + constraints + indexes
   └── triggers that do not need an actor  (updated_at, board_key, hierarchy, ownership)
         └── a way to tell the database who the actor is
               └── triggers that do need one  (activity, notifications, space filing)
                     └── users + passwords + sessions
                           └── the "who can reach which board" question
                                 └── everything else
```

---

# 13. What is still unknown and needs manual verification

Each of these is a fact this audit could **not** establish by reading the repository. Each needs a person to check.

## 13.1 🔴 Are the existing password hashes readable and portable?

**Why it matters more than anything else here.** If yes, every user's password keeps working and nobody is disturbed. If no, all users must reset their password at cutover — which is an email send, a support burden, and a launch date that depends on people reading their inbox.

**How to check** — connect with the database connection string (not the anon key) and run this **read-only** query:

```sql
select count(*)                      as users,
       count(encrypted_password)     as with_hash,
       left(min(encrypted_password), 4) as prefix
  from auth.users;
```

A prefix of `$2a`, `$2b` or `$2y` means bcrypt, which any bcrypt library can verify.

## 13.2 🟡 Do the 69 local migrations match what is actually deployed?

The audit read **files**. It did not confirm that all 69 are applied to the live project, or that nothing was applied out of band.

`docs/IMPLEMENTATION_PLAN.md` is explicit that its last audit skipped this: *"'63 local migrations' is a count of files, not a confirmation that all 63 are applied remotely."*

**How to check:** `npx supabase migration list` against the linked project, and compare a `pg_dump --schema-only` with the schema the migrations produce locally.

## 13.3 🟡 How much data is there, really?

Row counts per table, and object counts and total bytes in both buckets. This determines whether a dump-and-restore takes minutes or hours, which determines the shape of the cutover.

## 13.4 🟡 How many storage objects are orphaned?

The cascade gap in §10.2 is known but unmeasured. The sweep query in the attachments migration header answers it.

## 13.5 🟡 Is `pg_cron` actually installed?

The activity-pruning schedule is wrapped in a conditional that skips silently if the extension is absent. So `activities` may be growing without bound. `select * from cron.job;` answers it — or an error, which is itself the answer.

## 13.6 🟡 Is email confirmation currently on or off?

`supabase/config.toml` holds the local setting, but the **live project's dashboard setting** is what matters, and it is not in the repository. It decides whether `signUp` returns a session immediately, which changes the registration flow.

## 13.7 🟡 Are there database objects the migrations never created?

Anything added through the Supabase dashboard would not appear in `supabase/migrations/`. `CLAUDE.md` forbids this practice — *"a change made in the dashboard is a change that does not exist"* — but the audit cannot confirm the rule was always followed.

**How to check:** `npx supabase db diff` against the linked project. Empty output means the files tell the whole story.

## 13.8 🟢 Confirmed dead, but worth verifying against live data

These are dead **in the code**; a `select count(*) where … is not null` would confirm they are also empty in practice:

| Column | Evidence |
|---|---|
| `todos.status`, `todos.previous_status` | appear only in the generated types. The UI's "status" filter actually filters on `column_id` |
| `todos.archived` | never written, never read |
| `boards.visibility` | set to `'private'` once at board creation, never read anywhere |
| `todos.position`, `columns.position` | still written, but read only as a fallback when `rank` is null |

---

# 14. Open questions — decisions not yet made

**Nothing below was decided in this document.** Each needs a conversation.

### 14.1 Where does authorization live?

The ~30 RLS policies have to become something. The two credible options are keeping RLS (and finding a way to tell PostgreSQL who the user is per request), or moving the rules into application code.

They have genuinely different trade-offs, and the choice affects the shape of every query we write afterwards.

### 14.2 How does the database learn who the actor is?

Six trigger functions need this (§12.2). Either they keep working by some equivalent of `auth.uid()`, or the activity feed and notification inbox become the application's job.

This one matters more than it first appears: a trigger fires for **every** write, including cascades and bulk updates. Application code has to remember.

### 14.3 What happens to the ~20 business-logic RPCs?

They could stay in PL/pgSQL, or be rewritten in TypeScript. Staying means less to port and one transaction per operation for free. Moving means they become testable and debuggable with ordinary tools.

### 14.4 Do we keep the dead columns through the cutover?

Dropping `status`, `previous_status`, `archived` and `visibility` during the migration would mean a rollback has to reason about two changes at once.

### 14.5 What replaces realtime?

Three tables are currently live for free. Whatever replaces it will only broadcast what it is told to broadcast — so the bulk operations that currently publish automatically (`start_sprint`, `delete_column`, `complete_sprint`, cascading deletes) become things someone has to remember.

### 14.6 Where do the files go, and who checks access?

Local disk, S3-compatible object storage, or something else. And whether the API streams the bytes itself or hands out temporary URLs.

### 14.7 What is our password policy?

GoTrue's default was six characters. For a company system used by ~200 people, that is a decision to make consciously rather than inherit.

---

**End of audit. Nothing was implemented, and no decision in §14 was made.**
