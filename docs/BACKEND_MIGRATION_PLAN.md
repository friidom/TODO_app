# Backend Migration Plan — Clean Start

**Strategy:** CLEAN START. We build a new database and a new backend from scratch. **No existing Supabase data is preserved.** All current data is disposable test data.

**Status:** planning document. **B0 and B1 are complete** (see §16). Everything from B2 onward is unbuilt.
**Revised:** 2026-09-15 — rewritten from the original data-preserving plan after the strategy change.
**Companion documents:**
- `docs/SUPABASE_DATABASE_AUDIT.md` — what the current database looks like. **This is now the specification for the new schema**, not just background reading.
- `docs/IMPLEMENTATION_PLAN.md` — the product roadmap (M0–M32) that produced the current system.

> **What changed from the previous revision.** The original plan assumed we would carry the existing users, rows and files across. That is gone. Password-hash portability, data parity checks, storage-object copying, the cutover runbook, the maintenance window and the rollback-to-Supabase procedure have all been removed. The milestone roadmap is renumbered around the clean-start phases.

---

## Contents

1. [Executive summary](#1-executive-summary)
2. [Clean Start Migration Principles](#2-clean-start-migration-principles)
3. [What We Explicitly Do Not Migrate](#3-what-we-explicitly-do-not-migrate)
4. [The four categories](#4-the-four-categories)
5. [What we keep from the audit](#5-what-we-keep-from-the-audit)
6. [Target backend architecture](#6-target-backend-architecture)
7. [Backend folder structure](#7-backend-folder-structure)
8. [Fresh database schema](#8-fresh-database-schema)
9. [Authentication](#9-authentication)
10. [Authorization — replacing RLS](#10-authorization--replacing-rls)
11. [API design](#11-api-design)
12. [Frontend migration](#12-frontend-migration)
13. [Realtime](#13-realtime)
14. [Storage and attachments](#14-storage-and-attachments)
15. [Development environment](#15-development-environment)
16. [Implementation milestones B0–B12](#16-implementation-milestones-b0b12)
17. [Updated Implementation Order](#17-updated-implementation-order)
18. [Risks and common mistakes](#18-risks-and-common-mistakes)
19. [Final recommended stack](#19-final-recommended-stack)
20. [Next implementation step](#20-next-implementation-step)
21. [Open architectural decisions](#21-open-architectural-decisions)

---

# 1. Executive summary

## What we have

A working React + TypeScript + Vite application with a large feature set — boards, columns, an Epic → Task → Subtask hierarchy, sprints, a backlog, estimates, comments, attachments, activity history, notifications, four-role membership, invitations, six views, drag-and-drop, optimistic updates and multi-client realtime.

It has **no backend of its own**. The browser talks to PostgreSQL through Supabase's generated REST layer. Business rules live in ~30 RLS policies, ~30 SQL functions and 17 triggers, because the database was the only place they could live. `docs/SUPABASE_DATABASE_AUDIT.md` describes all of it.

Two structural facts carry this whole project:

1. **The frontend's Supabase surface is 19 files.** Components never import the Supabase client; hooks never import it either. 15 `*Api.ts` modules do, plus `AuthProvider`, `useBoardRealtime`, `useUsernameAvailability` and `ResetPasswordPage`.
2. **Roughly two-thirds of the queries in `src/services/` are deliberately incomplete**, because RLS finishes them. `markAllNotificationsRead()` filters on `read_at is null` and nothing else. Reproducing that scoping is the core work of this migration.

## What we are building

```
React frontend  ──HTTPS/JSON──▶  Node + Express + TypeScript  ──▶  PostgreSQL
       ▲                                     │                    (fresh: local → company server)
       └────────── WebSocket (Socket.IO) ────┘
```

## Why clean start changes the shape of the work

The old plan had two problems to solve at once: *build a backend*, and *move the data without losing any*. The second is gone.

| Removed | Was |
|---|---|
| Password-hash portability investigation | the highest-risk unknown in the old plan |
| Data dump, restore and parity checks | a milestone's worth of work |
| Storage object copying, orphan sweeps | |
| Cutover runbook, maintenance window, write freeze | a rehearsed Saturday |
| Rollback-to-Supabase procedure | |
| Keeping Supabase alive for two weeks as a safety net | |
| Legacy id preservation, backwards compatibility | |

And what it **adds**, which is easy to miss:

> **With no data migration, nothing forces the new schema to match the old one.** In the previous plan, a `pg_dump` diff and a set of parity queries would have caught a dropped constraint. Now nothing will. **`SUPABASE_DATABASE_AUDIT.md` is the only thing standing between us and a silently weaker schema** — §18.1 treats that as the number-one risk.

## What stays the same

- Every React component. No JSX change is required.
- All ~60 React Query hooks, if `*Api.ts` signatures are preserved.
- Every pure-logic module and its tests — `utils/rank.ts`, `services/todos/cache.ts`, `services/views/*`, `services/members/permissions.ts`, and the other 57 test files.
- `queryKeys.ts`, the cache defaults, optimistic patching, the toast behaviour.
- Drag-and-drop, i18n, theming, routing.
- **The database's shape and rules** — recreated deliberately from the audit, not carried across.

## Where we are

**B0–B4 are done.** `backend/` builds, validates its environment with Zod at boot, owns one `pg` pool that Prisma borrows through `PrismaPg`, serves `GET /health` (process + database) and a mounted `/api/v1`, maps PostgreSQL SQLSTATEs to HTTP statuses, and can write as a known actor through `withActor`. The 15-table schema is applied from seven hand-written SQL migrations (0001–0006 create it, 0007 fixes the board-deletion defect in §21.11) and verified against the catalogs. The database holds no rows. The next step is **B5: authentication**.

---

# 2. Clean Start Migration Principles

Nine rules. Where a later section conflicts with one of these, the principle wins.

### P1 — The audit is the specification

Every table, column, constraint, index and trigger in the new schema must be traceable to a section of `SUPABASE_DATABASE_AUDIT.md`, or to an explicit decision recorded here to change it.

Nothing appears in the new schema because someone remembered it. Nothing is *missing* from it because someone forgot.

### P2 — Behaviour is preserved; data is not

The product must work identically. A user who logs in should not be able to tell which backend they are on. That is the acceptance test for every milestone.

The rows are disposable. The **rules about the rows** are not.

### P3 — The database keeps every invariant it keeps today

Constraints, foreign keys, unique indexes and triggers move across. An invariant that must hold for every writer belongs in the database, where a bug in application code cannot bypass it.

What does *not* move is the **authorization** layer — RLS policies become Express middleware (§10). That is a deliberate exception with its own reasoning, not a general licence to move rules into TypeScript.

### P4 — Simplify only where the fresh start makes it free

"We are retyping this anyway" is not a reason to redesign. It is a reason to drop what is already dead and to skip steps that only existed because of history. §4.4 is the complete list of permitted simplifications. Anything not on it is out of scope.

### P5 — The final schema is built in its final shape

No expand → backfill → contract. There is nothing to backfill. The 69 historical migrations collapse into a handful of files that create each object once, correctly.

That applies **only** to the initial schema build. Once the new database holds real data, expand → backfill → contract returns and is binding.

### P6 — No dual-running, no compatibility layer

We do not dual-write, we do not sync, and no code reads from both systems. The two databases share no ids and no users; a half-migrated frontend cannot work (§12.2). Supabase keeps running untouched until the new stack replaces it, and then it is switched off.

### P7 — Seed data is engineering, not decoration

The seed script is how every milestone after B3 gets tested. It must contain the awkward cases on purpose: all four roles, an Epic with Tasks with Subtasks, a card in no column, an active sprint and a future one, an unestimated item, a comment from a viewer, a long board.

A seed containing only happy-path rows is how a missing constraint reaches production.

### P8 — One thing at a time, and the app works at the end of each

B2–B7 add a backend and touch nothing in `src/`. B8 switches the frontend over. If `npm run dev` is broken at the end of a milestone, the milestone is not done.

### P9 — Every decision is recorded, not assumed

Where this plan chooses, it says why. Where it has not chosen, the question is in §21 and stays open until answered. No decision is made silently inside an implementation commit.

---

# 3. What We Explicitly Do Not Migrate

| # | Not migrating | Consequence | What replaces it |
|---|---|---|---|
| 1 | **User accounts** | everyone registers again | `POST /auth/register` creates fresh accounts |
| 2 | **Password hashes** | nobody's current password works | new passwords, argon2id. No bcrypt-verification path is needed, and none will be built |
| 3 | **Profiles** | usernames are claimed fresh, first come first served | created by the registration transaction |
| 4 | **Boards, columns, work items** | every board is recreated by hand or by seed | `provisionUser` gives each new account a starter board and four columns, as today |
| 5 | **Sprints, comments, attachments, activity, notifications** | history starts empty | — |
| 6 | **Storage objects** (both buckets) | no avatars, no attached files carried across | a fresh, empty store |
| 7 | **Row ids** | no uuid from the old system appears in the new one | all ids newly generated |
| 8 | **`board_key` counters** | card numbering restarts at `KAN-1` per board | the same trigger, starting from `next_key = 1` |
| 9 | **Outstanding invitations** | every pending invite link dies | invites are reissued |
| 10 | **Supabase Auth (GoTrue)** | sessions, refresh tokens and reset links all die | our own auth (§9) |
| 11 | **The 69 migration files as an applied sequence** | they become **reference material**, not migrations to run | ~5 new files creating the final shape (§8) |
| 12 | **RLS policies as a mechanism** | — | the same rules, as Express middleware (§10). **The rules survive; the mechanism does not** |
| 13 | **`anon` / `authenticated` / `service_role` roles and all GRANTs** | — | one application database role |
| 14 | **`supabase_realtime` publication** | replication-driven updates stop being free | explicit emits from the service layer (§13) |
| 15 | **`pg_cron`** | the weekly activity prune loses its scheduler | `node-cron` in the API process, or a system cron |
| 16 | **Supabase Storage path-based policies** | — | access checks in the download endpoint (§14) |

## And explicitly not built

No data-migration script. No import/export tooling. No id-mapping table. No dual-write. No compatibility shim for old rows. No "legacy" flag anywhere in the schema or the code.

If one of these appears in a pull request, the strategy has drifted.

---

# 4. The four categories

Everything falls into one of four buckets. This is the quick answer to "what happens to X?".

## 4.1 Recreated — rebuilt from the audit, deliberately

| Area | Detail |
|---|---|
| **12 tables** | `profiles`, `spaces`, `boards`, `board_members`, `board_invites`, `columns`, `todos`, `sprints`, `comments`, `attachments`, `activities`, `notifications` — plus new `users`, `sessions`, `password_reset_tokens` |
| **All foreign keys** | including the four **composite** ones, and every `ON DELETE` action exactly as audited (audit §5) |
| **22 CHECK constraints** | including `activities_event_valid`, which checks the `(entity_type, action)` **pair** |
| **8 unique constraints** | including `lower(username)` and the partial unique `sprints_one_active_per_board` |
| **24 indexes** | including the four partial ones |
| **17 triggers** (12 trigger functions) | timestamps ×6, `board_key` allocation, hierarchy enforcement, **owner-membership creation**, ownership immutability ×2, space filing, activity logging ×3, notifications ×2 |
| **~20 business rules from RPCs** | invite issuance and acceptance, membership changes, sprint start/complete, column delete-with-rehome, user provisioning — rewritten as Express services (§10.6) |
| **The role matrix** | four roles, the strictly-below rule, the ownership-is-not-grantable rule |
| **Realtime** | per-board rooms + presence (§13) |
| **Storage** | private attachment store + public avatars (§14) |

## 4.2 Discarded — gone, with nothing replacing them

| Thing | Why it is safe to drop |
|---|---|
| `todos.status`, `todos.previous_status` | dead. Appear only in generated types; the UI's "status" filter actually filters on `column_id` |
| `todos.archived` | dead. Never written, never read |
| `boards.visibility` | write-only — set once at creation, read nowhere. **Reintroduce when the org-visibility feature needs it, not before** |
| `columns.user_id`, `todos.user_id` | already dropped in M2-13; simply never created |
| `shift_completed_positions()` | a leftover function from the pre-boards era |
| `todos.completed` | already gone; doneness is derived from the column's category |
| `supabase_vault`, `uuid-ossp` extensions | unused. `pgcrypto` stays for `gen_random_uuid()` on PG < 13 |
| Every RLS policy, as SQL | the rules move to §10; the policy objects do not |

## 4.3 Must remain functionally identical

**These are the things most likely to be lost in a retype, because each looks arbitrary until you know the story.** One line each; the audit has the full version.

| Rule | Why |
|---|---|
| **Fractional ranks** — one row written per move | renumbering a whole column made two simultaneous drags overwrite each other's cards |
| **Two rank columns** — `rank` and `backlog_rank` | a card's place on the board and in a sprint plan are different questions |
| **Client-minted uuids + upsert** | the optimistic row and the stored row are the same row; there is no `isOptimistic` flag anywhere |
| **`board_key` via trigger, never reused** | delete KAN-2, create another, get KAN-4. Null means "in flight", and the UI reads that absence |
| **`column_id` and `sprint_id` are independent axes** | collapsing them emptied every board once, and made every new card invisible |
| **Hierarchy from `parent_id` alone** | there is no `Subtask` type; role is read from the parent. One trigger is the only enforcement |
| **Doneness derived from `columns.category`** | no second source of truth |
| **One active sprint per board**, as a partial unique index | it is what makes the client's `find(s => s.state === 'active')` safe |
| **`estimate`: null ≠ 0** | unestimated and zero-point are different answers, counted separately |
| **Column limits are advisory** | a breach warns; nothing blocks a drop |
| **Column titles never translated** | user text. Running them through `t()` made a column named "todo" render as a key |
| **Activity and notifications are trigger-written only** | no client write path is what makes an entry evidence rather than a claim |
| **Activity is silent on rank changes** | otherwise a drag floods the feed |
| **Viewers may comment but may not attach** | the one deliberate divergence between the comment and attachment matrices |
| **Ownership cannot be transferred** | two triggers; the operation does not exist |
| **Strictly-below rule** on every membership and invite operation | an admin cannot promote or remove another admin |
| **Invite tokens generated server-side**, expiry clamped 1–30 days | the token is a credential |
| **Revoking an invite deletes the row** | a revoked token and a nonexistent token must be indistinguishable |
| **Attachment: object written before row, deleted before row** | the reverse order creates permanently invisible orphans |
| **Attachment downloads force `Content-Disposition: attachment`** | no MIME allow-list, so this is the whole defence against a stored `.html` |
| **Composite FKs pin child rows to their board** | otherwise `board_id` is a claim the client makes and the permission check believes |

## 4.4 Simplified — permitted *because* the database is fresh

This list is closed. Anything not on it is out of scope for the clean start.

| # | Simplification | What it saves | Cost |
|---|---|---|---|
| **S1** | **69 migrations → ~5 files** creating the final shape | no expand/backfill/contract, no preflight blocks, no `DROP CONSTRAINT … ADD CONSTRAINT` churn | none |
| **S2** | **Dead columns never created** (§4.2) | 4 columns, and the confusion of a column that lies | none |
| **S3** | **`board_invites.token_hash`, never plaintext** | plaintext was acceptable behind RLS; behind a REST API a credential must be hashed at rest, like a session or reset token | the plaintext token is returned **once**, in the create response, and is unrecoverable afterwards |
| **S4** | **`users.email` as `citext`** | removes manual `lower()` on every lookup | needs the `citext` extension |
| **S5** | **One application DB role** | no `anon`/`authenticated`/`service_role`, no GRANT matrix, no `to authenticated` clauses | authorization must be complete in Express (§10) |
| **S6** | **No RLS policies created at all** | ~30 objects never written | same as S5 |
| **S7** | **`profiles.id` references our own `users`** | no foreign schema we do not control | — |
| **S8** | **Purposeful seed data** (P7) | a demo board that exercises the edge cases | it has to be written |
| ~~**S9**~~ | ~~`todos.position` / `columns.position` dropped~~ | — | **REJECTED.** `position` is actively used in nine frontend files — see §8.5b |

### On S9 — rejected after inspection

`position` looked like a dead fallback. It is not. An inspection of `src/` found it written on every column and todo create, preserved by `applyTodoConfirmed`, and read by `byRank`. Dropping it is a nine-file frontend refactor, which contradicts the premise of this migration. **The columns and their two indexes are created in the new schema.** Full evidence in §8.5b.

### Tempting but rejected

| Idea | Why no |
|---|---|
| Rename `todos` → `work_items` | `IMPLEMENTATION_PLAN.md` Appendix D rejects it explicitly. It would touch every query key, cache function, type and test for zero user-visible gain |
| camelCase API fields | every component reads `board_id`, `column_id`, `backlog_rank`. Churn with no benefit |
| Merge `users` and `profiles` | the split exists because profiles are readable by every board member and credentials are not. Now it is our choice rather than Supabase's — and we still choose it |
| Move activity logging out of triggers | a trigger fires for cascades and bulk updates too. Service code has to remember, and the day it forgets, the feed lies (§8.5) |
| Replace CHECK-constraint enums with PostgreSQL `ENUM` types | widening a CHECK is an `ALTER`; widening an `ENUM` is more awkward. No gain |
| Redesign the permission model while we are here | §10 reproduces it exactly. Redesign is a separate project with its own plan |

---

# 5. What we keep from the audit

`SUPABASE_DATABASE_AUDIT.md` remains valid and is **promoted from background reading to working specification.**

| Audit section | Used by | How |
|---|---|---|
| §4 The tables, one by one | **B3** | column-by-column source for the new schema |
| §5 Relationships | **B3** | every FK and every `ON DELETE` action |
| §5 Indexes table | **B3** | all 24, including the partial ones |
| §6 Constraints | **B3** | all 22 CHECKs and 8 unique constraints |
| §7 Triggers and functions | **B3, B7** | triggers are recreated; RPC bodies become service specifications |
| §8 RLS policies | **B6** | **each policy becomes an authorization rule**; §8.3's matrix is the test suite |
| §8.4 Queries that rely on RLS | **B6, B11** | the list of queries that must gain explicit scoping — every row is a test case |
| §9 Auth and profiles | **B5** | the provisioning sequence and the username rules |
| §10 Storage | **B10** | key shapes, size limits, the disposition rule, the ordering rule |
| §11 Realtime | **B9** | which tables are live, and the payload shape the client already parses |
| §13 Unknowns | — | **mostly moot now.** §13.1 (password portability), §13.3 (data volume) and §13.4 (orphaned objects) no longer matter. §13.5 (`pg_cron`) and §13.6 (email confirmation) survive as *design* questions |

Two findings drive design decisions and are worth repeating:

**The queries that rely on RLS.** Audit §8.4 lists them. `markAllNotificationsRead` filters on `read_at is null` and nothing else; `fetchRecentTodos` has no board filter; `profileApi.updateProfile` takes the id from the client. Correct today; vulnerabilities the moment RLS is gone and nothing replaces it. §10.3 is the structural answer.

**`accessible_board_ids()` is the single swap point.** One function answers "which boards may this person see", and every read policy calls it. It has already been widened once — owner-only to membership — without editing a single policy. The new backend must preserve that property (§10.7).

---

# 6. Target backend architecture

Sizing: **~200 internal employees, realistically 30–60 concurrent.** Every choice is checked against "does this earn its complexity at that size?"

New constraint from B12: **deployment is to a company server**, not a cloud platform. That makes local-filesystem storage viable, makes a single Docker host reasonable, and makes backups our own responsibility.

## 6.1 The stack

| Concern | Choice | Reasoning |
|---|---|---|
| **Runtime** | Node.js 22 LTS | one language across the stack — `rank.ts` and `permissions.ts` become literally shared code. Pin `.nvmrc`; note local is 22.18.0 while frontend CI pins 24, and align them |
| **Framework** | **Express 5** (installed) | the largest body of documentation, which matters when a goal is that the owner can extend it unaided. Express 5 fixes async error handling. Performance is irrelevant here |
| **Language** | TypeScript, strict | matches the frontend's discipline; `tsc -b` is the gate |
| **Database** | **PostgreSQL 18.6** (installed locally) | match dev and prod majors exactly. `gen_random_uuid()` is core from PG 13, so no `pgcrypto` needed |
| **Migrations** | **hand-written SQL**, applied by a small runner | the team is fluent (69 files of practice), and no schema language expresses the partial unique index, the tuple CHECK or the composite FKs |
| **Query layer** | **Prisma, SQL-first** (§8.7) | typed client generated by `prisma db pull`; SQL migrations stay the source of truth. `pg` retained for diagnostics and raw utilities |
| **Auth** | argon2id + access JWT + rotating refresh cookie | §9 |
| **Validation** | Zod | schemas double as DTO types |
| **Errors** | one `AppError` + one terminal middleware | already stubbed in `backend/src/app.ts` |
| **Logging** | morgan now; **pino** when structured logs matter | morgan is in place from B1 |
| **Config** | Zod-parsed `env.ts`, throws at boot | in place, hand-rolled; upgrade to Zod in B4 |
| **Versioning** | `/api/v1` prefix | costs nothing now; the only cheap moment to add it |
| **Realtime** | Socket.IO | §13 |
| **Storage** | driver interface: local disk / S3-compatible | §14 |
| **Background jobs** | none for the MVP | one weekly prune does not justify a queue |

## 6.2 Rejected, named so nobody adds them by reflex

NestJS · GraphQL · microservices · a message broker · Kubernetes · Redis (cache, sessions, or the Socket.IO adapter) · event sourcing · CQRS · a read replica · server-side rendering · a repository base class with generics · dependency injection.

The test: *what does this buy at 200 users with 50 concurrent?* If the answer is "it would help at 100,000", it is not for now.

## 6.3 What B1 already established

```
backend/
├── src/
│   ├── config/env.ts     hand-rolled env parsing, throws at boot
│   ├── app.ts            cors + json + morgan, GET /health, 404 + error fallbacks
│   └── server.ts         listen + graceful shutdown on SIGINT/SIGTERM
├── .env.example
├── package.json          dev (tsx watch) / build (tsc) / start / typecheck
└── tsconfig.json         strict, NodeNext ESM, noUnusedLocals/Parameters
```

Verified: builds clean, serves `{"status":"ok"}`, returns a well-formed JSON 404, sends correct CORS headers for `http://localhost:5173`, and fails at startup with a named variable on a bad `PORT` or `NODE_ENV`.

Installed: `express@5`, `cors`, `dotenv`, `morgan`, plus the TypeScript toolchain. **Nothing database-related, nothing auth-related.**

---

# 7. Backend folder structure

**(proposed)** — one repository, two packages. Not a monorepo tool; just two `package.json` files. They live together because types, the rank arithmetic and the permission matrix are shared, and a change to an endpoint and its caller should be one pull request.

```
TODO_app/
├── src/                          ← existing frontend, untouched until B8
├── supabase/                     ← kept read-only as the historical record
├── docs/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.ts            ✅ exists (B1) — Zod upgrade in B4
│   │   │   └── constants.ts      RANK_GAP, page sizes, TTLs, size limits
│   │   │
│   │   ├── db/
│   │   │   ├── client.ts         pool / query-layer singleton            (B4)
│   │   │   ├── withActor.ts      transaction + set_config('app.actor_id') (B4, see §8.5)
│   │   │   ├── migrate.ts        the migration runner                    (B3)
│   │   │   ├── migrations/       *.sql, numbered, forward-only           (B3)
│   │   │   └── seed.ts           purposeful demo data (P7)               (B3)
│   │   │
│   │   ├── middleware/
│   │   │   ├── requireAuth.ts    verifies the access token → req.actor   (B5)
│   │   │   ├── boardAccess.ts    resolves :boardId → req.board{id,role}  (B6)
│   │   │   ├── requireRole.ts    requireRole("editor")                   (B6)
│   │   │   ├── validate.ts       Zod on body / params / query            (B6)
│   │   │   ├── rateLimit.ts      auth routes                             (B5)
│   │   │   └── errorHandler.ts   ✅ inline in app.ts (B1) — extract in B4
│   │   │
│   │   ├── modules/              one folder per feature, mirroring src/services/
│   │   │   ├── auth/             routes · controller · service · repo · schema
│   │   │   ├── users/  spaces/  boards/  members/  invites/
│   │   │   ├── columns/  todos/  sprints/
│   │   │   ├── comments/  attachments/  activities/  notifications/
│   │   │   └── feed/             the cross-board "For You" queries
│   │   │
│   │   ├── realtime/             io.ts · rooms.ts · emit.ts · presence.ts  (B9)
│   │   ├── storage/              driver.ts · localDriver.ts · s3Driver.ts  (B10)
│   │   │
│   │   ├── lib/
│   │   │   ├── errors.ts         AppError + the code enum
│   │   │   ├── logger.ts
│   │   │   ├── password.ts       argon2id hash + verify                  (B5)
│   │   │   ├── tokens.ts         access JWT; refresh mint/hash/rotate    (B5)
│   │   │   ├── rank.ts           ← copy of src/utils/rank.ts, parity-tested
│   │   │   └── permissions.ts    ← copy of src/services/members/permissions.ts
│   │   │
│   │   ├── shared/dto.ts         request/response types the frontend also imports
│   │   ├── app.ts                ✅ exists (B1)
│   │   └── server.ts             ✅ exists (B1)
│   │
│   ├── tests/                    integration tests against a throwaway database
│   ├── .env.example              ✅ exists (B1)
│   ├── package.json              ✅ exists (B1)
│   └── tsconfig.json             ✅ exists (B1)
└── package.json                  ← frontend, unchanged
```

## Layer responsibilities

| Layer | Responsible for | Must never |
|---|---|---|
| `routes` | URL, HTTP verb, which middleware runs | contain logic |
| `controller` | read `req`, call one service function, shape `res` | query the database, decide permissions |
| `service` | **all business rules**, transactions, realtime emits | touch `req`/`res` |
| `repo` | **all SQL** | contain rules |
| `middleware` | auth, board access, role checks, validation, errors | contain feature logic |

**Why the ceremony is worth it:** a service function is a plain async TypeScript function taking plain arguments, so it is unit-testable without HTTP — and it is where the PL/pgSQL bodies land. `start_sprint` becomes `sprintService.start(actor, sprintId)`, readable and debuggable.

Keeping every query inside `*.repo.ts` means the query layer stays replaceable: swapping Prisma for Kysely, or dropping to raw `pg`, would touch only those files.

## Two files that are copies, on purpose

`lib/rank.ts` and `lib/permissions.ts` duplicate frontend files.

- The **client** computes a rank optimistically and sends it; the **server** validates, and needs `rankBetween` only for `/rebalance`. They must agree.
- A shared workspace package is the clean answer, but adds build tooling to a project that has none.

**The mitigation, not the excuse:** a test in each package asserting identical output over the same fixture table. If they drift, a test fails rather than a board scrambling. Promote to a shared package when a third consumer appears.

---

# 8. Fresh database schema

**(proposed — B3. No SQL is written yet.)**

## 8.1 The method

**Source:** `SUPABASE_DATABASE_AUDIT.md` §4–§7, cross-checked against the final state of each object in `supabase/migrations/`.

**Method:** for each object, find its *last* definition across the 69 files and write it once, in final form. Do not replay history.

Worked example — `columns.category`:

- `20260804000000` creates it with a CHECK
- `20260804121905` drops and re-adds the constraint
- later files leave it alone

→ **write one column with one CHECK.** Three historical statements, one line in the new schema.

**Verification** — this is the step that replaces the old plan's `pg_dump` diff, and it is not optional:

1. Apply the new migrations to an empty database.
2. Produce a checklist from the audit: every table, column, constraint, index and trigger.
3. Query `information_schema` and `pg_indexes` on the new database and tick each one off.
4. **Counts must match:** 22 CHECK constraints, 8 unique constraints, 24 indexes, **17 triggers backed by 12 trigger functions**, 12 + 3 tables.

A count mismatch is the only cheap signal we have that something was forgotten. §18.1 explains why this matters more than it sounds.

## 8.2 File layout

Five files, split by domain so each is reviewable on its own:

Seven migrations, each a directory under `prisma/migrations/` holding one `migration.sql`, split by domain so each is reviewable on its own. 0001–0006 create the schema; 0007 is the one corrective migration B4 needed:

| Migration | Contents |
|---|---|
| `0001_extensions` | `citext` if S4 is adopted. **`pgcrypto` is not required** — `gen_random_uuid()` is core from PostgreSQL 13, and the target is 18.6 |
| `0002_auth` | `users`, `sessions`, `password_reset_tokens`, `profiles` |
| `0003_boards` | `spaces`, `boards`, `board_members`, `board_invites` |
| `0004_work_items` | `columns`, `todos`, `sprints` |
| `0005_collaboration` | `comments`, `attachments`, `activities`, `notifications` |
| `0006_functions_triggers` | all 12 trigger functions and their 17 triggers |
| `0007_log_member_activity_board_delete` | **B4 fix.** `log_member_activity` must not log a removal when the board is already being cascade-deleted — see §21.11 |

Triggers land last because several reference tables from more than one earlier file.

**There is no custom migration runner.** An earlier revision of this plan proposed a ~40-line `db/migrate.ts`. That is superseded by §8.7 — `prisma migrate deploy` does the same job (ordered application, a ledger table, one transaction each) and is code we do not have to maintain or debug.

## 8.3 New tables — authentication

Three tables that have no counterpart today, because GoTrue provided them.

### `users`

Replaces `auth.users`. Kept separate from `profiles` deliberately (§4.4, "tempting but rejected"): `profiles` is readable by every board member; credentials are read by the auth module alone.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK, `gen_random_uuid()` | |
| `email` | citext NOT NULL UNIQUE | `citext` makes case-insensitive lookup structural (S4) |
| `password_hash` | text NOT NULL | argon2id only — there is no legacy format to support |
| `email_verified_at` | timestamptz | null = unverified |
| `deactivated_at` | timestamptz | reserved; deactivation rather than deletion, because `profiles` is referenced by todos, comments and activities |
| `created_at`, `updated_at` | timestamptz NOT NULL | |

`profiles.id` references `users(id)` `ON DELETE CASCADE` — the same one-to-one shape as today, re-rooted onto a table we own.

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → `users` NOT NULL, cascade | |
| `token_hash` | text NOT NULL UNIQUE | sha256 of the opaque refresh token. **Never the token itself** |
| `family_id` | uuid NOT NULL | rotation lineage, for reuse detection |
| `expires_at` | timestamptz NOT NULL | |
| `revoked_at` | timestamptz | |
| `user_agent`, `ip` | text, inet | |
| `created_at` | timestamptz NOT NULL | |

Indexes: `(user_id)`, and a partial on `(expires_at) WHERE revoked_at IS NULL`.

### `password_reset_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → `users` NOT NULL, cascade | |
| `token_hash` | text NOT NULL UNIQUE | |
| `expires_at` | timestamptz NOT NULL | 1 hour |
| `used_at` | timestamptz | single use |
| `created_at` | timestamptz NOT NULL | |

## 8.4 Changed tables

Only two differ from the audit, and both are S-list simplifications.

**`board_invites`** — `token text NOT NULL UNIQUE` becomes `token_hash text NOT NULL UNIQUE` (S3). The plaintext token is returned once, at creation, and never stored. Lookup by token becomes lookup by hash.

Everything else about invites is unchanged and must stay: 24 bytes of entropy, the 1–30 day expiry clamp, the role ceiling (`owner` absent from the CHECK), `accepted_at` as the spent marker, and **delete-on-revoke** so a revoked token and a nonexistent token are indistinguishable.

**`todos` / `columns`** — the dead columns (§4.2) are never created. `position` depends on §21.4.

Every other table is the audit's version, verbatim.

## 8.5 Triggers — what changes and what does not

Twelve triggers move across. Six need no change at all:

| Trigger function | Why it is portable as-is |
|---|---|
| `set_updated_at` | three lines, no Supabase reference |
| `assign_todo_board_key` | reads `boards.next_key` under a row lock; **keep the upsert guard**, or a whole-column upsert would burn a key per card per drag |
| `enforce_work_item_hierarchy` | the single enforcement point for the three-level rule; all six refusals |
| `enforce_board_owner_immutable` | freezes `boards.owner_id` |
| `enforce_owner_membership_immutable` | including both cascade escape hatches, which check for the parent row rather than trusting cascade ordering |
| `rebalance_column_ranks`, `rebalance_board_column_ranks` | set-based, single-statement |

Six read `(select auth.uid())` and need one expression changed:

`log_todo_activity` · `log_column_activity` · `log_member_activity` · `notify_on_invite` · `notify_on_assignment` · `boards_space_ownership`

### The actor session variable

**Proposal:** replace `(select auth.uid())` with `current_setting('app.actor_id', true)::uuid`, and have the backend open every mutating request in a transaction that first runs:

```sql
select set_config('app.actor_id', $1, true);
```

### Why `set_config(…)` and not `SET LOCAL app.actor_id = $1`

An earlier revision of this plan wrote `SET LOCAL app.actor_id = $1`. **That is not runnable and must not be reintroduced.**

`SET` is a utility statement, not a query. PostgreSQL does not accept bind parameters in it, so the only way to make that form work is to interpolate the value into the SQL string — which is precisely the shape that invites injection, on a value that comes from a token.

`set_config(setting, value, is_local)` is an ordinary function call, so `$1` binds normally. The third argument `true` means *transaction-local*, which is exactly `SET LOCAL`'s semantics:

```ts
await tx.$executeRaw`select set_config('app.actor_id', ${actorId}, true)`;
```

Being transaction-local, it cannot leak to another request even on a pooled connection. `current_setting(…, true)` returns NULL instead of erroring when unset, which matches today's behaviour for a write with no session — `activities.actor_id` is already nullable for exactly that case.

**`$executeRawUnsafe` must not be used here or anywhere** (§8.7).

**Why keep the triggers rather than logging in the service layer:**

- It preserves the guarantee that *every* write is logged, including cascades and set-based updates — `delete_column` rehoming todos, `start_sprint` bulk-assigning columns, `complete_sprint` rehoming work. A service-layer logger must remember each of those, and the day it forgets, the feed silently lies.
- It preserves the property that makes activity *evidence*: the client has no write path to it.
- It is roughly ten lines of change across six functions.

`db/withActor.ts` is the one helper wrapping this; every service transaction goes through it. **DECIDED — the triggers stay (§21.1 closed).**

## 8.5b Column-type and field decisions — **DECIDED**

Four choices that must be made in the SQL, not discovered later.

### `attachments.size_bytes` → `integer`, not `bigint`

The upload limit is 25 MB (`26_214_400`). `int4` holds ~2.1 billion, so it has ~80× headroom over the largest file the API will ever accept.

The reason this is worth changing: `bigint` crosses `Number.MAX_SAFE_INTEGER`, so Prisma maps it to **`BigInt`** in TypeScript. A `BigInt` does not serialise with `JSON.stringify` — it throws — so every attachment response would need a manual conversion, forever, for a column that will never exceed 26 million. `integer` maps to `number` and the problem does not exist.

Raising the limit past 2 GB would need a migration. That is the correct trade.

### `todos.estimate` stays `numeric` — converted at the boundary

`numeric` is the right storage type: story points may be fractional (0.5), and `numeric` is exact where `float` is not. Prisma maps it to **`Decimal`**, which — like `BigInt` — is not a plain JSON value.

**The rule: convert to `number` at the DTO/repository boundary, never deeper.** One place per response shape. Do not change the column to `double precision` to dodge this; do not let a `Decimal` reach a controller.

The distinction `null ≠ 0` (§4.3) survives either way: `null` stays `null` through the conversion.

### `todos.sprint_id` is `ON DELETE SET NULL`

Stated here because it is the single most dangerous referential action to mistype (§18.1). Deleting a sprint must **return its work to the backlog**, not delete it. `CASCADE` here destroys user data.

The same care applies to the other `SET NULL` columns: `boards.space_id`, `todos.creator_id`, `todos.assignee_id`, `attachments.uploader_id`, `activities.actor_id`, `notifications.actor_id`, `board_invites.created_by`.

### `position` columns **stay** (§21.4 closed → KEEP)

Simplification **S9 is rejected.** An inspection of `src/` found `position` actively used in nine places, not just as a dead fallback:

| File | Use |
|---|---|
| `services/columns/columnsApi.ts:35` | computes the next position when creating a column |
| `services/todos/todoApi.ts:80` | computes the next position when creating a todo |
| `services/todos/todoApi.ts:201` | `reorderTodos` writes it |
| `services/todos/useAddTodo.ts:101,142,145,160` | the optimistic row, and the post-insert position correction |
| `services/todos/cache.ts:29` | `applyTodoConfirmed` preserves the pending position |
| `services/todos/useAddBacklogItem.ts:91`, `useAddSubtask.ts:61` | write `position: null` |
| `services/sprints/sprintsApi.ts:42` | passes `position: null` into `rankForAppend` |
| `utils/rank.ts:19` | `byRank`'s fallback: `row.rank ?? (row.position ?? 0) * RANK_GAP` |

Dropping the columns would mean a nine-file frontend refactor during a migration whose whole premise is *do not change the frontend*. `columns.position` and `todos.position` are therefore created in the new schema, along with `columns_board_id_position_idx` and `todos_column_id_position_idx`.

Removing them stays available later as `IMPLEMENTATION_PLAN.md`'s M6-05 — a proper expand → backfill → contract sequence, on its own.

## 8.6 Seed data (P7)

The seed is a test fixture, not a demo. It must contain, at minimum:

- two users with known passwords, plus a third who is a viewer only
- two boards, one filed in a space and one unfiled
- **all four roles** represented on one board
- the four default columns, plus a fifth with a `max_limit` set
- an **Epic** with two Tasks, one of which has two Subtasks
- a card with **no column** (backlog-only) and a card with a column but no sprint
- an **active** sprint and a **future** sprint on the same board
- an item with `estimate = null` and one with `estimate = 0`
- a comment authored by the **viewer**
- a board with ~200 todos, for the index checks in B11

Every one of these exercises a rule from §4.3. A seed without them is a seed that cannot catch a missing constraint.

## 8.7 The SQL-first Prisma strategy — **DECIDED**

**Prisma is the ORM. SQL is the source of truth. The two are connected by introspection, never by Prisma's schema language.**

```
prisma/migrations/*/migration.sql     ← hand-written. THE SOURCE OF TRUTH.
          │
          │  prisma migrate deploy        (applies them, in order, with a ledger)
          ▼
    PostgreSQL 18.6
          │
          │  prisma db pull               (reads the real schema)
          ▼
    prisma/schema.prisma              ← GENERATED. Never hand-edited.
          │
          │  prisma generate
          ▼
    @prisma/client                    ← typed queries for *.repo.ts
```

### The five rules

**1. SQL migrations are the source of truth.** Every schema change is a hand-written `migration.sql`. Nothing is expressed first in `schema.prisma`.

**2. `prisma db pull` generates the schema.** `schema.prisma` is a derived artifact with a header saying so. A pull request that hand-edits it is wrong.

**3. Never model unsupported objects in Prisma.** Prisma's schema language cannot express — and must not be asked to express — any of:

| Object | Example in this schema |
|---|---|
| CHECK constraints | all 22, including `activities_event_valid` over the `(entity_type, action)` pair |
| Partial indexes | `todos_sprint_id_idx`, `todos_backlog_idx`, `notifications_user_unread_idx` |
| **Partial unique** indexes | `sprints_one_active_per_board` |
| Expression indexes | `profiles_username_lower_key` on `lower(username)` |
| Triggers | all 17 |
| Functions | all 12 trigger functions, plus `rebalance_*` and `prune_activities` |
| Composite FKs to a non-PK unique key | the four in §4.1 |

Introspection will drop or mangle some of these in `schema.prisma`. **That is expected and harmless** — the objects still exist in the database, still fire, and still enforce. `schema.prisma` is a *query-typing* artifact, not a schema definition.

**4. `prisma migrate dev` is banned on this project.** It diffs the database against `schema.prisma` and rewrites migrations to match — which, given rule 3, would silently propose dropping every CHECK, trigger and partial index it cannot see. Use it once and the schema is quietly gutted.

**5. `prisma migrate deploy` is the only apply command.** It applies pending `migration.sql` files in order, records them in `_prisma_migrations`, and never generates or diffs anything.

### Workflow

```bash
# add a migration            mkdir prisma/migrations/000N_name && write migration.sql
npm run db:migrate           # prisma migrate deploy
npm run db:pull              # prisma db pull && prisma generate
npm run db:ping              # existing pg-based connection check
```

`prisma migrate status` reports drift. `prisma migrate resolve` fixes a ledger that disagrees with reality. Neither `dev` nor `reset` appears in any script — **if they are not in `package.json`, they cannot be run by muscle memory.**

### Why `pg` stays installed

It is not redundant with Prisma:

- `db:ping` and the `/health` check — a connection test that does not depend on a generated client
- `withActor`'s `set_config` call, and any raw SQL utility
- readable diagnostics (`describeError` unwraps the `AggregateError` a refused connection produces)

**`$executeRawUnsafe` is banned.** It interpolates strings into SQL. Use `$executeRaw` / `$queryRaw` with tagged templates, or `pg` with bind parameters.

### Why not Kysely or raw `pg`

Kysely is arguably the better fit for a SQL-first schema, and raw `pg` the most transparent. Prisma wins on the constraint that matters most here: **the volume of learning material**, given a stated project goal that the owner can read and extend the backend unaided. The SQL-first arrangement above removes Prisma's main drawback — its schema language — while keeping its typed client.

Everything stays behind `*.repo.ts`, so this remains reversible.

---

# 9. Authentication

**(proposed — B5)**

## 9.1 What clean start removes from this section

The old plan's largest unknown — *are the bcrypt hashes readable and portable?* — is gone. So is the transparent re-hash path, the dual-format verify, and the 90-day cutoff for stragglers.

**`lib/password.ts` is now argon2id and nothing else.** There is no legacy format, and none will be added.

## 9.2 Token strategy

```
POST /auth/login
  ├── 200 { user, accessToken }                   ← accessToken kept in JS memory only
  └── Set-Cookie: refresh=<opaque>; HttpOnly; Secure; SameSite=Lax;
                  Path=/api/v1/auth; Max-Age=30d

POST /auth/refresh   (cookie only, no body)
  ├── 200 { accessToken }
  └── Set-Cookie: refresh=<new opaque>            ← rotated every time
```

- **Access token** — JWT, ~15 minutes, HS256. Claims: `sub`, `iat`, `exp`, `jti`. **No role claims** — roles are per-board and change; a token-embedded role means a demotion takes 15 minutes to take effect. Roles are read per request (§10.4).
- **Refresh token** — 32 random bytes, stored as `sha256(token)` in `sessions`, rotated on every use. **Presenting a rotated token revokes the whole `family_id`** — that is either theft or a badly broken client, and both warrant a re-login.
- **Logout** — revoke the presented session row, clear the cookie. "Log out everywhere" revokes all rows for the user.

**Why the access token lives in memory rather than `localStorage`:** an XSS that reads `localStorage` steals a token usable for its full lifetime. In memory it dies with the tab. The cost is one refresh call per page load — which is also how the app learns who you are.

This is strictly better than today, where the GoTrue JWT sits in `localStorage` readable by any XSS.

## 9.3 Registration — porting `provision_user`

`POST /api/v1/auth/register`, body `{ email, password, username }`.

Reproduce the sequence that is currently split across `signUp` + the confirmation trigger + `provision_user`:

1. **Validate.** Email shape. Password policy (**§21.7 — undecided**; GoTrue's default was 6 characters, too weak for a company system). Username against the same rules as `utils/username.ts` and the `profiles_username_shape` CHECK.
2. **Resolve a unique username** the way `available_username()` does — seed plus numeric suffix, so a taken name becomes a suggestion rather than an error.
3. **In one transaction:** insert `users`, `profiles`, the "Unfiled" space, the board "My Board", and the four default columns with their categories (`To Do`/todo, `In Progress`/in_progress, `In Review`/in_progress, `Done`/done).
4. **Keep it idempotent** exactly as `provision_user` is: if the user already has a board, return it rather than minting a second. Signup can be retried, and that has not changed.
5. **Email verification** — §21.8. Recommendation for an internal tool: require it, since it is the only proof the address is real and invites are matched by email. Until SMTP exists, auto-verify behind a config flag in development only, never in production.

Two details from the current triggers that are worth carrying as *principles* even though the mechanism changes:

- `handle_new_user` must never raise — it runs inside the account insert.
- `handle_user_confirmed` swallows errors and logs a warning, because provisioning must not be load-bearing for confirming an account.

In the new backend both collapse into one transactional service call, so the failure modes differ — but the intent (**a provisioning failure must not cost someone their account**) should survive.

## 9.4 Login

`POST /api/v1/auth/login`, body `{ identifier, password }` — identifier is an email *or* a username, because that is what the current form accepts.

1. `normalizeIdentifier()` decides which (port `utils/identifier.ts`).
2. Username → resolve via `lower(username)`. **This replaces the `login_email_for` RPC, and moving it server-side is an improvement** — today that RPC is callable by `anon` and is a username-existence oracle by design.
3. Verify the password with argon2id.
4. **Every failure returns the same 401 with the same message** (`"Invalid login credentials"`) — no such user, wrong password, unverified account. The current code is careful about this and its comment says why. **Make the timing constant too:** always run a verification, against a dummy hash when the user does not exist, so response time is not the oracle.
5. Mint tokens, record the session row.

## 9.5 The remaining endpoints

| Endpoint | Notes |
|---|---|
| `POST /auth/refresh` | must work with **no** `Authorization` header — an expired access token is exactly when it is called |
| `POST /auth/logout` | revoke + clear cookie |
| `GET /auth/me` | what `AuthProvider` calls on mount, replacing `getSession()`. A 401 means "not signed in" and is not an error to toast |
| `POST /auth/password/forgot` | **always** 200 whether or not the address exists. Rate-limit hard, by IP and by address |
| `POST /auth/password/reset` | verify token, update hash, **revoke every session for that user** |
| `GET /auth/username-available?username=` | replaces the `username_available` RPC. **Rate-limit it** — it is an enumeration endpoint by nature. Advisory only; the unique index remains the guarantee |
| `POST /auth/verify-email` | consume a verification token |

### The password-reset flow gets simpler

Today the recovery link *signs the user in*, which is why `/reset-password` is routed outside both guards and why `ResetPasswordPage.tsx` reaches for the Supabase client directly.

In the new flow the page reads `?token=` from the URL and POSTs it. No session, no special routing. Keep the route outside the guards anyway — a signed-in user may still be resetting.

## 9.6 Security requirements (non-negotiable)

- `helmet()` for baseline headers; CORS locked to the exact frontend origin with `credentials: true`.
- `express-rate-limit` on `/auth/*`: strict per-IP on login/register/forgot, plus a per-account login counter with backoff.
- Hash refresh tokens and reset tokens at rest. **The database must never contain a usable credential.**
- Rotate refresh tokens; detect reuse.
- Never log request bodies on auth routes.
- TLS in production; `Secure` on every cookie.
- Cap password length (~128 bytes) so a huge input cannot be a CPU denial-of-service.
- Revoke all sessions on password change.

---

# 10. Authorization — replacing RLS

**(proposed — B6.** This is the highest-value section in the plan.**)**

## 10.1 What we are replacing

~30 RLS policies over 10 tables, expressed through two helpers (`accessible_board_ids()`, `board_role()`), plus the rank rules embedded in eight `SECURITY DEFINER` functions.

`docs/SUPABASE_DATABASE_AUDIT.md` §8 and `scripts/verify-m3-16-role-matrix.sql` (63 KB of SQL assertions) are the existing specification and the existing test suite. **Both are inputs to this work, not artifacts to discard.** The verification script enumerates the matrix case by case; B11's integration suite is that script re-expressed as HTTP calls.

## 10.2 The decision: middleware, not RLS

Two credible options:

**Option A — keep RLS.** Connect as a non-superuser role and set a user id per transaction (via `set_config`) so the policies still fire.
*For:* the tested policies survive verbatim; a forgotten check in a handler is harmless; genuine defence in depth.
*Against:* every request must be a transaction; it fights an ORM; failures present as empty results rather than errors, which is painful to debug; and the org-level roles that are coming would make the policies substantially more complex in a language with no test runner.

**Option B — authorization in Express. ✅ Recommended.**
*For:* legible, debuggable, unit-testable TypeScript; the coming Team Lead / Director rules are far easier to express; one place to read to know what the rules are.
*Against:* a forgotten check is a real vulnerability. That is the cost, and 10.3 is how we pay it.

**Chosen: B**, with two compensating controls.

> Recommended regardless: leave RLS *enabled* on the new tables with no permissive policies for any role but the application role. If the database is ever reachable by another client, the default is then deny.

## 10.3 The two compensating controls

### (1) There is no unscoped repository function for a board-scoped table

Every function in a board-scoped `*.repo.ts` takes a `boardId` as its first parameter. Not "should take" — *takes*, as a matter of signature, so omitting it is a compile error.

```ts
export function findByBoard(boardId: string): Promise<TodoRow[]>
export function findOne(boardId: string, todoId: string): Promise<TodoRow | null>
export function remove(boardId: string, todoId: string): Promise<void>
//                     ^^^^^^^ always first, always required
```

Audit §8.4 lists the queries that are one missing `WHERE` away from being a leak. This is what stops them.

Scoping by `(boardId, id)` rather than `id` also reproduces a property `todoApi.fetchTodo` already relies on and documents: **a pasted id from another board must 404, not leak the row.**

### (2) The role matrix is a table, not a series of `if`s

Port `src/services/members/permissions.ts` to `backend/src/lib/permissions.ts` **unchanged**. It is already the right shape — `roleRank()`, `permissionsFor()`, `canEditComment`, `canDeleteComment`, `canDeleteAttachment`, `canActOnMember`, `assignableRoles` — and it already has a passing test file. Copy the tests too.

The backend then *is* the specification the frontend mirrors, rather than the other way round.

## 10.4 The middleware chain

```
requestContext → requireAuth → boardAccess(':boardId') → requireRole('editor') → validate(schema) → controller
```

**`requireAuth`** — verifies the access JWT, sets `req.actor`, 401 otherwise. Applied to everything except `/auth/login|register|refresh|forgot|reset` and `POST /invites/:token/accept`, which has its own rule.

**`boardAccess`** — the direct replacement for `accessible_board_ids()` + `board_role()`:

```
boardId = req.params.boardId  OR  resolved from :todoId / :commentId / :attachmentId / :sprintId
role    = membersRepo.roleOf(boardId, req.actor.id)
if (!role) → 404 NOT FOUND          ← not 403
req.board = { id: boardId, role }
```

Two details that matter:

- **404, not 403**, for a non-member. RLS returns an empty set today, so a non-member cannot distinguish "no such board" from "not yours". A 403 would turn every board id into an existence oracle. Same for todo, comment and attachment ids.
- **One shared resolver** handles the routes whose path names a child rather than a board. It looks up the row's `board_id` **and then applies the same membership check**.

**`requireRole(min)`** — `roleRank(req.board.role) >= RANK[min]`, else 403. That is `board_role(board_id) in ('owner','admin','editor')` in one line.

Rules that rank alone cannot express stay in the service, using the copied helpers:

```ts
if (!canDeleteComment(ctx.role, ctx.actorId, comment.author_id))
  throw new AppError(403, "FORBIDDEN", "You can only delete your own comments");
```

## 10.5 Every policy, and its replacement

| Table | Current policy | Replacement |
|---|---|---|
| `boards` SELECT | `owner_id = uid() or is_board_member(id)` | `boardsRepo.accessibleBoardIds(actor)` — the Express analogue, and the single swap point (§10.7) |
| `boards` UPDATE | `board_role(id) in ('owner','admin')` | `boardAccess` + `requireRole('admin')` |
| `boards` DELETE | owner only | `requireRole('owner')` |
| `boards` INSERT | self-owned | service sets `owner_id = actor.id`; **never accept it from the body** |
| `columns`, `todos`, `sprints` SELECT | `board_id in accessible_board_ids()` | `boardAccess` |
| same, INSERT/UPDATE/DELETE | `board_role(board_id) in ('owner','admin','editor')` | `requireRole('editor')` |
| `comments` SELECT | board membership | `boardAccess` via the todo |
| `comments` INSERT | member **and** `author_id = uid()` | service sets `author_id = actor.id` |
| `comments` UPDATE | author only, `content` the only grantable column | `canEditComment` + a Zod schema whose only key is `content` |
| `comments` DELETE | author **or** admin+ | `canDeleteComment` |
| `attachments` SELECT | board membership | `boardAccess` |
| `attachments` INSERT | `uploader_id = uid()` **and** role ≥ editor | `requireRole('editor')`; service sets `uploader_id` |
| `attachments` DELETE | uploader (≥editor) **or** admin+ | `canDeleteAttachment` |
| `attachments` UPDATE | **no policy, no grant** | **no endpoint.** Immutability is a product rule — a rename is a delete and a re-upload |
| `activities` SELECT | board membership | `boardAccess` |
| `activities` INSERT | **no policy, no grant** | **no endpoint.** Triggers only |
| `notifications` SELECT/UPDATE/DELETE | `user_id = uid()` | every notification repo function takes `actorId` as its first parameter |
| `notifications` INSERT | **no grant** | **no endpoint.** Triggers only |
| `spaces` all | `owner_id = uid()` | `spacesRepo.*(actorId, …)` |
| `profiles` all | `uid() = id` | `PATCH /users/me` only; **never** `PATCH /users/:id` |
| `board_invites` SELECT | admins on that board | `requireRole('admin')` |
| `board_members` SELECT | **self-read only** | no direct endpoint; the roster is the `board_roster` replacement, membership-gated |
| storage: `task-attachments` | 3 path-based policies | §14 — the download endpoint applies the same checks |
| storage: `avatars` | own folder | `POST /users/me/avatar` writes only the actor's key |

## 10.6 Porting the RPC rules

The `SECURITY DEFINER` functions carry rules the policies do not. **Port each in the same order, with the same messages** — the order matters, and the SQL comments say why.

**`create_invite` → `invitesService.create`:** authenticated → caller's rank from the database, never from the body → **validate the requested role before any rank comparison** (`null <= 3` is NULL, and an `if` on NULL does not branch, which turns a deny into an allow — the SQL comment calls this "the single most dangerous shape in this file") → refuse `'owner'` explicitly → require admin+ → require strictly-below → clamp expiry to 1–30 days → mint the token server-side.

**`accept_invite` → `invitesService.accept`:** authenticated → find **and lock** the invite (`SELECT … FOR UPDATE` inside the transaction; without the lock two simultaneous clicks both read `accepted_at` as NULL) → not-found and revoked are indistinguishable → expired → refuse `'owner'` → **already-a-member returns a clean `already_member` *before* the spent check** (this is what makes a repeat click idempotent) → insert membership `ON CONFLICT DO NOTHING` → stamp `accepted_at`.

**`set_member_role` / `add_board_member` / `remove_board_member`:** the owner is never a valid target → `'owner'` is never a grantable role → admin+ only → strictly below the actor's rank, **on both the target's current role and the new role**.

**`leave_board`:** self-removal only; the owner cannot leave.

**`delete_column` → `columnsService.remove`:** both ids required, must differ, must be on the same board → rehome todos **appending after the destination's last card** → delete the column. **One transaction.**

**`start_sprint` → `sprintsService.start`:** must be `future` → find the board's first `todo`-category column by `rank nulls last, position` → bulk-assign it to sprint items with `column_id is null` → set `active`. The partial unique index enforces one-active; let its 23505 surface as a clean 409.

**`complete_sprint`:** must be `active` → destination must differ and be same-board → move every item **not** in a `done`-category column to the destination or to null → set `completed`. Finished items keep their `sprint_id`.

**`board_roster` → `GET /boards/:boardId/members`:** membership-gated, returns `id, username, full_name, avatar_url, role, joined_at`. Note `membersApi.ts`'s warning — never replace it with a plain select on `board_members`, which is self-read only and would silently return one row.

**`search_board_invitees`:** returns nothing under two characters — keep that; it is what stops a half-typed query walking the user table.

## 10.7 Designing for roles that do not exist yet

Two structural decisions make Team Lead / Director / Superadmin addable later without a rewrite.

**(1) One function answers "which boards may this actor see".**

```ts
export async function accessibleBoardIds(actor: Actor): Promise<string[]>
```

Today: owner ∪ member. Later: ∪ org-wide for a director. **One function, one edit** — precisely the property that let M3 widen the SQL version from owner-only to membership without touching a policy. **Never inline this query anywhere else.**

**(2) `Actor` has room for an org dimension from day one.**

```ts
interface Actor {
  id: string;
  orgRole?: "member" | "team_lead" | "director" | "superadmin";  // always "member" until it isn't
}
```

Ship it as an optional field with one possible value, and route every check through a helper rather than an inline comparison.

**Three rules decided now, so they are not decided under pressure:**

1. **Elevated roles widen *read*, not *write*.** A Director sees every board; they do not gain `editor` on all of them. Reporting is a read concern, and this keeps the board matrix one-dimensional.
2. **Elevated access is logged.** Reading a board you are not a member of writes an audit row. This is the argument that makes org-wide visibility acceptable to the people being viewed.
3. **Board ownership stays immutable.** Both triggers stay. A Superadmin panel that reassigns a board is a *new, explicit* operation with its own endpoint and its own audit entry — not a side effect of a role having a higher number.

---

# 11. API design

**(proposed — B7)**

Conventions:

- Base path `/api/v1`. JSON in, JSON out. Field names stay **exactly** as the database and `types/data.ts` spell them (`board_id`, `column_id`, `backlog_rank`) — camelCase is rejected in §4.4.
- **Auth column:** 🔓 public · 🔐 signed in · 📋 board member · ✏️ editor+ · 🛡 admin+ · 👑 owner · 👤 resource-specific (author/uploader/self).
- Errors: `{ error: { code, message } }`. **404, not 403,** when the actor is not a member.
- Ids in request bodies are honoured where the client mints them today (`todos`, `comments`, `boards`, `spaces`) — load-bearing for optimistic updates.
- Actor-derived fields (`creator_id`, `author_id`, `uploader_id`, `owner_id`, `actor_id`) are **always set server-side and ignored if present in the body.**

## 11.1 Auth

| Method | Endpoint | Purpose | Auth |
|---|---|---|:-:|
| POST | `/auth/register` | account + profile + space + board + 4 columns, one transaction | 🔓 |
| POST | `/auth/login` | email **or** username + password | 🔓 |
| POST | `/auth/refresh` | rotate | 🔓 (cookie) |
| POST | `/auth/logout` | revoke this session | 🔐 |
| GET | `/auth/me` | who am I | 🔐 |
| POST | `/auth/password/forgot` | send reset link; **always** 200 | 🔓 |
| POST | `/auth/password/reset` | consume token, revoke sessions | 🔓 |
| GET | `/auth/username-available?username=` | advisory | 🔓, rate-limited |
| POST | `/auth/verify-email` | consume verification token | 🔓 |

## 11.2 Users

| Method | Endpoint | Purpose | Auth |
|---|---|---|:-:|
| GET | `/users/:userId` | public profile — used by avatars and comment authors | 🔐 |
| PATCH | `/users/me` | `username`, `full_name`, `bio`, `avatar_url` | 👤 |
| POST | `/users/me/avatar` | multipart; writes `<userId>/avatar.<ext>` | 👤 |

**No `PATCH /users/:id`.** Today's `profileApi.updateProfile` takes the id from the client and relies on RLS — the exact pattern that must not survive.

## 11.3 Spaces and boards

| Method | Endpoint | Purpose | Auth |
|---|---|---|:-:|
| GET / POST | `/spaces` | list / create | 🔐 |
| PATCH / DELETE | `/spaces/:spaceId` | rename / delete (boards become unfiled) | 👤 owner |
| GET | `/boards` | every reachable board — **the `accessibleBoardIds` call site** | 🔐 |
| POST | `/boards` | server sets `owner_id` + inserts the owner membership row | 🔐 |
| GET | `/boards/:boardId` | | 📋 |
| PATCH | `/boards/:boardId` | `title`, `description`, `icon`, `cover_color`, `space_id` | 🛡 |
| DELETE | `/boards/:boardId` | cascade | 👑 |

`space_id` carries the `boards_space_ownership` rule: unfiling is always allowed; filing requires owning both.

## 11.4 Members and invites

| Method | Endpoint | Purpose | Auth |
|---|---|---|:-:|
| GET | `/boards/:boardId/members` | the roster | 📋 |
| POST | `/boards/:boardId/members` | `{ user_id, role }` | 🛡 + strictly-below |
| PATCH / DELETE | `/boards/:boardId/members/:userId` | change role / remove | 🛡 + strictly-below |
| DELETE | `/boards/:boardId/members/me` | leave; owner refused | 📋 |
| GET / POST | `/boards/:boardId/invites` | list pending / create (returns the token **once**) | 🛡 |
| DELETE | `/invites/:inviteId` | revoke — **deletes the row** | 🛡 |
| GET | `/boards/:boardId/invitees?q=` | search; empty under 2 chars | 🛡 |
| GET | `/invites/mine` | invites addressed to my email | 🔐 |
| POST | `/invites/:token/accept` \| `/decline` | token only — never a board or a role | 🔐 |

## 11.5 Columns, todos, sprints

| Method | Endpoint | Purpose | Auth |
|---|---|---|:-:|
| GET / POST | `/boards/:boardId/columns` | list / create (server computes the append rank) | 📋 / ✏️ |
| PATCH | `/columns/:columnId` | `title`, `min_limit`, `max_limit` | ✏️ |
| POST | `/columns/:columnId/move` | `{ rank }` — **one row** | ✏️ |
| DELETE | `/columns/:columnId` | `{ moveToColumnId }`; rehome + delete, one transaction | ✏️ |
| POST | `/boards/:boardId/columns/rebalance` | respace ranks | ✏️ |
| GET | `/boards/:boardId/todos` | **the whole board, one flat array**, subtasks included, `TODO_LIST_FIELDS` only | 📋 |
| GET | `/todos/:todoId` | full row for the detail modal | 📋 |
| POST | `/boards/:boardId/todos` | **upsert** on the client's id | ✏️ |
| PATCH | `/todos/:todoId` | **upsert semantics** — see §12.3 | ✏️ |
| DELETE | `/todos/:todoId` | cascades comments + attachments | ✏️ |
| POST | `/todos/:todoId/move` | `{ column_id, rank }` — the drag path, one row | ✏️ |
| POST | `/boards/:boardId/columns/:columnId/rebalance` | respace one column's todo ranks | ✏️ |
| GET / POST | `/boards/:boardId/sprints` | list / create | 📋 / ✏️ |
| PATCH / DELETE | `/sprints/:sprintId` | **never `state`** / delete (items return to backlog) | ✏️ |
| POST | `/sprints/:sprintId/start` \| `/complete` | the two transitions | ✏️ |

**Epics and Subtasks need no endpoints of their own.** They are `todos` rows distinguished by `parent_id`; `subtasks.ts` derives the roles client-side. Adding `/epics` would invent a second model.

## 11.6 Comments, attachments, activity, notifications, feed

| Method | Endpoint | Purpose | Auth |
|---|---|---|:-:|
| GET / POST | `/todos/:todoId/comments` | list / create (server sets `author_id`, `board_id`) | 📋 — **viewers may comment** |
| PATCH | `/comments/:commentId` | `{ content }` only | 👤 author |
| DELETE | `/comments/:commentId` | | 👤 author or 🛡 |
| GET | `/todos/:todoId/attachments` | metadata | 📋 |
| POST | `/todos/:todoId/attachments` | multipart, ≤ 25 MB | ✏️ — `canAttach` |
| GET | `/attachments/:id/content` | download, `Content-Disposition: attachment` | 📋 |
| GET | `/attachments/:id/preview` | inline — **only** image or PDF | 📋 |
| DELETE | `/attachments/:id` | object first, then row | 👤 uploader or 🛡 |
| GET | `/boards/:boardId/activities?limit=50&cursor=` | feed, newest first | 📋 |
| GET | `/todos/:todoId/activities` | one item's history | 📋 |
| GET | `/notifications` · `/notifications/unread-count` | inbox | 👤 self |
| POST | `/notifications/read` · `/read-all` | mark | 👤 self |
| GET | `/me/feed?tab=assigned\|recent\|worked-on` | cross-board personal feed | 🔐 |

**No PATCH on attachments** — immutable by design.
**No write endpoint on activities** — triggers only, ever.

**The feed is the one place scoping is not a single `boardId`.** `forYouApi.fetchRecentTodos` has no board filter at all today. The replacement must call `accessibleBoardIds(actor)` and apply `WHERE board_id = ANY($ids)` **before** `LIMIT`, or the page fills with rows the actor cannot see and then gets emptied.

## 11.7 Timeline, Calendar, Summary — no endpoints

These are **derived views**, not data sources. `services/views/summary.ts`, `calendar.ts`, `timeline.ts` and `trends.ts` fold the same array `useVisibleTodos` returns. `summary.ts` says so: *"no stats table, so the Summary can't drift from the board."*

Adding `/boards/:id/summary` would create a second implementation of the same arithmetic. **Do not.** Revisit only when a report must span more boards than a browser can reasonably fetch.

## 11.8 Size

≈ 60 endpoints across 13 modules. Not padded — each replaces a call that exists in `src/services/` today.

---

# 12. Frontend migration

**(proposed — B8)**

## 12.1 The headline

**The frontend migration is 19 files.** Not 330. That is the payoff from a rule the project has followed since M1: *"UI never communicates with Supabase directly"* (`docs/API.md`).

| Category | Count | Work |
|---|---|---|
| Components | ~140 | **none** |
| Hooks (`hooks/` + `services/*/use*.ts`) | ~85 | **none**, if `*Api.ts` signatures hold |
| Pure logic + tests | ~75 | **none** |
| `*Api.ts` data modules | 15 | rewrite the bodies, keep the exports |
| `AuthProvider` · `useBoardRealtime` · `useUsernameAvailability` · `ResetPasswordPage` | 4 | genuine restructuring |
| *New:* `services/api/client.ts` | 1 | the fetch wrapper |

**Strategy:** treat `*Api.ts` as an interface, not as implementation. Change what is behind it; do not change its shape.

## 12.2 Clean start changes the migration order — auth goes FIRST

**This is the most important change in this section, and it inverts the previous plan.**

The old plan migrated `authApi` and `AuthProvider` *last*, on the reasoning that everything else would already have been exercised against the new backend. **With a clean start that is wrong**, and the reason is worth understanding:

> A mixed state is impossible. If `AuthProvider` still uses Supabase, `user.id` is a Supabase uuid that **does not exist** in the new PostgreSQL. `GET /users/:id` 404s. `usePermissions` finds no membership. Board ids from Supabase name no board in the new database. Every request fails.

The two systems share no ids and no users, so **no module can be migrated in isolation.**

Three consequences:

1. **Auth migrates first.** Nothing else can work until identity comes from the new backend.
2. **The `VITE_API_MODE` flag is global, not per-module.** It flips *every* module at once — back to a working Supabase app, or forward to a working Express app. It can never be half and half.
3. **B8 is one feature branch, not a series of independently mergeable PRs.** Individual modules are still separate *commits*, reviewable one at a time, but the branch only merges when all 19 files are done.

That is a real cost of clean start, and it is worth stating plainly rather than discovering it in week two.

## 12.3 The API client and the invariant it must protect

`src/services/api/client.ts` replaces `src/services/api/supabase.ts`:

- base URL from `VITE_API_URL`, validated at module load (same discipline as today's `supabase.ts`);
- `credentials: "include"` on every request;
- `Authorization: Bearer <accessToken>` from the in-memory holder;
- `{ error: { code, message } }` parsed into a thrown `ApiError` carrying `status`, `code`, `message`;
- **on 401: refresh once, retry once, else sign out** — with a single shared in-flight refresh promise, so ten parallel queries do not fire ten refreshes;
- **`AbortSignal` passed through to `fetch`.** `supabase-js` handles this today. Miss it and a cancelled query's late response can overwrite an optimistic patch — rare, confusing, hard to reproduce.

### The optimistic-update invariant

The optimistic model depends on **client-minted uuids**: the optimistic row and the stored row are the same row, which is why there is no `isOptimistic` flag anywhere. Two server-side requirements follow, and they are not optional:

1. `POST /boards/:boardId/todos` must **accept** the client's `id` and **upsert** on conflict.
2. `PATCH /todos/:todoId` must **upsert too**, because `updateTodo` is called on cards whose insert may still be in flight. `todoApi.ts` says it outright: *"Upsert, not update — a freshly created card can get patched before its insert lands, and `.update()` would silently match zero rows."*

If the backend rejects a client-supplied id, or 404s a PATCH for a row it has not seen, **the board will look correct and then silently revert.** That failure mode is hard to diagnose after the fact — make it a B7 acceptance test: PATCH a todo id that does not exist yet, assert the row is created.

## 12.4 What TanStack Query keeps

Almost everything, and that is the point.

| Concern | Change |
|---|---|
| `queryKeys.ts` | none |
| `staleTime` / `gcTime` / mutation `retry: false` | none |
| `MutationCache` error toast | none — it reads `error.message`, and `ApiError` has one |
| `QueryCache` refetch-only toast | none |
| `meta: { silent: true }` | none |
| optimistic `onMutate` / `onError` rollback | none — they patch the cache, which does not know where data came from |
| `cache.ts` pure functions | none |
| `useScopedTodos` fan-out | none |
| `retryPolicy.ts` | simplify **after** the switch, not during — its tests pin the current behaviour |
| `queryClient.clear()` on sign-out | moves from `onAuthStateChange` to the new auth flow |

## 12.5 Signature changes, and why each is an improvement

| Function | Change |
|---|---|
| `addTodo`, `addBacklogItem` | drop the `supabase.auth.getUser()` round trip — the server knows the creator. Removes a network call from the create path |
| `createBoard`, `createSpace` | same, for `owner_id` |
| `addComment` | `author_id` disappears from the argument object |
| `updateProfile` | takes a patch, not a whole profile with an id |
| `signedUrl` / `signedPreviewUrls` | return API URLs instead of Supabase-signed URLs; `useAttachmentPreviews` keeps its shape |
| `signIn` | no longer calls `login_email_for` or `provision_new_user` — the server does both |

Each edits a handful of call sites, and `tsc -b` finds every one.

## 12.6 Order within B8

1. **`authApi` + `AuthProvider` + `client.ts`** — first, for the reason in §12.2. Nothing else works until this lands.
2. `profileApi` + `useUsernameAvailability` — small, and proves the client end to end.
3. `spacesApi`, `boardsApi` — simple CRUD.
4. `columnsApi`, `sprintsApi` — CRUD plus the first named-action endpoints.
5. `todoApi` — the big one: upsert semantics, `/move`, rebalance, `TODO_LIST_FIELDS` parity.
6. `commentsApi`, `activitiesApi`, `notificationsApi` — reads plus the self-scoping rules.
7. `membersApi`, `invitesApi` — the permission-heavy ones.
8. `attachmentsApi` + `uploadAvatars` — multipart and signed URLs.
9. `forYouApi` — last; it needs `accessibleBoardIds` and the pre-`LIMIT` scoping.
10. `ResetPasswordPage` — read `?token=`, POST it, drop the Supabase import.
11. `useBoardRealtime` — rewritten against Socket.IO, **signature unchanged**.
12. **Cleanup:** delete `services/api/supabase.ts`, remove `@supabase/supabase-js`, remove the `VITE_SUPABASE_*` stubs from `vitest.config.ts`, **remove the `VITE_API_MODE` flag and every Supabase branch.**

> Step 12 is in the exit criteria on purpose. A dead code path that can still reach a second datastore is a liability.

## 12.7 Environment variables

| Variable | Before | After |
|---|---|---|
| `VITE_SUPABASE_URL` | required | **removed** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | required | **removed** |
| `VITE_API_URL` | — | **new** — `http://localhost:4000/api/v1` |
| `VITE_WS_URL` | — | **new**, optional; derive from `VITE_API_URL` if absent |

`vitest.config.ts` stubs the two Supabase variables so the module-load guard does not fire in CI. When `supabase.ts` is deleted, that stub block goes with it — or becomes a `VITE_API_URL` stub if the new client keeps the throw-at-load discipline, which it should.

## 12.8 Cross-tab sign-out

Free today via `onAuthStateChange`. To keep it: write a marker to `localStorage` on logout and listen for the `storage` event. A few lines in `AuthProvider`. It was built for a real scenario — two users sharing one browser — and the risk has not gone away.

---

# 13. Realtime

**(proposed — B9)**

## 13.1 The behavioural difference that matters most

Supabase Realtime streams PostgreSQL's logical replication, which means **every write broadcasts, whatever made it** — a trigger cascade, a bulk `UPDATE`, even a manual `psql` fix.

With Express emitting from the service layer, **only what a service remembers to emit will broadcast.**

| Write | Broadcasts today? | Under Socket.IO |
|---|:-:|---|
| `PATCH /todos/:id`, `POST /todos/:id/move` | ✓ | ✓ — service emits |
| `DELETE /columns/:id` (rehomes N todos first) | ✓ (N+1 events) | ⚠️ **must be emitted deliberately** |
| `POST /sprints/:id/start` (bulk-assigns a column) | ✓ (N events) | ⚠️ **deliberately** |
| `POST /sprints/:id/complete` (rehomes N items) | ✓ | ⚠️ **deliberately** |
| `DELETE /todos/:id` (cascades comments, attachments) | ✓ for comments | ⚠️ **deliberately** |
| a manual `psql` fix | ✓ | ✗ — accepted, and worth knowing |

**The rule:** any service function that writes more than one row emits a **coarse** event rather than enumerating rows:

```
io.to(`board:${boardId}`).emit("board:invalidate", { scopes: ["todos", "columns"] })
```

The client maps that to `queryClient.invalidateQueries`. `useBoardRealtime` already does exactly this on resubscribe, so the handler exists.

## 13.2 Choice: Socket.IO

| Option | Verdict |
|---|---|
| **Socket.IO** | **Chosen.** Rooms are a native `board:${boardId}` fit. Reconnection with backoff, heartbeats and fallback transports are built in — all things `useBoardRealtime` gets free from Supabase today and would otherwise be hand-rolled. Typed events with generics |
| `ws` (native) | Rejected for the MVP. Smaller and faster, but you write reconnection, heartbeats, room routing and framing yourself — three or four of the exact bugs Socket.IO has already fixed |
| SSE | Rejected. One-directional, so presence needs a second channel |
| Polling | Rejected as the primary mechanism — **but** it is the right answer for the features that have no realtime today (§13.5) |

At 200 users, one Node process with in-memory rooms suffices. The Redis adapter becomes necessary when a **second instance** exists — note it as the trigger, do not build it now.

## 13.3 Connection and authorization

```
io.use(handshake):  verify the access JWT from socket.handshake.auth.token → socket.data.actor

on "board:join":    role = membersRepo.roleOf(boardId, actor.id)
                    if (!role) → refuse
                    socket.join(`board:${boardId}`)
                    presence.add(...)
```

**The membership re-check on join is load-bearing.** RLS applies to the replication stream today, so a removed member stops receiving rows automatically. Without this check, a removed member holding an open socket keeps receiving the board's traffic. Also handle the live case: when a member is removed, force their sockets out of the room.

Access tokens expire every 15 minutes; simplest is for the client to reconnect the socket on refresh.

## 13.4 Event shapes are constrained by existing client code

Emit exactly what `services/realtime/events.ts` already parses, so **that file and its tests do not change**:

```
"todo:change"      { eventType: "INSERT"|"UPDATE"|"DELETE", new: Partial<Todo>,    old: Partial<Todo> }
"column:change"    { …, new: Partial<IColumn>, old: Partial<IColumn> }
"comment:change"   { …, new: Partial<Comment>, old: Partial<Comment> }
"board:invalidate" { scopes: [...] }
"presence:sync"    { viewers: string[] }
```

Two behaviours to reproduce on purpose:

- **DELETE carries only the id.** The tables are `REPLICA IDENTITY DEFAULT` today, so `events.ts` is written for `change.old?.id`. We *could* now send the whole deleted row — **don't**, at least not initially. Sending `{ old: { id } }` keeps the client and its tests unchanged, and "we send less than we could" is never a bug.
- **The echo rule.** `events.ts` skips an INSERT whose id it already holds, because ids are client-minted. It keeps working under Socket.IO with no change.

**If `events.ts` needs editing, the server's payloads are wrong.** That is the test.

## 13.5 Per-feature plan

| Feature | Today | Proposed |
|---|---|---|
| Todos, Columns, Comments | replication | typed `*:change` events from their services |
| Presence | Phoenix presence | in-memory per-room sets; `presence:sync` on join/leave/disconnect. One user may have several tabs — match `presence.ts`'s handling |
| Activity feed | **none** — `MutationCache.onSuccess` invalidates `["activities"]` | **keep as-is.** It works, costs nothing, and needs no socket |
| Notifications | **none** — polled | **add a targeted emit.** This is the one place realtime is a genuine product improvement: a per-user room + `notification:new` |
| Sprints, members, attachments | none | `board:invalidate` from their services |

## 13.6 Emit after commit, never inside the transaction

Emitting inside means a rollback still broadcast — clients then hold rows the database does not have, and nothing corrects them until a refetch.

## 13.7 What to verify (B11)

`docs/REALTIME_VERIFICATION.md` exists for the current implementation. Write its successor and check at least: two browsers see each other's drags without double-applying; a removed member's socket stops receiving within seconds; killing the server lets clients reconnect and resync without a reload; a bulk operation (`start_sprint`) updates the other client; presence appears, disappears, and survives a reconnect; **a rolled-back mutation broadcasts nothing.**

---

# 14. Storage and attachments

**(proposed — B10)**

## 14.1 What clean start removes

No object copying. No orphan sweep before copying. No key-rewriting. **The store starts empty.**

What it does *not* remove: every security property in audit §10 must be reproduced, and now it must be reproduced **explicitly in application code** rather than inherited from bucket configuration.

## 14.2 The driver interface

```
StorageDriver: put(key, body, contentType) · get(key) · delete(key) · exists(key)
```

Two implementations, chosen by `STORAGE_DRIVER=local|s3`:

- **`localDriver`** — writes under `backend/uploads/<key>`. Zero setup; gitignored. **Must reject any key containing `..` or an absolute path.**
- **`s3Driver`** — `@aws-sdk/client-s3`, which speaks to AWS S3, Cloudflare R2, MinIO and others alike.

**B12 deploys to a company server**, which makes `localDriver` a legitimate *production* choice — with the caveat that files then live on one machine and need their own backup. §21.9 is the decision.

## 14.3 Key shapes — keep them exactly

```
attachments:  <board_id>/<todo_id>/<attachment_id>.<ext>
avatars:      <user_id>/avatar.<ext>
```

Both carry **no user-supplied text**. That mattered under Supabase because the storage policies parsed the path as a board id, and a filename able to inject a `/` would let an uploader nominate a different board.

**Under the new backend the path is no longer the authorization key** — the API checks the database instead. The shape is kept anyway: it is already implemented and tested in `fileMeta.ts`, it keeps the board readable from the key as a cross-check, and a fixed avatar filename means a new upload overwrites the old one with no orphans.

## 14.4 The three rules that must survive

**1. Object before row, on both paths.** The file is written before the row and deleted before the row. Under Supabase the reason was that the storage DELETE policy found an object *through* its row. Under our own backend the reason is simpler but just as real: **bytes with no row are invisible orphans; a row with no bytes is a visible, retryable broken row.** Fail toward the visible one.

**2. Downloads force `Content-Disposition: attachment`.** The bucket has no MIME allow-list, so an uploaded `.html` is a stored cross-site-scripting payload waiting for an origin. This header is the entire defence.

```
GET /attachments/:id/content  → Content-Disposition: attachment; filename="<original>"
                                Content-Type: application/octet-stream
                                X-Content-Type-Options: nosniff

GET /attachments/:id/preview  → inline, and ONLY if previewKind(mime) is "image" | "pdf"
                                anything else → 400
```

`previewKind()` in `fileMeta.ts` is the gate — images render in `<img>` (a script-free context), PDFs render in an `<iframe>` (a judgement, not a guarantee). Port the function and its test, and **make the server the enforcement point** rather than trusting the client to call the right endpoint.

### SVG must be excluded from preview — a risk this migration introduces

`previewKind()` today returns `"image"` for **any** `image/*` mime, SVG included. Its comment reasons that *"an `<img>` is a script-free context, even for SVG"* — which is true, and is why this is safe on Supabase.

**It stops being safe here**, for a reason that has nothing to do with the function:

| | Today | After migration |
|---|---|---|
| Preview URL origin | `<project>.supabase.co` | **our API origin** |
| An SVG opened directly in a tab | executes on Supabase's origin — no access to our session | **executes on the API origin, which shares cookies with the app** |

The `<img>` argument only holds while the file is *inside* an `<img>`. Nothing stops a viewer opening `/attachments/:id/preview` in a tab, and an SVG rendered as a document runs its own `<script>`. Once that URL is same-site with the session cookie, an uploaded `.svg` is stored XSS.

**Required in B10 — three layers:**

1. **`previewKind()` returns `"none"` for `image/svg+xml`** (and for any `image/*+xml`). SVGs become forced downloads, like every other non-previewable type. This is the one behavioural difference from today, and it is deliberate.
2. **The preview response carries `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`**, plus `X-Content-Type-Options: nosniff`. Defence in depth for the families that *are* allowed.
3. **Consider serving attachments from a separate origin** (`files.company.com`). Optional, cheap if DNS allows, and it makes the whole class of mistake unreachable.

Sanitising SVG server-side (DOMPurify, `svg-sanitize`) is the alternative to rule 1 if inline SVG previews are wanted later. It is strictly more work and more risk than a forced download, so it is **not** in scope for B10.

The frontend change is one line in `fileMeta.ts` and an update to its test — the fallback card and download button it already renders for every other type take over.

**3. Upload permission is `canAttach` (editor+), not the comment matrix.** A viewer reads and downloads every file and adds none. `permissions.ts` records this as the one deliberate divergence between the two matrices.

## 14.5 Two access models

**Model A — stream through Express. ✅ Recommended for the MVP.** The endpoint checks membership and pipes the object. One authorization path, identical for local and S3, and no URL that outlives its check. Cost: bytes traverse the API process — irrelevant at 25 MB max and this user count.

**Model B — presigned S3 URLs.** What Supabase does today. Cost: a leaked URL stays valid until it expires regardless of a membership change, and the disposition override must be set in the signature, which is easy to forget.

**Recommendation:** Model A now, Model B when file traffic is measured to matter. Keep `signedUrl()` and `signedPreviewUrls()` as the client-side names either way, so the swap stays invisible above `attachmentsApi.ts`.

## 14.6 Limits — now enforced by the API

The bucket enforced these; the API must now do it.

| Setting | Value |
|---|---|
| Attachment max size | 25 MB (`26214400`) — enforce in the API **and** at the reverse proxy |
| Attachment MIME allow-list | **none**, matching today. The API is now the place to add one, if we ever want to |
| Avatar max size | 2 MB |
| Avatar MIME allow-list | `image/png`, `image/jpeg`, `image/webp` |
| Per-board quota | none; add when someone hits one |

**File backups are separate from database backups.** A `pg_dump` does not contain the bytes. Whatever B12 does for the database must be done again for the file store.

---

# 15. Development environment

**(proposed — documentation only. Do not run these yet.)**

## 15.1 Required software

| Software | Version | Notes |
|---|---|---|
| Node.js | 22 LTS *or* 24 LTS | **Pick one and match CI.** Local is 22.18.0; frontend CI pins 24. Use `.nvmrc` |
| PostgreSQL | 16 or 17 | match dev to prod |
| Docker Desktop | optional | already needed for `db:pull`; also the easiest way to run PostgreSQL |

## 15.2 PostgreSQL locally — B2 ✅ DONE

**Installed:** PostgreSQL **18.6**, native, on `localhost:5432`, database `todo_app`, user `postgres`. Verified connected from the backend (`npm run db:ping`).

Current state, read from the live server on 2026-09-15:

| Property | Value |
|---|---|
| Server | PostgreSQL 18.6 |
| Database | `todo_app` — **0 tables in `public`** (empty, as expected) |
| Encoding | `UTF8` ✅ |
| Collation / ctype | **`Russian_Russia.1251`** ⚠️ see §15.2b |
| Locale provider | `libc` (`c`) ⚠️ |
| Extensions | `plpgsql` only — no `pgcrypto` (**not needed** on 18.6), no `citext` |
| `todo_app_test` | **does not exist** — see §15.2c |

## 15.2b ⚠️ The local collation is not portable — decide before B3

`todo_app` was created with `LC_COLLATE = LC_CTYPE = Russian_Russia.1251` under the `libc` provider. The encoding is UTF-8, so **no data is at risk** — this is purely about *sort order*.

**Why it matters.** Collation decides how `ORDER BY` sorts text, and text indexes are built in collation order. Two concrete consequences:

1. **Dev and production would disagree.** A Linux company server has no `Russian_Russia.1251` locale. `spacesApi.getSpaces()` does `.order("title")` server-side, and `board_roster` sorts names — the same query would return a different order in the two environments.
2. **A dump restored onto the server warns or fails** on the missing locale, and an index built under one collation is not valid under another.

**Options, for a decision:**

| Option | Command | Trade-off |
|---|---|---|
| **A. `C` collation** | `LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0` | Fastest, perfectly reproducible everywhere. Sorts by byte, so `Z` < `a` and non-ASCII sorts by code point. **This app sorts in JavaScript almost everywhere**, so the practical impact is small |
| **B. ICU** | `LOCALE_PROVIDER icu ICU_LOCALE 'en-US' TEMPLATE template0` | Human-friendly ordering that is identical on every OS, because ICU ships with PostgreSQL rather than coming from the host. Best choice if server-side text sorting matters |
| **C. Leave as is** | — | Works locally today; defers a problem to B12 that is far cheaper to fix now, while the database is empty |

**Recommendation: B (ICU `en-US`)**, or A if simplicity is preferred.

**This requires dropping and recreating `todo_app`.** That is safe *right now* — the database has **0 tables** — and will stop being safe the moment B3 creates the schema. **Nothing has been dropped: this needs explicit confirmation.** §15.2d has the exact commands.

## 15.2c `todo_app_test` does not exist yet

The integration suite (B11) needs a second database it can truncate freely, and `TEST_DATABASE_URL` is not yet in `.env`.

**Not needed until B11**, so this does not block B3. It is listed here so it is not discovered late.

## 15.2d Manual steps — nothing here has been run

Run these in pgAdmin or `psql` as a superuser, **connected to `postgres`, not to `todo_app`**.

**If recreating for the collation (§15.2b, option B):**

```sql
-- destroys todo_app. Safe only while it has 0 tables. Confirm first.
DROP DATABASE todo_app;

CREATE DATABASE todo_app
  TEMPLATE template0
  ENCODING 'UTF8'
  LOCALE_PROVIDER icu
  ICU_LOCALE 'en-US';
```

**The test database, whenever it is wanted:**

```sql
CREATE DATABASE todo_app_test
  TEMPLATE template0
  ENCODING 'UTF8'
  LOCALE_PROVIDER icu
  ICU_LOCALE 'en-US';
```

then add to `backend/.env`:

```bash
TEST_DATABASE_URL=postgresql://postgres:<url-encoded-password>@localhost:5432/todo_app_test
```

**`citext`, only if S4 is adopted** — run inside `todo_app`:

```sql
CREATE EXTENSION IF NOT EXISTS citext;
```

`pgcrypto` is **not** required: `gen_random_uuid()` is in core from PostgreSQL 13.

## 15.3 Dependencies to add, by milestone

Nothing is installed now. Each arrives with the milestone that needs it.

| Milestone | Packages |
|---|---|
| **B3** | `prisma` (dev) · `@prisma/client` |
| **B4** | `zod` — `pg` is already installed |
| **B5** | `argon2` · `jsonwebtoken` · `cookie-parser` · `express-rate-limit` · `nodemailer` · `@types/*` |
| **B9** | `socket.io` |
| **B10** | `multer` · `@aws-sdk/client-s3` · `@types/multer` |
| **B11** | `vitest` · `supertest` · `@types/supertest` |
| later | `pino` · `pino-http` (replacing morgan) · `node-cron` |

## 15.4 Environment variables to add

`backend/.env` grows as milestones land. `.env.example` is updated in the same commit, every time.

```bash
# B2 — done. Percent-encode reserved characters in the password (@ -> %40).
DATABASE_URL=postgresql://postgres:p%40ssword@localhost:5432/todo_app

# B11 — not needed yet (see §15.2c)
TEST_DATABASE_URL=postgresql://postgres:p%40ssword@localhost:5432/todo_app_test

# B5
JWT_SECRET=<openssl rand -base64 48>
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_SECURE=false                # true in production, always
SMTP_HOST= / SMTP_PORT= / SMTP_USER= / SMTP_PASS= / MAIL_FROM=
APP_URL=http://localhost:5173      # for invite and reset links

# B10
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./uploads
MAX_UPLOAD_BYTES=26214400
```

Everything is parsed by `config/env.ts` and the process refuses to start if one is missing.

## 15.5 Daily workflow

```
Terminal 1   cd backend && npm run dev     # API on :4000  (PostgreSQL 18.6 runs as a Windows service)
Terminal 2   npm run dev                   # Vite on :5173

npm run db:ping     --prefix backend   # connection check
npm run db:migrate  --prefix backend   # prisma migrate deploy      (from B3)
npm run db:pull     --prefix backend   # prisma db pull && generate (from B3)
```

## 15.6 CI

`.github/workflows/ci.yml` gains a second job with a `postgres` service container. It should **run the migrations before the tests**, so the schema itself is exercised on every pull request:

```
npm ci --prefix backend
npm run lint --prefix backend
npm run build --prefix backend
npm run db:migrate --prefix backend      # prisma migrate deploy
npm test --prefix backend
```

The existing frontend job is unchanged.

---

# 16. Implementation milestones B0–B12

Format follows `docs/IMPLEMENTATION_PLAN.md`. Its rules apply, and two in particular:

> **Never start a milestone whose dependencies are not fully done.** "Mostly done" is not done.
> **A task that grows past ~3 hours is not one task.** Split it and record the new id in the same pull request.

Plus two specific to this migration:

> **The frontend keeps working at the end of every milestone.** B2–B7 add a backend; they do not touch `src/`.
> **No milestone installs a package it does not use.** §15.3 says which arrive when.

| ID | Milestone | Status |
|---|---|---|
| B0 | Supabase architecture audit | ✅ **Done** |
| B1 | Express foundation | ✅ **Done** |
| B2 | Local PostgreSQL setup | ✅ **Done** — PostgreSQL 18.6, `todo_app`, connected (§15.2). One open question: collation (§15.2b) |
| B3 | Fresh database schema | ⬜ **Next** |
| B4 | Database connection and data-access layer | ◑ **Partly done** — pool, `/health`, `db:ping` shipped. Prisma client + `withActor` outstanding |
| B5 | New authentication | ⬜ |
| B6 | Backend authorization replacing RLS | ⬜ |
| B7 | Core REST API modules | ⬜ |
| B8 | Frontend migration from Supabase to Express | ⬜ |
| B9 | Realtime using WebSocket / Socket.IO | ⬜ |
| B10 | Storage and attachments | ⬜ |
| B11 | Testing and integration verification | ⬜ |
| B12 | Production deployment to company server | ⬜ |

---

## B0 — Supabase architecture audit ✅ DONE

**Goal.** Understand the current database completely before replacing any of it.

**Why it exists.** Under a clean start there is no dump to diff against. The audit *is* the specification — if a rule is not written down here, it will not exist in the new system.

**Delivered.** `docs/SUPABASE_DATABASE_AUDIT.md` — 12 tables, every relationship and `ON DELETE` action, 22 CHECK constraints, 8 unique constraints, 24 indexes, 17 triggers (12 trigger functions), ~30 functions, ~30 RLS policies, the auth ↔ profiles relationship, both storage buckets, and the realtime publication.

**What it found that shapes everything after it.** Audit §8.4: roughly two-thirds of the queries in `src/services/` are deliberately incomplete because RLS finishes them. That list is the specification for B6 and the test plan for B11.

**Still open from it.** §13.5 (is `pg_cron` installed — now only relevant as "what schedules the activity prune") and §13.6 (email confirmation on or off — now a design choice, §21.8). §13.1, §13.3 and §13.4 are moot under clean start.

---

## B1 — Express foundation ✅ DONE

**Goal.** A running Express server with config, logging, error handling and a health check. No features.

**Why it exists.** Every later milestone assumes these exist. Building them alongside the first feature is how error handling ends up inconsistent.

**Delivered.** `backend/` with `src/config/env.ts`, `src/app.ts`, `src/server.ts`, `.env.example`, `tsconfig.json` (strict, NodeNext ESM, `noUnusedLocals`/`noUnusedParameters`), and `dev`/`build`/`start`/`typecheck` scripts. Express 5 + cors + dotenv + morgan.

**Verified.** Builds clean · `GET /health` → `{"status":"ok"}` · unknown route → JSON 404 · CORS preflight from `http://localhost:5173` returns the right headers · a bad `PORT` or `NODE_ENV` fails at startup naming the variable · `git diff` empty (frontend untouched).

**Deferred to later milestones.** Zod-based env parsing (B4) · `AppError` extracted to `lib/errors.ts` (B4) · pino replacing morgan (later) · the `/api/v1` router mount (B5).

---

## B2 — Local PostgreSQL setup ✅ DONE

**Goal.** A working local PostgreSQL with a dev database and a test database, and nothing else.

**Why it exists.** B3 cannot write a schema with nowhere to apply it. Separating "install the database" from "design the schema" keeps a Docker or path problem from being debugged at the same time as a constraint question.

**Prerequisites.** B1.

**Tasks.**

- **B2-01** — Choose Docker or a native install (§15.2). Record which, so everyone runs the same thing.
- **B2-02** — Create `todoapp_dev` and `todoapp_test`, plus the `todoapp` role.
- **B2-03** — Enable `pgcrypto`, and `citext` if S4 is adopted.
- **B2-04** — Confirm the connection from the host: `psql` (or `docker compose exec db psql`) returns a version.
- **B2-05** — Add `DATABASE_URL` and `TEST_DATABASE_URL` to `.env` and `.env.example`. **Do not read them in code yet** — that is B4.
- **B2-06** — If Docker: commit `backend/docker-compose.yml` and gitignore the volume.
- **B2-07** — Write down the versions: PostgreSQL major, Node major. Align Node with CI.

**Expected result.** Two empty databases, reachable from the host, with the extensions installed.

**Files affected.** `backend/.env`, `backend/.env.example`, optionally `backend/docker-compose.yml`. **No TypeScript.**

**Risks.** 🟢 Low. The usual Windows snags: a port already in use (hence 5433), and Docker Desktop not running.

**Verification.** ☐ `select version();` works against both databases ☐ `select * from pg_extension;` shows `pgcrypto` ☐ the app still builds and `/health` still answers ☐ no source file changed.

**Frontend changes.** None.

---

## B3 — Fresh database schema ✅ DONE

**Goal.** The complete schema, created in its final shape, provably matching the audit.

**Why it exists.** This is where the clean start is won or lost. §18.1 explains why.

**Prerequisites.** B2 (**including the locale question in §15.2b**). §21.1 and §21.4 are now closed; nothing else blocks.

**Tasks.**

- **B3-01** — Initialise Prisma (`prisma init`), point `datasource` at `DATABASE_URL`, and create `prisma/migrations/` (§8.7). **No custom runner** — `prisma migrate deploy` applies the SQL.
- **B3-02** — `0001_extensions/migration.sql` — `citext` only if S4 is adopted. **No `pgcrypto`** (PG 18.6 has `gen_random_uuid()` in core).
- **B3-03** — `0002_auth/migration.sql`: `users`, `sessions`, `password_reset_tokens`, `profiles` (§8.3).
- **B3-04** — `0003_boards/migration.sql`: `spaces`, `boards`, `board_members`, `board_invites` (with `token_hash`, S3).
- **B3-05** — `0004_work_items/migration.sql`: `columns`, `todos`, `sprints` — **including `UNIQUE (id, board_id)` on both `columns` and `todos`** (three composite FKs depend on them), **`position` on both** (§8.5b), and `todos.sprint_id` as **`ON DELETE SET NULL`**.
- **B3-06** — `0005_collaboration/migration.sql`: `comments`, `attachments` (**`size_bytes integer`**, §8.5b), `activities`, `notifications`.
- **B3-07** — `0006_functions_triggers/migration.sql`: all **12 trigger functions** and their **17 triggers**, with `auth.uid()` → `current_setting('app.actor_id', true)::uuid` in the six that need it. **Do not omit `add_owner_membership` / `boards_add_owner_membership`** — without it a new board has no owner membership and its own owner is locked out (audit §7.2b).
- **B3-08** — **The audit checklist.** Walk `SUPABASE_DATABASE_AUDIT.md` §4–§7 and tick off every table, column, constraint, index and trigger against `information_schema` / `pg_indexes` / `pg_trigger` on the new database. **Counts must match: 22 CHECKs, 8 uniques, 24 indexes, 17 triggers, 12 trigger functions.**
- **B3-09** — `prisma db pull` + `prisma generate`; commit `schema.prisma` with the generated-artifact header (§8.7). Expect CHECKs, partial indexes and triggers to be absent from it — that is correct.
- **B3-10** — `db/seed.ts`, containing every case in §8.6.
- **B3-11** — Tests: creating a board yields exactly one `board_members` row with `role='owner'` · a Subtask under a Subtask is rejected · two active sprints on one board are rejected · a todo pointing at another board's column is rejected · a comment whose `board_id` disagrees with its todo is rejected · inserting a todo assigns `board_key` and advances `boards.next_key` · a second insert after a delete does **not** reuse the key.

**Expected result.** A database that behaves identically to the current one, built from scratch, with the checklist as evidence.

**Files affected.** `backend/prisma/migrations/**`, `backend/prisma/schema.prisma` (generated), `backend/src/db/seed.ts`. **No application code.**

**Risks.** 🔴 **A rule silently lost in the retype.** There is no dump to diff — B3-08 is the only defence. 🔴 "Improving" something mid-retype; §4.4 is the closed list. 🟡 Forgetting the `UNIQUE (id, board_id)` constraints, which fail loudly later but confusingly. 🔴 Running `prisma migrate dev` even once — it would propose dropping every CHECK, trigger and partial index it cannot see (§8.7).

**Verification.** ☐ every audit item ticked, counts matching ☐ all B3-11 tests pass ☐ `select count(*) from pg_policies where schemaname='public'` returns 0 ☐ no function body contains `auth.uid()` ☐ seed runs clean on an empty database ☐ `prisma migrate deploy` run twice is a no-op ☐ `prisma migrate status` reports no drift ☐ `schema.prisma` is generated, not hand-written.

**Frontend changes.** None.

---

## B4 — Database connection and data-access layer ✅ DONE

**Goal.** The backend can talk to the database, with types, transactions and the actor session variable.

**Why it exists.** B5 onward all query. Deciding the query layer once, behind `*.repo.ts`, keeps §21.3 reversible.

**Prerequisites.** B3. The query layer is decided (Prisma, SQL-first — §8.7).

**Tasks.**

- **B4-01** — Install the query layer + `pg` + `zod`.
- **B4-02** — `db/client.ts`: pool/client singleton, sized ~10–20, with graceful shutdown wired into `server.ts`.
- **B4-03** — `db/withActor.ts`: open a transaction, `select set_config('app.actor_id', $1, true)`, run the callback (§8.5). **Never `SET LOCAL … = $1`** — see §8.5.
- **B4-04** — If Prisma: `prisma db pull` + `generate`, with a header on `schema.prisma` saying it is derived and must not be hand-edited. **Check the composite FK relations on `todos`, `comments` and `attachments` specifically** — introspection may model them unexpectedly.
- **B4-05** — Upgrade `config/env.ts` to Zod and add `DATABASE_URL`.
- **B4-06** — Extract `AppError` + the error middleware from `app.ts` into `lib/errors.ts` and `middleware/errorHandler.ts`. Map expected PostgreSQL SQLSTATEs: `23505` → 409, `23503` → 409/404, `23514` → 400. Everything else is a 500 with the detail logged, never sent.
- **B4-07** — Extend `/health` to run `select 1` — it now means "the process is up *and* the database answers".
- **B4-08** — Mount the `/api/v1` router.
- **B4-09** — Prove `withActor` works: write a row through it, assert the resulting `activities` row carries the right `actor_id`.

**Expected result.** Any later module can open a transaction, write as a known actor, and have errors surface as correct HTTP statuses.

**Files affected.** `backend/src/db/**`, `config/env.ts`, `lib/errors.ts`, `middleware/errorHandler.ts`, `app.ts`.

**Risks.** 🟡 Connection pool exhaustion from transactions that are opened and never closed — wrap `withActor` so a throw always releases. 🟡 If Prisma: introspection quirks around the composite FKs.

**Verification.** ☑ `/health` reports database reachability ☑ B4-09's activity row has the right actor ☑ a unique violation returns 409, not 500 ☑ the actor setting does not leak between transactions ☑ `/api/v1` mounted ☑ SQLSTATE map covers 23505/23503/23514/23502/22P02/42501 — `npm run db:verify-actor` (20 checks) and `npm run db:verify-errors` (14 checks) pin all of it.

☐ *pool closes on SIGTERM* is the one item not machine-verified: Git Bash on Windows cannot deliver the signal to a Node process. The shutdown order (`prisma.$disconnect()` then `closePool()`) is exercised by every script's `finally`, and SIGTERM works normally on the Linux target (B12).

**Frontend changes.** None.

---

## B5 — New authentication ⬜ NEXT

**Goal.** Register, login, refresh, logout, `/me`, password reset, username availability.

**Why it exists.** Every other endpoint needs `req.actor`. Nothing else can be built or tested first.

**Prerequisites.** B4. The §21.5 (cookie/session shape), §21.6 (origin), §21.7 (password policy) and §21.8 (email) decisions.

**Tasks.**

- **B5-01** — Install `argon2`, `jsonwebtoken`, `cookie-parser`, `express-rate-limit`.
- **B5-02** — `lib/password.ts` — argon2id hash and verify. **One format. No bcrypt path.**
- **B5-03** — `lib/tokens.ts` — access JWT sign/verify; refresh mint, hash, rotate, revoke-family.
- **B5-04** — `POST /auth/register` — the full provisioning transaction (§9.3), idempotent, with `available_username`'s seed-and-suffix resolution.
- **B5-05** — `POST /auth/login` (§9.4) — identifier resolution, **constant-time failure, one message for every failure mode**.
- **B5-06** — `POST /auth/refresh` with rotation and reuse detection; `POST /auth/logout`.
- **B5-07** — `middleware/requireAuth.ts` → `req.actor`.
- **B5-08** — `GET /auth/me`.
- **B5-09** — Password reset: forgot (always 200, rate-limited) + reset (revokes all sessions).
- **B5-10** — `GET /auth/username-available`, rate-limited.
- **B5-11** — Email: `nodemailer` behind a `MailDriver` interface with a console driver for development.
- **B5-12** — Rate limits on `/auth/*`, per IP and per account.
- **B5-13** — Tests: wrong password and unknown user produce **identical** status, body and roughly identical timing · a rotated refresh token is rejected and revokes its family · reset revokes sessions · registering twice with one email fails cleanly · registration is idempotent for provisioning · a new account gets exactly one board with four columns.

**Expected result.** A user can be created and authenticated end to end with curl.

**Files affected.** `backend/src/modules/auth/**`, `lib/password.ts`, `lib/tokens.ts`, `middleware/requireAuth.ts`, `modules/users/**` (provisioning).

**Risks.** 🔴 The highest-risk milestone in the plan — mistakes here are silent. 🔴 The identical-failure-response requirement is easy to break with a helpful error message. 🟡 Cookie configuration depends on §21.6; get it wrong and login works locally and fails in production.

**Verification.** ☐ register → login → `/me` → refresh → logout by curl ☐ wrong password and unknown user indistinguishable ☐ refresh reuse revokes the family ☐ cookie is HttpOnly + SameSite (+ Secure in production) ☐ rate limit trips ☐ **no password or token appears in any log line**.

**Frontend changes.** None yet.

---

## B6 — Backend authorization replacing RLS

**Goal.** The permission model, reproduced in Express, with tests.

**Why it exists.** ~30 RLS policies are about to stop existing. Without an equivalent, this migration is a downgrade in safety dressed up as an upgrade in architecture.

**Prerequisites.** B5.

**Tasks.**

- **B6-01** — Copy `src/services/members/permissions.ts` to `backend/src/lib/permissions.ts` **with its test file**, plus a parity test across the two packages.
- **B6-02** — `boards.repo.accessibleBoardIds(actor)` — the one function (§10.7). Document it in the file as the swap point.
- **B6-03** — `members.repo.roleOf(boardId, userId)`.
- **B6-04** — `middleware/boardAccess.ts` — resolves `:boardId`, or derives it from `:todoId` / `:commentId` / `:attachmentId` / `:sprintId` through one shared resolver. **404, not 403,** for a non-member.
- **B6-05** — `middleware/requireRole.ts`.
- **B6-06** — `middleware/validate.ts` (Zod for body / params / query).
- **B6-07** — Establish the repository convention: **every board-scoped repo function takes `boardId` first, as a required parameter** (§10.3). Write it down where it will be read.
- **B6-08** — Resolve the username-rule duplication: the rules currently exist in SQL, in `utils/username.ts`, and will exist in the backend. **Keep two at most; record which and why.**
- **B6-09** — Tests for the middleware in isolation: non-member → 404 · viewer on an editor route → 403 · a valid member gets `req.board.role` · a todo id from another board → 404.

**Expected result.** Any later route reads `requireAuth, boardAccess, requireRole("editor"), validate(schema), handler`.

**Files affected.** `backend/src/middleware/**`, `lib/permissions.ts`, `modules/boards/boards.repo.ts`, `modules/members/members.repo.ts`.

**Risks.** 🔴 If `boardAccess` is wrong, every endpoint after it is wrong. 🟡 The 404-not-403 rule is counter-intuitive and will be "fixed" by someone unless the reason is in a comment.

**Verification.** ☐ permissions parity test green in both packages ☐ all four B6-09 tests pass ☐ non-membership is indistinguishable from non-existence ☐ **`accessibleBoardIds` appears exactly once in the codebase**.

**Frontend changes.** None.

---

## B7 — Core REST API modules

**Goal.** Every endpoint in §11, with the RPC rules ported faithfully.

**Why it exists.** This is the bulk of the backend. It is one milestone because the modules share one shape; it will be many pull requests.

**Prerequisites.** B6.

**Sub-phases**, in dependency order:

- **B7-A — Spaces, boards, members, invites.** Port `set_member_role`, `add_board_member`, `remove_board_member`, `leave_board`, `board_roster`, `create_invite`, `accept_invite`, `decline_invite`, `revoke_invite`, `search_board_invitees` — **each in the same order of checks, with the same messages** (§10.6).
  *Tests:* two concurrent accepts of one invite admit exactly one · an admin cannot invite an admin · `'owner'` is refused everywhere it can be requested · expiry clamps to 1–30 days · a revoked token and a nonexistent token behave identically · a repeat accept by an existing member is a clean no-op.

- **B7-B — Columns and todos.** Including `/move` (one row, rank taken from the client not recomputed), delete-with-rehome in one transaction, and `/rebalance`. Copy `src/utils/rank.ts` to `lib/rank.ts` with its tests and a parity test.
  *Tests:* **PATCH a todo id that does not exist yet → the row is created** (the optimistic-update invariant) · create assigns `board_key` · delete-then-create does not reuse the key · a move writes exactly one row · a hierarchy violation surfaces as a clean 400, not a 500 · the response field list matches `TODO_FIELDS` in `types/data.ts`.

- **B7-C — Sprints.** Port `start_sprint` and `complete_sprint`. **`state` is not patchable.** Confirm the server's first-todo-column choice matches `firstTodoColumn()` in `services/todos/backlog.ts` — the client comment says they are deliberately kept in sync.
  *Tests:* start assigns exactly the items lacking a column · complete rehomes exactly the unfinished ones · a second active sprint is refused · deleting a sprint nulls `sprint_id` without deleting work · a Subtask carrying its own `sprint_id` is refused.

- **B7-D — Comments, activities, notifications.**
  *Tests:* **`mark-all-read` affects only the caller** (write this one first — it is §18.2's specific bug) · user A cannot read or mark user B's notifications · a comment author can edit, another editor cannot, an admin can delete · activity is written for a move, a retitle and an assignment, and **not** for a rank-only change · `activities` has no write endpoint.

- **B7-E — The feed.** `GET /me/feed` — must call `accessibleBoardIds` and filter **before** `LIMIT`.

**Expected result.** The whole API exists and is exercisable by curl and by integration tests, with no frontend involved.

**Files affected.** `backend/src/modules/**`, `lib/rank.ts`.

**Risks.** 🔴 The rank comparisons in the membership and invite rules are exactly where an off-by-one becomes a privilege escalation. **Port them literally; do not simplify.** 🔴 Breaking the upsert contract breaks optimistic updates in a way that looks like a UI bug. 🟡 Forgetting the row lock in `accept_invite` creates a race that only appears under load.

**Verification.** ☐ every check in `create_invite` and `set_member_role` has a test ☐ concurrent-accept test passes ☐ upsert-PATCH test passes ☐ rank parity test green ☐ owner immutability still fires (try to promote a second owner directly in SQL) ☐ the feed is board-scoped before `LIMIT`.

**Frontend changes.** None.

---

## B8 — Frontend migration from Supabase to Express

**Goal.** Point the React app at the new backend, with the UI unchanged.

**Why it exists.** This is what the whole project is for, and where a shortcut is most tempting and most costly.

**Prerequisites.** B5, B6, B7 **all complete**. (B9 and B10 can land after — see §17.)

**Tasks.**

- **B8-01** — `src/services/api/client.ts` (§12.3), including the shared in-flight refresh promise and `AbortSignal` pass-through.
- **B8-02** — The **global** `VITE_API_MODE` flag (§12.2) — all modules at once, never half and half.
- **B8-03 … B8-13** — Rewrite the 19 files **in the order in §12.6**, auth first. One commit per module; one branch for the lot.
- **B8-14** — Cleanup: delete `services/api/supabase.ts`, remove `@supabase/supabase-js`, remove the `VITE_SUPABASE_*` stubs from `vitest.config.ts`, **remove `VITE_API_MODE` and every Supabase branch**.
- **B8-15** — Simplify `retryPolicy.ts` for real HTTP statuses, updating its tests.
- **B8-16** — Full manual pass: every view (Summary, Board, List, Calendar, Timeline, Backlog) · drag in Board and Backlog · task modal with comments and attachments · invite and accept · member role change · sprint start and complete · notifications · profile and avatar · language switch · dark mode.

**Expected result.** The app runs entirely on the new backend, with no Supabase dependency and no visible change.

**Files affected.** 19 existing files, 1 new, plus `package.json`, `.env`, `vitest.config.ts`.

**Risks.** 🔴 Attempting a mixed state — it cannot work (§12.2). 🔴 Leaving the dual-mode flag in "for now". 🟡 Losing `AbortSignal` handling. 🟡 A signature change rippling further than expected — `tsc -b` catches it, so build after every module.

**Verification.** ☐ `npm run build` and `npm test` green ☐ **zero references to `supabase` under `src/`** ☐ B8-16's checklist executed and recorded ☐ optimistic drag still feels instant and still rolls back on a forced server error.

**Frontend changes.** **Yes — this milestone is the frontend changes.**

---

## B9 — Realtime using WebSocket / Socket.IO

**Goal.** Live board updates and presence, replacing Supabase Realtime.

**Why it exists.** Multi-client editing is a shipped feature; losing it would be a visible regression.

**Prerequisites.** B7. Can be built before or after B8 — but the client half needs B8's `AuthProvider`.

**Tasks.**

- **B9-01** — `realtime/io.ts`: attach to the HTTP server; JWT verification in the handshake.
- **B9-02** — `realtime/rooms.ts`: `board:join` / `board:leave` with the **membership re-check on join**, and forced eviction when a member is removed.
- **B9-03** — `realtime/presence.ts`: in-memory per-room sets keyed by user id (one user, many tabs).
- **B9-04** — `realtime/emit.ts`: typed emitters producing exactly `{ eventType, new, old }` (§13.4). DELETE sends `{ old: { id } }` only.
- **B9-05** — Wire emits into the todos, columns and comments services — **after commit, never inside the transaction**.
- **B9-06** — `board:invalidate` from every multi-write service: column delete, `start_sprint`, `complete_sprint`, board delete, member changes. §13.1's table is the checklist.
- **B9-07** — Per-user rooms + `notification:new`.
- **B9-08** — Rewrite `useBoardRealtime` against Socket.IO, **signature unchanged**. **`events.ts` and its tests must not change.**
- **B9-09** — Tests: two clients, one board, a move in A reaches B · a non-member's join is refused · a removed member is evicted · a rolled-back transaction emits nothing.

**Expected result.** Realtime parity with today, plus live notifications.

**Files affected.** `backend/src/realtime/**`, an emit call in each writing service, `src/services/realtime/useBoardRealtime.ts`.

**Risks.** 🟡 Emitting inside the transaction. 🟡 Forgetting `board:invalidate` on a bulk path — the board then looks stale on other clients and it is hard to reproduce on purpose. 🟡 Editing `events.ts` instead of fixing the server payload.

**Verification.** ☐ B9-09 passes ☐ every service writing more than one row emits something ☐ payloads match `RowChange<T>` exactly ☐ presence survives a reconnect ☐ `events.ts` unchanged.

**Frontend changes.** Yes — `useBoardRealtime` only.

---

## B10 — Storage and attachments

**Goal.** Upload, download, preview and delete, with the security properties intact.

**Why it exists.** It is the only module with bytes as well as rows, and it has two ordering rules that are easy to get backwards.

**Prerequisites.** B6, B7-B. Can land before or after B8.

**Tasks.**

- **B10-01** — `StorageDriver` interface + `localDriver`, with the path-traversal guard.
- **B10-02** — `s3Driver` against MinIO locally, so the production path is exercised in development — unless §21.9 settles on local disk permanently.
- **B10-03** — Port `fileMeta.ts` — key construction and `previewKind` — **with its tests**.
- **B10-04** — `POST /todos/:todoId/attachments`: multer, ≤ 25 MB, `requireRole("editor")`, server-minted id, **object then row**, with object cleanup if the insert fails.
- **B10-05** — `GET /attachments/:id/content` — `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.
- **B10-06** — `GET /attachments/:id/preview` — inline, **gated by `previewKind`**, 400 otherwise.
- **B10-07** — Batch preview URLs, preserving `signedPreviewUrls`'s `Record<path, url>` return shape.
- **B10-08** — `DELETE /attachments/:id` — `canDeleteAttachment`, **object then row**.
- **B10-09** — `POST /users/me/avatar` — 2 MB, MIME allow-list **enforced by the API**, fixed key, overwrite.
- **B10-10** — Tests: a viewer cannot upload but can download · a non-member gets 404 on both · an uploaded `.html` downloads with `Content-Disposition: attachment` and **cannot** be fetched from `/preview` · deleting removes the object before the row · a failed row insert leaves no object · `..` in any derived path is rejected.

**Expected result.** Files work end to end, with today's security properties reproduced **explicitly** rather than inherited from bucket configuration.

**Files affected.** `backend/src/modules/attachments/**`, `storage/**`, `modules/users/avatar*`.

**Risks.** 🔴 An inline-served `.html` is stored XSS. B10-10's third test is the guard. 🟡 Reversing the object/row order creates invisible orphans. 🟡 Forgetting that the bucket used to enforce the avatar MIME list and the size caps — **the API must now do both**.

**Verification.** ☐ B10-10 passes ☐ `previewKind` tests ported and green ☐ local and S3 drivers pass the same suite ☐ size limits enforced at the API *and* the proxy.

**Frontend changes.** Yes — `attachmentsApi.ts` and `uploadAvatars.ts` (part of B8's file list).

---

## B11 — Testing and integration verification

**Goal.** Prove the permission model is intact and the app behaves identically.

**Why it exists.** ~30 database-enforced rules became TypeScript. Without an equivalent test suite, that is a downgrade in safety. **Under a clean start there is no data-parity check to fall back on** — this is the only verification there is.

**Prerequisites.** B8, B9, B10.

**Tasks.**

- **B11-01** — **The role-matrix suite.** Port `scripts/verify-m3-16-role-matrix.sql` to HTTP integration tests: for each of viewer / editor / admin / owner / non-member, assert the expected status on every endpoint. **The single most valuable test file in the project.**
- **B11-02** — A test for **every row of audit §8.4** — the queries that were RLS-scoped and are now repo-scoped.
- **B11-03** — Port `verify-m3-15-owner-immutability.sql` and `verify-m4-invites.sql` the same way.
- **B11-04** — Re-run B3-08's audit checklist against the database as it now stands, in case a later migration weakened something.
- **B11-05** — Security review: rate limits · cookie flags · CORS · helmet · no secrets in logs · constant-time login failure.
- **B11-06** — Load sanity check on seeded data: ~200 users, ~50 boards, a board with ~2000 todos. Time `GET /boards/:id/todos`, `GET /boards`, and the feed.
- **B11-07** — `EXPLAIN ANALYZE` the ten hottest queries; confirm each uses an index. **Add indexes only where a measurement says so.**
- **B11-08** — Realtime verification (§13.7), as the successor to `docs/REALTIME_VERIFICATION.md`.
- **B11-09** — Full functional comparison against the Supabase version, feature by feature, using B8-16's checklist.
- **B11-10** — Add both suites to CI as required checks.

**Expected result.** Evidence that the new system enforces what the old one enforced.

**Files affected.** `backend/tests/**`, `.github/workflows/ci.yml`, a new realtime verification doc.

**Risks.** 🔴 Treating this as optional because it produces no feature. It is the milestone that converts "it works on my machine" into "we can put 200 people on it". 🟡 A load check on data too small to reveal a missing index.

**Verification.** ☐ role matrix green for all five actor kinds ☐ every audit §8.4 row has a passing test ☐ audit checklist re-run clean ☐ no unindexed sequential scan in the hot ten ☐ realtime checklist executed.

**Frontend changes.** None beyond test fixes.

---

## B12 — Production deployment to company server

**Goal.** Run it on the company's own hardware, and be able to recover it.

**Why it exists.** Supabase provided hosting, TLS, pooling and backups. All four are now ours.

**Prerequisites.** B11.

**Tasks.**

- **B12-01** — Provision PostgreSQL on the server. **Automated backups from day one**, plus point-in-time recovery if the setup allows. The Supabase project never had PITR — do not carry that forward.
- **B12-02** — Dockerise the API: one image, env-driven.
- **B12-03** — Reverse proxy with TLS, a body-size limit matching `MAX_UPLOAD_BYTES`, and **WebSocket upgrade support**.
- **B12-04** — File storage: a backed-up directory (local driver) or an S3-compatible service. **Whatever it is, it needs its own backup — a database dump does not contain the bytes.**
- **B12-05** — Serve the built frontend, and set its production `VITE_API_URL`. Confirm the CORS and cookie configuration matches §21.6's answer.
- **B12-06** — Monitoring: uptime check on `/health`, error tracking, log retention.
- **B12-07** — Deploy pipeline: CI green → build image → migrate → deploy → smoke test.
- **B12-08** — **Verify a restore** from a real backup into a scratch database. Schedule it quarterly, not once.
- **B12-09** — First real users: create accounts, exercise the app, watch the logs.
- **B12-10** — Decommission Supabase **only after** the new system has run cleanly for an agreed period.

**Expected result.** Production on company hardware, with backups that have been restored at least once.

**Files affected.** `backend/Dockerfile`, deployment configuration, a runbook.

**Risks.** 🔴 An unverified backup. 🟡 **WebSocket upgrade not configured on the proxy** — realtime silently degrades and nobody notices for weeks. 🟡 File storage on a server volume with no backup. 🟡 Decommissioning Supabase before anyone has really used the new system.

**Verification.** ☐ restore tested from a real backup ☐ TLS valid ☐ **WebSocket upgrade confirmed in production — check the transport, not just that it works** ☐ file storage backed up ☐ monitoring alerts somewhere a human looks ☐ smoke test passes post-deploy.

**Frontend changes.** Environment variables only.

---

# 17. Updated Implementation Order

## 17.1 The chain

```
B0  Audit                    ✅ done
B1  Express foundation       ✅ done
B2  Local PostgreSQL         ⬜ NEXT
B3  Fresh schema
B4  Connection + data access
B5  Authentication
B6  Authorization
B7  REST API modules  ──┬── B7-A boards/members/invites
                        ├── B7-B columns/todos
                        ├── B7-C sprints
                        ├── B7-D comments/activity/notifications
                        └── B7-E feed
     │
     ├──────────────► B9  Realtime (server half)     ─┐
     ├──────────────► B10 Storage                     ├─► can proceed in parallel
     └──────────────► B8  Frontend migration         ─┘   after B7
                              │
                              ▼
                          B11 Testing
                              │
                              ▼
                          B12 Deployment
```

## 17.2 Dependencies, stated plainly

| Milestone | Cannot start until | Because |
|---|---|---|
| B3 | B2 | a schema needs somewhere to be applied |
| B4 | B3 | there is nothing to connect to |
| B5 | B4 | needs `users`, `sessions`, and transactions |
| B6 | B5 | `boardAccess` needs `req.actor` |
| B7 | B6 | every route needs `requireRole` |
| B8 | B5 + B6 + **B7 complete** | a partial API means a broken app — mixed state is impossible (§12.2) |
| B9 (client half) | B8 | `useBoardRealtime` needs the new `AuthProvider` |
| B11 | B8, B9, B10 | the matrix is tested over HTTP |
| B12 | B11 | — |

**B7-A through B7-E are independent of each other** once B7-A lands (everything needs a board to hang off). **B9 and B10 server halves can be built in parallel with B8** if more than one person is working.

## 17.3 What changed from the old numbering

| Old | New | Why |
|---|---|---|
| B0 Planning (decisions + password check + backup) | **B0 Audit** — done | the password check and the backup were data-migration tasks |
| B1 Foundation | **B1** — done, unchanged | |
| B2 Schema & Prisma | **split: B2 PostgreSQL, B3 schema, B4 data access** | installing a database, designing a schema and choosing a query layer are three different problems |
| B3 Auth | **B5** | |
| B4 Users & Permissions | **B6** (permissions) + folded into B5 (users) | |
| B5–B9 (five feature milestones) | **B7, one milestone with five sub-phases** | they share one shape; splitting them added ceremony, not clarity |
| B10 Realtime | **B9** | |
| B11 Frontend | **B8** — and **auth moves first within it** | §12.2 |
| B12 Testing & Hardening | **B11** — **no cutover rehearsal** | there is no data to cut over |
| B13 Deployment & Backups | **B12** — company server | |
| B14 Management foundation | **removed from the roadmap** | it was always post-migration. §10.7 keeps the door open; the work is a separate plan |

## 17.4 What should NOT be done yet

| Not now | When |
|---|---|
| Installing any package | with the milestone that uses it (§15.3) |
| Writing SQL | B3, after §21.1 and §21.4 are decided |
| Touching `src/` | B8 |
| — | *(query layer decided: Prisma, SQL-first — §8.7)* |
| Organizations, teams, Director/Superadmin roles | a separate plan. §10.7 only keeps them cheap to add |
| Redis, a job queue, a second API instance | when a measurement demands it |
| Server-side Summary / Timeline / Calendar endpoints | when a report must span more boards than a browser can fetch |
| Renaming `todos`, or camelCasing the API | never (§4.4) |
| Turning off Supabase | B12-10, after the new system has carried real use |

## 17.5 Rough sizing

Not a schedule — a relative shape, for one developer who is also learning.

| Milestone | Size | Note |
|---|---|---|
| B2 | XS | install and create two databases |
| B3 | **L** | the checklist is the work, not the typing |
| B4 | M | |
| B5 | **L** | the hardest correctness work in the plan |
| B6 | M | small code, highest leverage |
| B7 | **XL** | five sub-phases; the bulk of the backend |
| B8 | **L** | 19 files, many commits, one branch |
| B9 | M | |
| B10 | M | |
| B11 | **L** | produces no feature, and is the point |
| B12 | M | mostly infrastructure |

The two most commonly underestimated are **B3** ("it's just a schema copy" — until the checklist finds a missing constraint) and **B11** (because it ships nothing visible).

---

# 18. Risks and common mistakes

Ordered by expected damage. Each names the specific form the risk takes **in this repository**, not the generic version.

## 18.1 🔴 Losing a rule in the retype — the clean start's signature risk

**The risk.** The new schema is weaker than the old one, and nothing says so.

**Why clean start makes this worse, not better.** The previous plan would have restored a dump and run parity queries. A dropped CHECK constraint or a missing partial index would have failed loudly. **Now there is nothing to compare against.** The system will work fine on seed data and fail months later on real data, as corruption rather than as an error.

**The specific forms:**
- forgetting `UNIQUE (id, board_id)` on `columns` or `todos` — three composite FKs depend on them
- writing `activities_event_valid` as two independent CHECKs instead of one over the pair
- creating `sprints_one_active_per_board` as a plain unique index instead of a partial one, which would forbid a board ever having two sprints
- an `ON DELETE` action typed as `CASCADE` where the audit says `SET NULL` — `todos.sprint_id` is the dangerous one: cascade there would **delete the work when a sprint is deleted**
- omitting the `upsert` guard in `assign_todo_board_key`, so a whole-column upsert burns a key per card per drag

**Mitigations.** B3-08's audit checklist, with **count assertions** (22 CHECKs, 8 uniques, 24 indexes, 17 triggers, 12 trigger functions). B3-10's behavioural tests. §4.3 as the reviewer's checklist. P1: every object traceable to an audit section.

**The tell that it is going wrong:** a B3 pull request that does not reference audit section numbers.

## 18.2 🔴 Incorrect permission migration

**The risk.** ~30 RLS policies become TypeScript. A missed check is a silent data leak, and unlike a crash, nothing reports it.

**The specific form here.** Audit §8.4. `markAllNotificationsRead` has no filter but `read_at is null`. `fetchRecentTodos` has no board filter. `fetchTodosByIds` takes ids and nothing else. `profileApi.updateProfile` takes the id from the client.

Get the first one wrong and one request marks **every employee's** notifications read.

**Mitigations.** (1) Every board-scoped repo function takes `boardId` first — a compile error, not a review item. (2) `permissions.ts` copied wholesale with its tests. (3) B11-01's role-matrix suite, ported from the 63 KB script that already exists. (4) 404-not-403 so ids are not existence oracles.

**The tell:** a repo function whose signature is `findById(id: string)`.

## 18.3 🔴 Authentication mistakes

**The risk.** Silent, total, often invisible until exploited.

**The specific forms.** Tokens in `localStorage` (we are fixing that — do not re-introduce it). No refresh rotation. Storing refresh or reset tokens in plaintext. A login that reveals whether an account exists, by message *or* by timing. No rate limit on `/auth/login` or `/auth/username-available`. Missing `Secure`/`HttpOnly`. Not revoking sessions on password change.

**Clean start adds one of its own:** with no legacy hashes to support, there is no reason for `lib/password.ts` to contain a bcrypt path. **If one appears, something is wrong.**

**Mitigations.** §9.6's list is non-negotiable. B5-13's identical-failure test. B11-05's review. Do not invent crypto — `argon2`, `jsonwebtoken` and `crypto.randomBytes` are the whole toolkit.

## 18.4 🔴 Breaking the existing frontend

**The specific forms:**
- **Rejecting client-minted ids.** Five tables take their id from the browser. Reject them and optimistic updates break everywhere at once.
- **Not upserting on PATCH.** `updateTodo` is called on cards whose insert may still be in flight; a 404 there looks like "the UI didn't save".
- **Recomputing the rank server-side on a move.** The sender already chose it; recomputing puts the card somewhere else on every client.
- **Changing field names to camelCase.** Every component reads `board_id`.
- **Changing the `TODO_LIST_FIELDS` set.** `todoApi.test.ts` already pins it against `types/data.ts`.
- **Dropping `AbortSignal`.** A cancelled query's late response overwrites an optimistic patch.

**Mitigations.** Treat `*Api.ts` signatures as a contract. B7-B's upsert test. `npm run build` after every module. B8-16's manual pass.

## 18.5 🟡 Attempting a mixed state during B8

**The risk.** Someone migrates `todoApi` first, keeps Supabase auth, and spends a day debugging 404s.

**Why.** The two databases share no ids and no users. A Supabase `user.id` names nobody in the new PostgreSQL; a Supabase `board_id` names no board. Nothing works.

**Mitigations.** Auth first (§12.6). A **global** `VITE_API_MODE`, never per-module. Say it out loud in the B8 branch description.

## 18.6 🟡 Over-simplifying because the database is fresh

**The risk.** "We are retyping this anyway" becomes "let's improve it", and a rule that took a production incident to learn gets dropped as arbitrary.

**The specific temptations.** Merging `column_id` and `sprint_id` into one "is this on the board" flag — **that exact change emptied every board once**. Dropping the `board_key` trigger for an application counter. Re-implementing the hierarchy rules in TypeScript "where they can be tested". Making `estimate` default to 0. Tidying `comments.author_id`'s cascade and `attachments.uploader_id`'s set-null into agreement.

**Mitigations.** §4.4 is a **closed** list. §4.3 is the list of things that look arbitrary and are not. Anything outside both is out of scope.

## 18.7 🟡 Realtime coverage silently shrinking

**The risk.** Replication broadcast everything; service emits broadcast only what someone remembered.

**The specific paths that currently broadcast for free:** `delete_column`'s rehome, `start_sprint`'s bulk assignment, `complete_sprint`'s rehome, cascades from a todo delete. §13.1's table is the checklist.

**Mitigations.** Any service writing more than one row emits `board:invalidate`. Emit **after** commit. Keep payloads identical to `events.ts`'s `RowChange<T>` so that file and its tests never change.

**And the opposite failure:** over-building it. Redis, presence in a table, a custom protocol. At 200 users, one process with in-memory rooms is correct.

## 18.8 🟡 Seed data that hides problems

**The risk.** A seed with three todos and one user passes every test, and the first real board breaks.

**Mitigations.** P7 and §8.6's list. Every item there exists because it exercises a specific rule.

## 18.9 🟡 Missing indexes

**The specific form.** The 24 existing indexes must survive B3 — verify by **count**, not by eye. The genuinely *new* slow queries are the ones RLS used to imply: `GET /boards` joining `board_members`, and `/me/feed` filtering `board_id = ANY($ids)`. Neither existed as an explicit query before.

**Mitigations.** B11-06's seeded load check; B11-07's `EXPLAIN ANALYZE`. Add indexes when a plan shows a sequential scan, not speculatively.

## 18.10 🟡 Business logic leaking into routes

**The specific form here.** The PL/pgSQL functions are currently the *only* implementation of their rules, and their bodies carry ordering that matters. `create_invite` validates the role **before** any rank comparison, because `null <= 3` is NULL and an `if` on NULL does not branch — turning a deny into an allow. A controller that does `if (role !== "admin") return res.status(403)` has already lost the structure.

**Mitigations.** §7's layer table. A service function is plain async TypeScript with plain arguments; a controller never contains a rule.

## 18.11 🟡 No backups on the company server

**The risk.** Supabase did this invisibly. On our own hardware, nobody does it until someone decides to.

**The specific forms.** No automated database backup. A backup that has never been restored. **File storage with no backup at all** — a `pg_dump` does not contain the bytes, and under clean start the attachments in that store are the *only* copy, because nothing was migrated from anywhere.

**Mitigations.** B12-01, B12-04, B12-08. Test the restore quarterly.

## 18.12 🟢 Smaller traps worth naming

- Losing the **404-not-403** property, turning every id into an existence oracle.
- **Forgetting `set_config('app.actor_id', …)`**, leaving `activities.actor_id` null for every write. The feed still renders, so nobody notices until someone asks who moved a card.
- Letting `rank.ts` or `permissions.ts` drift between packages — the parity tests exist for this.
- **Serving attachments inline.** No MIME allow-list; disposition is the whole defence.
- Node version skew between local (22.18.0) and CI (24).
- **WebSocket upgrade missing on the reverse proxy** — realtime degrades silently.
- Leaving `VITE_API_MODE` in the codebase after B8.
- Turning off Supabase before anyone has really used the new system.

---

# 19. Final recommended stack

| Concern | Choice | Why, for *this* project |
|---|---|---|
| Runtime | **Node.js 22 LTS** (pin `.nvmrc`; align CI) | one language across the stack — `rank.ts` and `permissions.ts` are literally shared |
| Framework | **Express 5** ✅ installed | most documented; async errors fixed; performance a non-issue here; the owner must be able to read it |
| Language | **TypeScript**, strict ✅ configured | the frontend's safety comes from `tsc -b`; the backend earns its the same way |
| Database | **PostgreSQL 18.6**, fresh | same engine, same behaviour, no inherited data |
| Migrations | **hand-written SQL** + a ~40-line runner | ~5 files in final shape; no schema language expresses the partial unique index, the tuple CHECK or the composite FKs |
| Query layer | **Prisma (SQL-first, introspected)** | typed queries without letting an ORM own a schema it cannot express. Contained to `*.repo.ts` |
| Password hashing | **argon2id**, and nothing else | no legacy format exists — this is a clean-start dividend |
| Auth | **access JWT (15 min, in memory) + rotating opaque refresh token in an httpOnly cookie** | strictly better than today's `localStorage` JWT; rotation gives theft detection |
| Validation | **Zod** | the schema *is* the DTO type and the documentation |
| Errors | one `AppError` + one terminal middleware ✅ stubbed | `retryPolicy.ts` and the `MutationCache` toast keep working |
| Logging | **morgan** ✅ now → **pino** when structured logs matter | |
| Config | **Zod-parsed `env.ts`, throws at boot** ✅ hand-rolled now | the discipline `services/api/supabase.ts` already applies, moved server-side |
| Authorization | **Express middleware**, RLS enabled but unpolicied as a backstop | §10.2 |
| Realtime | **Socket.IO**, in-memory rooms, no Redis | rooms map onto `board:${boardId}`; reconnection and heartbeats are free |
| File storage | **`StorageDriver`**: local in dev; local-or-S3 in production (§21.9) | a company server makes local disk legitimate — with its own backup |
| Uploads | **multer**, memory storage, 25 MB cap | matches today's bucket limit |
| Email | **nodemailer** + a driver interface (console in dev) | invites and password reset need real mail |
| Background jobs | **none**; `node-cron` for the activity prune | one weekly deletion does not justify a broker |
| Testing | **Vitest + supertest** against a real throwaway database | matches the frontend's runner; the role matrix needs integration tests |
| Security baseline | helmet · CORS (exact origin, credentials) · `express-rate-limit` | small, standard, non-negotiable |
| Deployment | **Docker image + reverse proxy with TLS and WS upgrade**, on the company server | portable, and ours |

**Total new runtime dependencies: about fifteen**, four of which are already installed. Every one is there because something in the audit needs it.

---

# 20. Next implementation step

> ### **B5 — New authentication**
>
> `users`, `sessions` and `password_reset_tokens` already exist from B3, and B4 gave B5 everything it needs: Zod-validated config, one pooled Prisma client, `withActor` for attributed writes, and an error middleware that already turns a duplicate-email insert into a 409.
>
> Register · login (email **or** username) · refresh · logout · `/me` · password reset · username availability — §9 and §11.1.

## Before B5 starts

| | Item | Status |
|---|---|---|
| 1 | §21.5 session shape — access TTL, refresh TTL, "log out everywhere" | ⬜ **needs your answer** |
| 2 | §21.6 same-origin in production — decides the refresh cookie's `SameSite` | ⬜ **needs your answer** |
| 3 | §21.7 password policy | ⬜ recommendation: ≥ 10 chars, no composition rules, 128-byte cap |
| 4 | §21.8 SMTP / email verification | ⬜ **needs your answer** — blocks password reset and email invites |
| 5 | Install `argon2`, `jsonwebtoken`, `express-rate-limit` | ⬜ first task of B5 |
| 6 | ~~§21.11 board-deletion defect~~ | ✅ fixed by migration `0007` |

`provision_user` (audit §9) is the specification for `POST /auth/register`: profile + space + board + four default columns, in **one transaction**, idempotent.

## What NOT to do in B5

- **Never run `prisma migrate dev`** (§8.7 rule 4).
- **Never hand-edit `schema.prisma`.** It is generated by `prisma db pull`.
- **Never use `$executeRawUnsafe`.**
- **Do not write `SET LOCAL app.actor_id = $1`** — use `withActor` (§8.5).
- Do not store a refresh token in plaintext — `sessions.token_hash` is sha256 by design (§8.3).
- Do not touch `src/` (the frontend) — that is B8.

# 21. Open architectural decisions

**Four of the original nine are now closed** and are kept struck through as a record. **One new one (21.10) blocks B3.** The rest block B5 or later; each has a recommendation, but a recommendation is not a decision (P9).

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| ~~21.1~~ | Activity/notification triggers in the database or the service layer? | — | **CLOSED → triggers stay in the database**, reading `current_setting('app.actor_id', true)`, set via `set_config` (§8.5) |
| ~~21.2~~ | `users` + `profiles` as two tables, or one? | — | **CLOSED → two tables.** Profiles are readable by every board member; credentials are not |
| ~~21.3~~ | Query layer? | — | **CLOSED → Prisma, SQL-first** (§8.7). SQL migrations are the source of truth; `schema.prisma` is generated by `prisma db pull`; `prisma migrate deploy` only; `prisma migrate dev` banned. `pg` retained for diagnostics and raw utilities |
| ~~21.4~~ | Drop `position` columns? | — | **CLOSED → keep them.** Inspection found nine active uses in `src/` (§8.5b). Dropping is deferred to M6-05 as its own expand → backfill → contract |
| **21.10** | **Database collation.** `todo_app` is still `Russian_Russia.1251` / libc. B3 was applied onto it rather than waiting, so dev and a Linux production server will disagree on `ORDER BY` for text | **B12** (was B3) | **Still recommended: recreate with ICU `en-US`** (or `C`), §15.2d. Cheap while the only rows are throwaway; the app sorts in JS almost everywhere, so the practical blast radius is small — but `profiles_username_lower_key` and `citext` both lean on collation |
| ~~**21.11**~~ | **CLOSED → fixed by migration `0007`.** **Board deletion was impossible.** `log_member_activity` (AFTER DELETE on `board_members`) inserts an `activities` row referencing `OLD.board_id`, but during a board-deletion cascade that board is already gone, so the insert violates `activities_board_id_fkey` and the whole delete fails. Every board has an owner membership (`boards_add_owner_membership`), so this fires for **every** board. Carried over verbatim from Supabase — `boardsApi.ts:80` `deleteBoard` would fail there too | — | **Done.** The DELETE branch's insert is now guarded by `if exists (select 1 from public.boards b where b.id = old.board_id)`. Ordinary member removal is still logged; only the entry that could not have survived its own statement is skipped. Pinned by Part 3 of `db:verify-actor` |
| **21.5** | **Session shape:** access-token TTL, refresh TTL, and whether "log out everywhere" ships in v1 | **B5** | 15 min / 30 days / yes — it is one query once `sessions` exists |
| **21.6** | **Will the frontend and API share an origin in production?** | **B5** (cookie flags) and **B12** | Same origin, or same registrable domain. It makes `SameSite=Lax` work and keeps CSRF exposure small. Cross-site pushes you to `SameSite=None; Secure` plus a CSRF token |
| **21.7** | **Password policy** | **B5** | ≥ 10 characters, no composition rules, a 128-byte cap. GoTrue's 6-character default is too weak for a company system |
| **21.8** | **Is SMTP available, and is email verification required?** | **B5** | Verification **required** in production — it is the only proof an address is real, and invites are matched by email. Auto-verify behind a dev-only flag until SMTP exists. **If no SMTP is available at all, invites-by-email and password reset both need a different answer** |
| **21.9** | **Production file storage: a backed-up directory on the company server, or an S3-compatible service (MinIO, R2)?** | **B10**, **B12** | Either works. Local disk is simpler and legitimate on owned hardware; S3-compatible gives versioning and offsite copies more cheaply. **Whichever is chosen needs its own backup — under clean start, those files are the only copy** |

### Locked for B3 — settled, not to be relitigated

| Decision | Where |
|---|---|
| Triggers stay in the database; actor via `set_config('app.actor_id', $1, true)` | §8.5 |
| **Never** `SET LOCAL app.actor_id = $1` — it cannot bind a parameter | §8.5 |
| `users` and `profiles` stay two tables | §8.3 |
| Prisma, SQL-first: SQL is the source of truth, `schema.prisma` is generated | §8.7 |
| `prisma migrate deploy` only; `prisma migrate dev` **banned**; no custom runner | §8.7 |
| Do not model CHECKs, partial/expression indexes, triggers or functions in Prisma | §8.7 |
| `$executeRawUnsafe` banned | §8.7 |
| `pg` stays, for diagnostics and raw utilities | §8.7 |
| `position` columns **stay** on `columns` and `todos`, with their two indexes | §8.5b |
| `attachments.size_bytes` is `integer`, not `bigint` | §8.5b |
| `todos.estimate` stays `numeric`; convert to `number` at the DTO boundary | §8.5b |
| `todos.sprint_id` is **`ON DELETE SET NULL`** | §8.5b |
| `board_invites` stores `token_hash`; plaintext returned once, at creation | §4.4 S3 |
| SVG excluded from preview; CSP + `nosniff` on the preview endpoint | §14.4 |
| Inventory: 15 tables · 22 CHECKs · 8 uniques · 24 indexes · 17 triggers · 12 trigger functions | §8.1 |
| **`boards_add_owner_membership` must exist** or a new board's owner is locked out | audit §7.2b |

### Closed by the clean-start strategy

- ~~Are the bcrypt hashes portable?~~ — **moot.** No passwords are migrated.
- ~~How do we keep existing data safe during cutover?~~ — **moot.** There is no cutover, and no data.

---

**End of plan.** B0, B1 and B2 are built. B3 is not started, and 21.10 blocks it.
