# TODO_app

A collaborative work-management application — Jira-style boards, sprints and
work-item hierarchy — built on React 19 over a Node/Express API on PostgreSQL.

Boards live in spaces, carry a four-role permission model enforced server-side,
and render through six views over one shared data pipeline. Changes made by one
member appear on every other open client without a refetch.

## Features

**Work items.** A three-level hierarchy — Epic → Task → Subtask — modelled as a
single self-referencing `parent_id` on one table and enforced by a database
trigger, so an Epic can never be filed under a Task. Items carry a type
(Task, Bug, Story, Feature, Epic), priority, assignee, story-point estimate,
start and due dates, description, comments and a per-item change history. Every
card is addressed by a readable per-board key (`KAN-14`).

**Views.** Six renderings of the same board, each declaring its own
capabilities: **Summary** (the board's front page), **Board** (Kanban with
hand-rolled drag and drop), **List**, **Calendar**, **Timeline** (an
Epic-grouped Gantt with sprint bands and drag-to-reschedule) and **Backlog**.
Filter, search, sort and grouping are properties of the pipeline, so they apply
to whichever view is open.

**Sprints and backlog.** A sprint is a container with its own lifecycle
(future → active → completed), not a work item. Plan from the backlog, start a
sprint to move its work onto the board, and complete it to rehome whatever did
not finish. Board membership and sprint membership are independent facts: an
item is on the board because it has a column, and a sprint holds whatever
carries a `sprint_id` — an Epic or a Task alike.

**Collaboration.** Board members in four roles (viewer, editor, admin, owner)
with every rule enforced in the API rather than in React; link
invitations; comment threads; an activity feed and per-item history; presence;
in-app notifications; and a personal "For You" hub spanning every board you can
reach.

**Interface.** Light and dark themes from a single set of CSS custom
properties, a mobile pass across every view, keyboard-accessible drag and drop
with screen-reader announcements, and optimistic updates throughout.

## Stack

| | |
|---|---|
| Build | Vite 8, TypeScript 6 (`strict`) |
| UI | React 19, Tailwind CSS v4 (CSS-first, no config file), vendored shadcn primitives on Radix + Base UI |
| API | Node 24, Express 5, Prisma 7 — JWT access tokens with refresh-token rotation |
| Data | PostgreSQL 18 |
| State | TanStack Query as the only real state layer |
| Drag and drop | `@dnd-kit/core`, hand-rolled (no `sortable`) |
| Tests | Vitest |

## Docker

The whole stack — frontend, API and PostgreSQL — in one command. Requires
Docker Desktop and nothing else: no Node, no PostgreSQL, no manual setup.

```bash
docker compose up --build
```

Then open **http://localhost:3000** and register an account. Signing up creates
your space, board and its four columns, so there is nothing to seed.

| | |
|---|---|
| Frontend | http://localhost:3000 |
| API health | http://localhost:4000/health |
| PostgreSQL | `localhost:5433` — 5432 is left free for a native install |

```bash
docker compose logs -f      # follow the logs
docker compose down         # stop — the database volume survives
docker compose up -d        # start again on the same data
docker compose up --build   # rebuild after changing code
```

Database data lives in a named Docker volume, `todo-app_pgdata`, so
`docker compose down` followed by `docker compose up -d` keeps every account
and board. Migrations need no attention: `prisma migrate deploy` runs before
the API starts listening and does nothing once they are applied.

> **`docker compose down -v` deletes that volume, and the database with it.**
> It is not part of the normal workflow — use it only to reset deliberately.

Two things behave differently here than they would in production. Mail is not
sent: the console driver prints password-reset and invite links to
`docker compose logs backend`. And realtime presence, attachments and avatar
upload do not work, because those three still call Supabase — B9 and B10 move
them to the API.

## Getting started without Docker

Requires Node 24 and a PostgreSQL 18 database.

Create a `.env` in the project root for the frontend, and a `backend/.env` from
`backend/.env.example` for the API:

```
VITE_API_URL=http://localhost:4000/api/v1
```

`VITE_*` variables are inlined at build time, so changing one means restarting
the dev server rather than redeploying. The app throws at startup if
`VITE_API_URL` is missing.

```bash
npm install && npm run dev          # frontend on :5173

cd backend
npm install
npm run db:migrate                  # apply migrations
npm run dev                         # API on :4000
```

## Commands

```bash
npm run dev       # dev server
npm run build     # tsc -b && vite build — the only typecheck
npm run lint      # eslint
npm test          # vitest
npm run preview   # serve the built bundle

```

From `backend/`:

```bash
npm run dev       # tsx watch — API on :4000
npm run build     # tsc
npm test          # vitest, no database needed
npm run db:migrate   # prisma migrate deploy
npm run db:generate  # regenerate the Prisma client
npm run test:integration   # needs TEST_DATABASE_URL
```

The schema lives in `backend/prisma/`. Migrations are forward-only — reversing
one means writing another.

CI runs `lint`, `build` and `test` on every push and pull request.

## Notes

**The React Compiler is not enabled** (M9-04). Measured on this codebase,
enabling it cost 2.7× build time (3.56s → 9.70s) and +25% on the board chunk
(440 kB → 552 kB), against a re-render saving nobody had profiled. The plugin
and its Babel dependencies were removed; `vite.config.ts` records the decision.
Revisit when profiling names re-renders as the bottleneck.

**Documentation.** `docs/IMPLEMENTATION_PLAN.md` is the project ledger — what
was built, in what order, and why — alongside `docs/DATABASE.md`,
`docs/RLS_AUDIT.md` and `docs/PRODUCT_SPEC.md`. `CLAUDE.md` is the orientation
document for working in this codebase.
