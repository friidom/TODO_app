# TODO_app

A collaborative work-management application — Jira-style boards, sprints and
work-item hierarchy — built on React 19 and Supabase.

Boards live in spaces, carry a four-role permission model enforced in Postgres,
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
with every rule enforced by Row Level Security rather than in React; link
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
| Data | Supabase — Postgres, Auth, Row Level Security, Realtime |
| State | TanStack Query as the only real state layer |
| Drag and drop | `@dnd-kit/core`, hand-rolled (no `sortable`) |
| Tests | Vitest |

## Getting started

Requires Node 24 and a Supabase project.

Create a `.env` in the project root:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Both are inlined at build time, so changing either means a rebuild rather than
a redeploy. The app throws at startup if either is missing.

```bash
npm install
npm run db:push   # apply the schema to your Supabase project
npm run dev
```

## Commands

```bash
npm run dev       # dev server
npm run build     # tsc -b && vite build — the only typecheck
npm run lint      # eslint
npm test          # vitest
npm run preview   # serve the built bundle

npm run db:push   # apply pending migrations to the linked project
npm run db:diff   # capture local schema changes as a new migration
npm run db:types  # regenerate src/types/database.ts
```

Schema changes go through the CLI and land in `supabase/migrations/`, never
through the Supabase SQL editor. Migrations are forward-only.

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
