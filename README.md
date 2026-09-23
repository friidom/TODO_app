# Veylo

A collaborative work-management application — Jira-style boards, sprints and a
three-level work-item hierarchy — built on React 19 over a Node/Express API on
PostgreSQL.

Boards live in spaces, carry a four-role permission model enforced server-side,
and render through six views over one shared data pipeline.

> The repository is named `TODO_app`; the application is Veylo. Same project.

---

## Tech stack

**Frontend**
- React 19 · TypeScript (`strict`) · Vite 8
- TanStack Query as the only real state layer
- Tailwind CSS v4 (CSS-first, no config file), vendored shadcn primitives on Radix + Base UI
- `@dnd-kit/core`, hand-rolled (no `sortable`)

**Backend**
- Node 24 · Express 5
- Prisma 7 (driver adapter over `pg`)
- PostgreSQL 18
- JWT access tokens with refresh-token rotation, argon2 password hashing

**Infrastructure**
- Docker · Docker Compose · nginx
- GitHub Actions (lint, build, tests)
- Vitest on both sides

---

## Architecture

```
Browser
   │
   ▼
Frontend            React SPA, served by nginx (port 3000)
   │                nginx also proxies /api/v1 → backend, so the API
   │                is same-origin and no CORS is involved
   ▼
Express API         REST under /api/v1 (port 4000)
   │                auth, authorization and validation live here
   ▼
Prisma              query layer + migrations
   │
   ▼
PostgreSQL          port 5432 in the network, 5433 on the host
```

Docker Compose runs all three — frontend, backend and PostgreSQL — as separate
containers on one network. Authorization is enforced in the API
(`backend/src/middleware/boardAccess.ts`, `requireRole.ts`), never in React.

**Where things live**

| Path | What |
|---|---|
| `src/` | Frontend. `services/<feature>/` pairs an API module with its hooks |
| `backend/src/` | Express API. `modules/<feature>/` is routes + controller + service + repo |
| `backend/prisma/` | **The schema and its migrations — authoritative** |
| `supabase/` | Historical. The pre-B5 schema and CLI config; nothing applies it |
| `docs/` | Project ledgers and design notes |
| `Dockerfile`, `backend/Dockerfile`, `nginx.conf`, `docker-compose.yml` | Docker setup |

---

## Features

**Work items.** Epic → Task → Subtask, modelled as one self-referencing
`parent_id` and enforced by a database trigger, so an Epic can never be filed
under a Task. Items carry a type, priority, assignee, story-point estimate,
start and due dates, description, comments and a per-item change history. Every
card has a readable per-board key (`KAN-14`).

**Views.** Six renderings of the same board: Summary, Board (Kanban with
hand-rolled drag and drop), List, Calendar, Timeline (Epic-grouped Gantt with
sprint bands) and Backlog. Filter, search, sort and grouping are properties of
the shared pipeline, so they apply to whichever view is open.

**Sprints and backlog.** A sprint is a container with its own lifecycle
(future → active → completed). Plan from the backlog, start a sprint to move its
work onto the board, complete it to rehome whatever did not finish.

**Collaboration.** Four roles (viewer, editor, admin, owner) enforced in the
API; link invitations; comment threads; activity feed and per-item history;
in-app notifications; and a personal "For You" hub spanning every board you can
reach.

**Auth.** Register and sign in, argon2 hashing, short-lived JWT access tokens
held in memory, refresh-token rotation over an HttpOnly cookie, password reset
by emailed link, and **"Continue with Google" / "Continue with GitHub"** when
those are configured.

OAuth signs in through the same session machinery as a password does — the
provider callback sets the same refresh cookie — and an email address is never
what authenticates. A provider identity whose verified address already belongs
to an account does not sign in and does not create a second account: it asks
you to sign in to the existing one first and connects the two explicitly.
Connected providers are managed under **Profile -> Connected accounts**, where
the last remaining way into an account cannot be removed.

**Interface.** Light and dark themes from one set of CSS custom properties, a
mobile pass across every view, keyboard-accessible drag and drop with
screen-reader announcements, optimistic updates, English/Russian/Uzbek.

Not yet working — see **Project status**: realtime updates and presence,
file attachments, avatar upload.

---

## Quick start — Docker

Requirements: **Git** and **Docker Desktop**. Nothing else — no Node, no
PostgreSQL, no manual setup.

```bash
git clone https://github.com/friidom/TODO_app.git
cd TODO_app
docker compose up --build
```

Then open **<http://localhost:3000>** and register an account. Signing up
creates your space, board and its four columns, so there is nothing to seed.

PostgreSQL runs inside Docker and is created automatically on first start —
**you do not need PostgreSQL installed.** Prisma migrations are applied before
the API starts listening, and are a no-op on every start after the first.

| | |
|---|---|
| Frontend | <http://localhost:3000> |
| API health | <http://localhost:4000/health> |
| PostgreSQL | `localhost:5433` — 5432 is left free for a native install |

### Stop

```bash
docker compose down
```

**The database survives.** Data lives in a named Docker volume
(`todo-app_pgdata`), so `docker compose down` followed by `docker compose up -d`
comes back to the same accounts and boards.

### Logs

```bash
docker compose logs -f            # all services
docker compose logs -f backend    # just the API
```

Mail is not sent in Docker: the console driver prints password-reset and invite
links to `docker compose logs backend`.

### Rebuild

```bash
docker compose up --build
```

### Reset the local database

```bash
docker compose down -v
```

> **This deletes the `todo-app_pgdata` volume and every account, board and card
> in it. It cannot be undone.** `-v` is not part of the normal workflow — use it
> only when you deliberately want an empty database. To stop the app without
> losing data, use `docker compose down` with no flags.

---

## Local development (without Docker)

Requires Node 24 and a PostgreSQL 18 database you provide yourself.

```bash
cp .env.example .env                  # frontend
cp backend/.env.example backend/.env  # API — set DATABASE_URL and JWT_SECRET
```

```bash
npm install && npm run dev            # frontend on :5173

cd backend
npm install
npm run db:generate                   # generate the Prisma client
npm run db:migrate                    # apply migrations
npm run dev                           # API on :4000
```

**Frontend scripts**

```bash
npm run dev        # vite dev server
npm run build      # tsc -b && vite build — the only typecheck
npm run lint       # eslint
npm test           # vitest
npm run preview    # serve the built bundle
```

**Backend scripts** (from `backend/`)

```bash
npm run dev                # tsx watch
npm run build              # tsc
npm run typecheck          # tsc --noEmit
npm test                   # vitest — no database needed
npm run test:integration   # needs TEST_DATABASE_URL, a separate database
npm run db:migrate         # prisma migrate deploy
npm run db:generate        # regenerate the Prisma client
npm run db:status          # prisma migrate status
```

The schema lives in `backend/prisma/`. Migrations are forward-only — reversing
one means writing another.

---

## Environment variables

Two `.env` files, both gitignored. Each has a committed `.env.example` listing
every variable the code reads, with comments.

| File | Read by | Contains |
|---|---|---|
| `.env` | Vite, at build time | `VITE_API_URL` — the only variable the frontend reads |
| `backend/.env` | The API at startup, **and Docker Compose**, which passes it into the backend container | `DATABASE_URL`, `JWT_SECRET`, cookie/mail/token settings, OAuth credentials |

Copy each `.example` and fill it in. **Docker needs neither** —
`docker-compose.yml` passes working defaults for a local demo, so
`docker compose up --build` works from a bare clone. If `backend/.env` does
exist it is passed into the backend container, which is how OAuth credentials
reach Docker without being duplicated or written into `docker-compose.yml`;
values set in the compose file itself still win over it.

Two values must be set for anything beyond a local demo: `JWT_SECRET` (at least
32 characters — `openssl rand -base64 48`) and `POSTGRES_PASSWORD`. Both are
overridable as environment variables; the compose defaults are self-labelled
demo values and are not secrets.

`VITE_*` variables are inlined at build time, so changing one means restarting
the dev server, or rebuilding the image. **Never give an OAuth client secret a
`VITE_` name** — it would be inlined into the public bundle. The frontend needs
no OAuth variable at all: it never talks to a provider.

OAuth is optional and set per provider, in pairs. Without
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (or the GitHub pair) the buttons
simply do not appear; an id without its secret refuses to start. Callback URLs
are derived from `API_PUBLIC_URL`, which is the URL a **browser** uses to reach
the API — `http://localhost:4000/api/v1` for `npm run dev`, but
`http://localhost:3000/api/v1` under Docker, where nginx serves both. Register
`<API_PUBLIC_URL>/auth/oauth/google/callback` and the GitHub equivalent with
each provider. A GitHub OAuth App allows exactly one callback URL, so dev and
production need separate apps.

---

## Project status

The migration off Supabase onto a self-hosted Express + Prisma + PostgreSQL
backend is complete for every data path. Three surfaces have not moved yet.

| | Status |
|---|---|
| REST API migration (B5–B8) — auth, authorization, all CRUD | ✅ Complete |
| Docker Compose setup | ✅ Complete |
| CI — GitHub Actions runs lint, build, unit and integration tests | ✅ Running |
| **Realtime updates and presence** (B9) | ⏳ Pending — still calls Supabase |
| **Storage: attachments and avatars** (B10) | ✅ Complete — MinIO, `todo-attachments` and `todo-avatars` |
| **Swagger / OpenAPI docs** | ⏳ Not started |
| **Deployment pipeline** (B12) | ⏳ Not started |

`@supabase/supabase-js` and `src/services/api/supabase.ts` are gone: realtime
runs on the API's own Socket.IO server and both attachments and avatars are
stored in MinIO, so nothing in the browser reaches Supabase and every feature
works in Docker.

`src/types/database.ts` stays — it is generated Supabase typing, but
`src/types/data.ts` derives every row type from it, so it is load-bearing.
The schema itself is authoritative in `backend/prisma/schema.prisma`.

---

## Documentation

`docs/BACKEND_MIGRATION_PLAN.md` is the current ledger — the Supabase-to-Express
migration, milestone by milestone, with what each one found.
`docs/IMPLEMENTATION_PLAN.md` is the older product ledger for the M-series
feature work. `CLAUDE.md` is the orientation document for working in this
codebase.

Documents describing the pre-migration Supabase design carry a "superseded"
banner at the top rather than being deleted — they are why the current design
looks the way it does.

**The React Compiler is not enabled** (M9-04). Measured here, it cost 2.7× build
time and +25% on the board chunk against a re-render saving nobody had profiled;
`vite.config.ts` records the decision.
