# Implementation Plan

**Status:** Active — Milestone 3 in progress
**Owner:** Tech Lead
**Source of truth:** the Architecture Review (2026-08-05) + `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/FRONTEND.md`, `docs/API.md`, `docs/PRODUCT_SPEC.md`
**Scope:** takes the codebase from its original state (single-user, user-owned board, broken build) to a collaborative, permissioned, realtime work-management product with Jira-level functional depth and its own product identity.
**Last audited against the repository:** 2026-08-10.

This document is two things at once, and both matter:

1. A **historical ledger.** Completed tasks keep their IDs, their ordering and their original descriptions. Where what shipped diverged from what was planned, the divergence is recorded next to the task — not edited out of it.
2. A **forward roadmap.** Future tasks carry dependencies, risk labels, acceptance criteria and rollback notes.

Nothing in here is a claim of verification unless the verification actually happened. Where a check was skipped or could not be run, it says so.

---

## How to use this document

Part I is the **product direction** — what this application is for, what it borrows from Jira functionally, and what it refuses to borrow. It is the tie-breaker when a task could reasonably be built two ways.

Part II is the **working agreement** — branch strategy, migration rules, the authoritative permission model, review checklists, Definition of Done. It applies to every task in Part III.

Part III is the **task list**, grouped into milestones. Every task is sized for a single focused session (~1–3 hours), is independently testable, and becomes exactly one commit or one Pull Request. Milestones M0–M9 are fully broken down; M10 onward (Part IV) are roadmap sketches, deliberately not yet decomposed into tasks (see *Milestone status legend*).

Part V is **Deferred / Production Hardening** — real concerns, kept and costed, that do not block anything. Read it once so you recognise a deferred control when a task mentions one. **Security is not in Part V**; the permission model is a product requirement.

**The order this project builds in:** solid foundation → product features → advanced features → production hardening. Not the reverse. This is a portfolio project with no users; infrastructure work that insures against losses that cannot currently happen is deferred on purpose, and the *Calibration* box in Part II says exactly how far that reasoning extends.

### Milestone and task status legend

| Marker | Meaning |
|---|---|
| ✅ **Done** | Shipped, and the evidence is named (migration file, commit, or code path). |
| 🔶 **Applied, verification outstanding** | The change is live in the database or the app, but a test the task called for has not been run. The outstanding check is named. |
| ⬜ **Not started** | Planned, decomposed, not built. |
| 🗺 **Roadmap** | Direction agreed, scope not yet understood well enough to decompose. Not a commitment to build. |

Rules that are not negotiable:

1. **Never combine an additive migration and a destructive migration in one task.** Expand, backfill, contract — three tasks, three commits, three deploys.
2. **Never start a milestone whose dependencies are not fully done.** "Mostly done" is not done; see Definition of Done.
3. **A task that grows past ~3 hours is not one task.** Split it and add the new ID to this document in the same PR.
4. Every task ships with its manual test checklist executed. An unchecked box is an unmerged PR.
5. **Authorization is a database concern.** No task may introduce an authorization rule that exists only in React. See *Permission Model* in Part II.

---

# PART I — PRODUCT DIRECTION

## What this product is

A collaborative work-management application built around Kanban boards, aiming at **Jira-level flexibility and functional depth** — flexible work items, real permissions, configurable workflows, backlog, search, collaboration, history and reporting — with **its own UX, interaction model and visual identity**.

Jira is the **functional** reference. It is not a UI reference, not a template, and not a target to resemble.

`docs/PRODUCT_SPEC.md` states the same thing from the design side: *"The UI should NOT look like Jira… closer to Linear than Jira while still having its own identity."*

## The distinction every task must respect

| Borrowed from Jira (functional model) | Ours (product design) |
|---|---|
| Work items with types, keys, priorities, assignees, labels | How a work item is opened, edited and dismissed |
| Board / backlog / list as views over the same data | What a view looks like, and how you move between them |
| Statuses and configurable workflow transitions | How a transition is offered and confirmed |
| Membership roles and permissioned operations | How permission is communicated in the UI |
| Activity history and comments | How history is surfaced and read |
| Filters and saved filters | Filter authoring UX, command palette, keyboard model |

**A feature is in scope if it adds capability. It is out of scope if its only justification is that Jira's screen looks like that.**

## UX principles

These are principles, not tasks. They constrain how features get built; they do not by themselves authorise building anything.

1. **Board context is never lost.** Inspecting or editing a work item should not feel like navigating away from the board. This is the single strongest argument against a full-page issue view as the primary interaction.
2. **One data model, many views.** Board, backlog and list are views over the same work items, not separate features with separate state. Any schema decision that makes a second view expensive is a bad schema decision.
3. **Keyboard is a first-class input**, not an accessibility afterthought. `docs/PRODUCT_SPEC.md` names *Keyboard Friendly* and *Accessible* as core principles; both are currently unmet (M9).
4. **Drag and drop is a differentiator, not a checkbox.** The hand-rolled DnD in `src/hooks/useKanbanDnd.ts` exists because the library defaults were not good enough. Keep that bar.
5. **The UI tells the truth about permission.** A viewer should not see affordances that will fail. But hiding a button is never the enforcement — see Part II.
6. **History is a feature, not an audit log.** If activity is built, it is built to be read by humans.
7. **Configurability over hardcoding, where it is cheap.** A single hardcoded workflow is a redesign later; an over-configurable one nobody uses is waste now. Prefer the smallest configurable shape that fits the next two milestones.

## Terminology (deliberate)

- **Work item** is the product word. **`todos`** is the physical table name and stays that way — renaming it would touch every policy, index, FK, cache function, realtime publication and query key for zero user-visible gain. The rename is explicitly rejected, not deferred; see Appendix D.
- **Board membership** ≠ **board ownership**. `boards.owner_id` names the single Owner. `board_members` holds every member *including* the Owner. Code and prose must not use one to mean the other.
- **Role** always means one of `viewer | editor | admin | owner`. No other role exists.
- **Column** is the physical table and the board's visual unit. **Status** is what a column means to a workflow. They are the same row today (`columns.category`); M13 is where that could change, and Appendix D records the cost.

---

# PART II — WORKING AGREEMENTS

## Branch Strategy

The project is small. A heavyweight GitFlow would cost more than it returns, with one exception: the two milestones that perform destructive data migrations (M2, M6) must never land on `main` half-finished.

### Default: GitHub Flow

```
main                    ← protected, always deployable, always green
 └── feature/m0-01-delete-dead-code
 └── feature/m1-03-query-key-factory
 └── fix/m1-12-todo-menu-column-id
 └── chore/m0-11-ci-pipeline
```

- Branch off `main`, one branch per task.
- Branch naming: `<type>/<task-id>-<slug>` — `feature/`, `fix/`, `chore/`, `migration/`.
- Open a PR, run the Code Review Checklist, squash-merge, delete the branch.
- Short-lived: a branch older than three days is a task that was too big.

### Exception: integration branches for XL migration milestones

M2 (Boards), M3 (Members & Roles) and M6 (Realtime) rewrite the ownership model, the authorization model and the ordering model respectively. Their intermediate states are not deployable. Each gets a long-lived integration branch:

```
main
 └── milestone/m2-boards          ← integration branch, CI green, NOT deployed
      └── feature/m2-01-boards-table
      └── feature/m2-06-backfill-board-id
      └── ...
```

- Task PRs target the milestone branch, not `main`.
- The milestone branch merges to `main` **once**, when the milestone's Definition of Done is fully met, as a single reviewed merge.
- Rebase the milestone branch onto `main` at least every other day so the final merge is not an archaeology exercise.

### Protected-branch rules on `main`

- No direct pushes.
- CI must pass: `npm run lint`, `npm run build`, `npm test`.
- At least one review approval (self-review with the checklist counts on a solo project — but write the checklist out, don't nod at it).
- Linear history; squash merge only.

### Current state note — updated 2026-08-10

The original note here described an ambiguous trunk (a branch named `features`, `docs/` untracked). **That is resolved.** `main` is the trunk, `docs/` is committed, and Milestone 3 work is on the `m3` branch, which is the M3 integration branch in practice.

The M3-05 migration (`20260810120000_columns_todos_rls_via_membership.sql`) was applied to the linked project before it was committed. **That gap is now closed** — committed as `3c3eec8`, and `supabase migration list` shows all 23 versions paired local↔remote. Git and the database agree.

---

## Migration Strategy

### Standing rules

**Rule 1 — Migrations live in Git, are applied by the CLI, and only by the CLI.**
The two existing migrations were applied by hand in the Supabase SQL editor. That stops with M0-05. From then on: write the migration file → `supabase db push` → commit. No SQL editor, no exceptions. A schema change made in the dashboard is a schema change that does not exist.

> ### Calibration — read before applying any rule in this section
>
> **This is a portfolio project.** The database holds test fixtures — a handful of accounts and a few dozen work items. There are no paying users, no uptime commitment and no data whose loss would be an incident.
>
> Recovery machinery is therefore **sized to what a migration can actually destroy**, not to what a bank would do. The rules below distinguish two tiers and only the second one is expensive. Nothing in this section may be used to block feature work on a migration that cannot lose data.
>
> **What does not get relaxed:** the security model. RLS, `SECURITY DEFINER` helpers, privileged-RPC review and the role matrix are *product requirements* (see *Permission Model*), not production hardening. A portfolio project with a broken permission model is a worse portfolio project.
>
> Disaster-recovery apparatus — PITR, verified restore rehearsals, branch-database dry runs, observability — is deferred wholesale to **Part V**. It is recorded, not deleted, and it comes back if this project ever takes real users.

**Rule 2 — Supabase migrations are forward-only.**
There is no `supabase migration down`. "Rollback" always means one of:
- **Forward-fix migration** — a new migration that reverses the change. **This is the default and it is what you will use essentially always.** It is also free, which is why it is the backbone of this project's recovery story.
- **Restore from dump** — for data loss, with downtime. Requires a dump to have been taken first.
- **Point-in-Time Recovery** — not available; deferred (Part V, PH-01).

> **Standing fact — PITR is not enabled, and never has been.**
> `docs/RLS_AUDIT.md` (M0-06, finding E) recorded `pitr_enabled: false` with `backups: []`, and `supabase backups list` confirmed the same on 2026-08-10. M2's destructive migrations (M2-13, M2-14) were applied without it.
>
> **This is an accepted condition, not an outstanding blocker.** Enabling PITR requires the Pro plan plus a Small compute add-on plus the add-on itself — roughly $125/month, uncapped by the spend cap — to insure a fixture dataset. That is not a sensible trade for this project today. It is deferred to Part V with the trigger that reopens it.
>
> The practical consequence is narrow: **a migration that destroys data needs a dump taken beforehand.** Migrations that only change structure do not, because forward-fix SQL reverses them completely.

> **Standing note — M3-01 → M3-05 were applied without a dump.**
> Docker and a direct database connection were unavailable in that session. All five were additive or policy-only and were reversible by forward-fix, which is exactly the Tier A case Rule 6 now describes. Recorded for accuracy; no longer treated as a process failure.

**Rule 3 — Expand → Backfill → Contract. Never in one migration.**

| Phase | What it does | Reversible? | Risk |
|---|---|---|---|
| **Expand** | Add nullable column / new table / new index. Old code keeps working. | Yes, trivially | SAFE |
| **Backfill** | Populate the new shape from the old shape. Old code still works. | Yes, data is additive | HIGH — this is where data is lost |
| **Contract** | `NOT NULL`, drop the old column, add the FK. Old code breaks. | Only forward | HIGH |

Deploy the application code that reads the new shape **between** Backfill and Contract. That way there is a window where both shapes are valid and a bad deploy is a revert, not an incident.

**Rule 4 — Schema migrations and data migrations are separate files and separate commits.**
A schema migration is idempotent DDL. A data migration is a one-shot `UPDATE`/`INSERT`. Mixing them makes the schema file non-replayable on a fresh database, which breaks environment reproduction — the exact problem M0 exists to fix.

**Rule 5 — Rehearse on a branch database before a migration that can destroy data.**
`supabase branches create` (or a manually restored copy) → apply → run the app against it → then production. **Required for Tier B only** (Rule 6). Rehearsing a `create policy` costs an afternoon and proves nothing that the migration's own verification block does not.

**Rule 6 — Recovery effort scales with what a migration can destroy.**

Two tiers. Classify every migration before writing it, and put the classification in the PR.

**Tier A — structure only. Cannot lose data.**
Creating or replacing policies, functions, triggers, constraints, indexes; adding tables or nullable columns; inserting new rows.

- Required: **capture the exact prior definition verbatim in the migration file**, and write the forward-fix rollback in the same file. Both are free, both are already this project's practice (M2-08, M3-04 and M3-05 all do it), and together they make reversal copy-paste.
- **Not required: a dump, a rehearsal, or PITR.** These migrations are reversed with SQL, not with a restore.
- **A Tier A migration is never blocked on backup infrastructure.**

**Tier B — can destroy data.**
`DROP COLUMN`/`DROP TABLE`, a type change, or any `UPDATE`/`DELETE` against rows that already exist.

- Required: the Backup procedure below, a branch-database rehearsal (Rule 5), and row counts recorded before and after.
- This is where the money and the caution go, because this is the only place data actually disappears.

Worked classification for the tasks in flight — all of M3-13 → M3-18 are **Tier A**: they add five functions, two triggers, one policy and two constraints, and touch no existing row. M2-13 and M2-14 were Tier B, and M6-05 will be.

### When to create which

| Change | Migration type | When |
|---|---|---|
| New table, new column, new index, new constraint | Schema (expand) | Whenever needed. Cheap and safe. |
| Populating a new column from an old one | Data | Only after the expand migration has been deployed and verified |
| `NOT NULL`, `DROP COLUMN`, FK addition, type change | Schema (contract) | Only after the app no longer reads the old shape in production |
| RLS policy | Schema | Same commit as the table it protects, never later |
| `SECURITY DEFINER` function | Schema | Before the policies that call it |
| Membership / privilege-granting RPC | Schema | Reviewed line by line before it is applied — see *Permission Model* |

### Backup procedure — **Tier B migrations only**

Not a gate on Tier A. Do not run this before a policy or function change.

1. `supabase db dump --linked -f backups/pre-<task-id>-$(date +%Y%m%d-%H%M).sql` — schema + data.
2. Confirm the dump is non-empty and contains the affected tables.
3. Record row counts for every affected table (`select count(*) from todos;` etc.) in the PR description. These are the numbers you compare against afterwards.

*Verifying the dump actually restores into a scratch database is the stronger check and is deferred to Part V (PH-02). For a fixture dataset, a non-empty dump plus forward-fix SQL is proportionate.*

Backups directory is gitignored — dumps contain user data and must never be committed.

### Rollback procedure

1. **Revert the application deploy first** if one is live, so the old code talks to the old shape.
2. **Structure change (Tier A):** write and push the reversing migration, copy-pasted from the prior definition the migration captured. This is the path for every migration in M3.
3. **Data loss (Tier B):** restore the dump taken in the Backup procedure.
4. Write a short note in the PR describing what failed. The next attempt starts from that note.

---

## Permission Model — authoritative

This section is the single definition of who may do what. Any task, policy, RPC or component that disagrees with it is wrong, including tasks written earlier in this document.

### The four roles

```
viewer  →  editor  →  admin  →  owner
```

Exactly four roles exist. **Do not invent additional roles. Do not replace roles with ad-hoc boolean permission columns.** A separate permission system is only justified if a future requirement genuinely cannot be expressed as a role, and that would be its own architecture task with its own migration.

Each role includes everything the role to its left can do.

### Board content matrix

"Content" means work items (`todos`) and columns, including every Kanban operation that changes order.

| Capability | viewer | editor | admin | owner |
|---|:---:|:---:|:---:|:---:|
| Read board, columns, work items | ✅ | ✅ | ✅ | ✅ |
| Create / update / delete work items | ❌ | ✅ | ✅ | ✅ |
| Create / update / delete columns | ❌ | ✅ | ✅ | ✅ |
| Reorder work items and columns (drag, move, rehome) | ❌ | ✅ | ✅ | ✅ |

### Membership matrix

| Capability | viewer | editor | admin | owner |
|---|:---:|:---:|:---:|:---:|
| See the member list | ✅ | ✅ | ✅ | ✅ |
| Add / invite a member as viewer or editor | ❌ | ❌ | ✅ | ✅ |
| Add / invite a member as admin | ❌ | ❌ | ❌ | ✅ |
| Change a viewer ↔ editor role | ❌ | ❌ | ✅ | ✅ |
| Promote to / demote from admin | ❌ | ❌ | ❌ | ✅ |
| Remove a viewer or editor | ❌ | ❌ | ✅ | ✅ |
| Remove an admin | ❌ | ❌ | ❌ | ✅ |
| **Modify the Owner in any way** | ❌ | ❌ | ❌ | ❌ |
| Leave the board voluntarily | ✅ | ✅ | ✅ | ❌ |

Read as a single rule: **an actor may only act on a member strictly below their own rank, and never on the Owner.** An admin acting on another admin is denied; that is what "removes members below owner level" and "changes roles of Viewer and Editor" mean together.

### Owner immutability — invariants

These are database invariants, not UI rules. I1–I5 each have a named test in M3-16; I6 is a scoping rule, enforced by M3-14 refusing `role = 'owner'` and by no transfer operation existing.

- **I1.** A board always has exactly one Owner.
- **I2.** The Owner's membership row cannot be deleted by any membership operation, by **any** actor — an admin, another owner-level caller, or the Owner themselves.
- **I3.** The Owner's role cannot be changed to anything else by any membership operation, by **any** actor, on the same terms as I2.
- **I4.** An admin has no path to an Owner-held row at all: not their role, not their membership, not through any RPC, not through a `boards` update. This is the specific rule the whole hierarchy rests on, and it is stated separately from I2/I3 because it is the one an implementation is most likely to get subtly wrong — a caller-rank check that stops at "is the caller admin or owner" satisfies I2 and I3 and still lets an admin through.
- **I5.** `boards.owner_id` and the `owner` row in `board_members` always name the same user. Neither may drift from the other.
- **I6.** Changing who the Owner is, is **not** a membership operation. It is board ownership transfer — a separate, explicitly scoped operation that does not exist yet (Appendix B). Until it exists, the Owner of a board never changes.

Together I2 and I3 mean the Owner's membership row is immutable **as a membership row**. Nothing here restricts the Owner from editing their own profile, their own boards, or the board's content.

Deleting the Owner's *profile* cascades the board away entirely (`boards.owner_id … on delete cascade`, verified in `20260806090000_create_boards.sql`). That is a user-deletion path, not a membership operation, and it does not violate I1.

### Enforcement rules

1. **Postgres is the authority.** Every rule above is enforced by RLS policies, `SECURITY DEFINER` functions, constraints or triggers.
2. **Frontend permission checks are UX only.** They decide what to render. They are never a security control, and a task may not treat them as one.
3. **Membership-sensitive policies call `SECURITY DEFINER` helpers** (`is_board_member`, `board_role`, `accessible_board_ids`). A policy on `board_members` that sub-selects `board_members` recurses and returns a hard 500.
4. **`board_members` is never directly writable by the client.** It has no INSERT, UPDATE or DELETE policy, deliberately. Every membership mutation goes through a `SECURITY DEFINER` RPC that performs its own authorization check. Adding a client-writable policy to `board_members` is a security regression, not a shortcut.
5. **Every privileged RPC checks the caller's role itself.** `SECURITY DEFINER` bypasses RLS; a function that forgets its own check is an open door.
6. **Invariants that must hold for every writer go in triggers or constraints**, not in one RPC's body — the M2-21 `todos_assign_board_key` trigger is the precedent.
7. **Proof is REST-level.** A UI check proves nothing about a policy, because the UI never asks for rows it does not expect. Role tests use direct PostgREST/RPC calls with a real token for that role.

### Where each rule is enforced today — verified 2026-08-10 against the migration files

| Rule | Enforced by | Status |
|---|---|---|
| Read board / columns / work items for any member | `accessible_board_ids()` (owner ∪ membership) + SELECT policies | ✅ applied (M3-04, M3-05) |
| Write work items / columns requires editor+ | `board_role(board_id) in ('owner','admin','editor')` on INSERT/UPDATE/DELETE | 🔶 applied (M3-05). Every cell is covered by `scripts/verify-m3-16-role-matrix.sql`; the harness has not been run — see M3-16 |
| No client writes to `board_members` | RLS on, self-read policy only, no write policy | ✅ applied (M3-01) |
| New board gets an owner membership | `boards_add_owner_membership` AFTER INSERT trigger | ✅ applied (M3-03) |
| Membership mutation RPCs with role checks | `add_board_member` / `set_member_role` / `remove_board_member` / `leave_board` — `SECURITY DEFINER`, rank arithmetic, owner test before the rank gate | ✅ applied (M3-14). Full matrix verified: 67/67 in `scripts/verify-m3-14-membership.sql` |
| Owner immutability I1–I5 in the database | `board_members_owner_immutable` BEFORE INSERT/UPDATE/DELETE + `boards_owner_immutable` BEFORE UPDATE — every writer, `service_role` included | ✅ applied (M3-15). 37/37 in `scripts/verify-m3-15-owner-immutability.sql` |
| Member list visibility to co-members | `board_roster(uuid)` — `SECURITY DEFINER`, membership-guarded, returns `id, username, full_name, avatar_url, role, joined_at` | 🔶 applied (M3-13). Anonymous denial verified and the signature confirmed against the live schema; the authenticated role matrix is outstanding — `scripts/verify-m3-16-role-matrix.sql` §9. `board_members` stays self-read and `profiles` stays self-only **by design** — the RPC's return list is the exposure boundary, not a policy |
| Board settings by role | `"Admins and above update boards"` — `board_role(id) in ('owner','admin')` on UPDATE; DELETE left owner-only from M2-01 | 🔶 applied 2026-08-12 (M3-17), role matrix not yet run. `owner_id` stays unwritable through the widened policy because M3-15's `boards_owner_immutable` trigger refuses it — no policy can express "unchanged" |
| A work item's column belongs to its board | composite FK `todos (column_id, board_id) → columns (id, board_id)` | 🔶 applied 2026-08-12 (M3-18). The preflight passed against production data, so no existing row violated it. Integrity, not authorization — it refuses the owner exactly as it refuses an editor |
| Column deletion is atomic and editor-gated | `delete_column(uuid, uuid)` — `SECURITY INVOKER`, so M3-05's policies authorize it; the zero-row DELETE check turns a silent RLS denial into 42501 | 🔶 applied 2026-08-12 (M3-11). Backend only; the client still uses the four round-trip path |

### Decisions this section makes that the role specification did not state

Flagged explicitly so they are visible rather than smuggled in. Changing one means changing this table, the policies and the tests together.

| Question | Decision | Why |
|---|---|---|
| **May an admin remove or demote another admin?** | **No** (M3-14) | The role specification is genuinely ambiguous here: *"can remove members below owner level"* would include admins, while *"can change roles of Viewer and Editor"* and the Owner's *"can promote/demote Admins"* would not. Resolved as **strictly-below-own-rank**, which is the reading that keeps "promote/demote admins" as the Owner's distinguishing power. **If the other reading is intended, this row, both matrices, M3-14's checks and M3-16's tests change together.** |
| **May a member leave a board on their own?** | **Yes for viewer/editor/admin, never for the Owner** (M3-14, M8-09) | Not in the role specification at all. Membership you can be given and cannot decline is a defect, not a safeguard. The Owner exception falls out of invariant I1. |
| Who may rename a board / change its appearance? | **admin and owner** (M3-17) | It is board administration, which is what "admin" names. Editors manage content, not the board. |
| Who may delete or archive a board? | **owner only** (M3-17) | Irreversible and cascades across every table. "Owner is the ultimate authority over the board." |
| May a viewer be assigned a work item? | **Yes** — assignment requires membership, not write permission (M5-05) | Being responsible for something you cannot edit is a real state; refusing it would be a surprise, not a safeguard. |
| May a viewer comment? | **Undecided — M7 must decide before `comments` RLS is written** | Not derivable from the role spec. Recorded as an open decision, not silently resolved. |

---

## Definition of Done

### A **task** is done when

- [ ] `npm run build` passes (this is the only typecheck — `npm run dev` passing means nothing).
- [ ] `npm run lint` passes with no new warnings.
- [ ] `npm test` passes. Vitest is the only test mechanism; the `*.check.ts` + `node --experimental-strip-types` self-checks were retired in M1-17 and ported to `*.test.ts` siblings.
- [ ] Every box in the task's Manual Test checklist is ticked, by having actually done it.
- [ ] Non-trivial pure logic added by the task has a `*.test.ts` sibling.
- [ ] The Code Review Checklist has been walked, in writing.
- [ ] One commit / one PR, message matching the suggested form.
- [ ] If the task changed behaviour documented in `CLAUDE.md` or `docs/*`, that document is updated **in the same PR**.

### A **milestone** is done when

- [ ] Every task in it is done.
- [ ] The milestone's Success Criteria all hold.
- [ ] The Testing Checklist (below) has been run end to end against the milestone branch or `main`.
- [ ] No task was silently dropped. A task that was consciously deferred is moved to a later milestone **in this document**, with a one-line reason.
- [ ] No new `HIGH RISK` item is left in a half-applied state — expand/backfill/contract sequences are fully closed.
- [ ] `CLAUDE.md` reflects the new architecture. It is the onboarding document; a stale `CLAUDE.md` is a bug.

---

## Code Review Checklist

Walk this on every PR. Answer each line; do not skip lines that "obviously" pass.

**TypeScript**
- [ ] No `any`, no `unknown` returned from an API function (`API.md`: *"Never use any. Never return unknown."*).
- [ ] No new non-null assertions (`!`) — if the value can be null, model it.
- [ ] Types for DB rows are derived from the generated `Database` type, not hand-written.
- [ ] Component props are a props type, not a spread database row.
- [ ] `npm run build` is green.

**ESLint**
- [ ] `npm run lint` clean. No new `eslint-disable`.
- [ ] Hook dependency arrays are honest (no suppressed exhaustive-deps).

**Build**
- [ ] Build is green **and** no unused import slipped in (`noUnusedLocals` will catch it; the dev server will not).
- [ ] No new runtime dependency added that a few lines of code would have covered.

**RLS / Security**
- [ ] Any new table has RLS **enabled** and at least one policy, in the same migration.
- [ ] Any new query is scoped in the client (`.eq("board_id", …)`) *as well as* enforced in RLS. Defense in depth: RLS is the boundary, the client filter is the correctness aid.
- [ ] No ownership column (`user_id`, `owner_id`, `creator_id`) is sent from the client where a DB default could set it.
- [ ] No secrets, tokens, or user data in `console.*`.
- [ ] New `SECURITY DEFINER` functions are `STABLE` where possible and have an explicit `search_path`.

**Permission model** (every PR that touches authorization)
- [ ] The change matches the matrices in *Permission Model*. If it does not, that section is updated in the same PR, with a reason.
- [ ] No new rule exists only in React. Name the policy, constraint, trigger or RPC that enforces it server-side.
- [ ] No new INSERT/UPDATE/DELETE policy was added to `board_members`.
- [ ] Any new `SECURITY DEFINER` function performs its own authorization check on the caller, and is revoked from `public`/`anon`.
- [ ] Nothing the PR adds can remove, demote or otherwise modify an Owner (invariants I1–I6).
- [ ] Membership-sensitive policies call the helper functions rather than sub-selecting `board_members`.
- [ ] The claim was tested at REST level with a token for the role in question, not through the UI.

**React Query**
- [ ] Query key comes from the key factory. No inline `["todos"]` string literals.
- [ ] Key is scoped by `boardId` (post-M2).
- [ ] `useQueryClient()` is used — no import of the module-level `queryClient` singleton.
- [ ] No blanket `invalidateQueries` where a targeted cache write would do (`API.md`: *"Prefer updating cache directly"*). If invalidation is correct, a comment says why.

**Optimistic Updates**
- [ ] Mutation follows `onMutate → optimistic write → mutate → rollback onError`.
- [ ] `onMutate` calls `cancelQueries` first, and snapshots previous state into context.
- [ ] `onError` restores the snapshot. **A mutation with an optimistic write and no rollback does not merge.**
- [ ] Failure is visible to the user, not just to the cache.

**Realtime compatibility**
- [ ] Cache-update logic lives in a pure function the realtime handler can also call — not buried in a mutation closure.
- [ ] New ids are client-generated UUIDs, so an echoed insert reconciles by identity.
- [ ] Ordering writes touch one row, not a whole column (post-M6).

**Documentation**
- [ ] `CLAUDE.md` updated if architecture, folder layout, or a gotcha changed.
- [ ] `docs/*.md` updated if this PR contradicts them — or a note added explaining the deliberate divergence.
- [ ] This plan updated if a task was split, added, or deferred.

---

## Testing Checklist

Run in full after every milestone, against a real browser and a real Supabase project.

### Smoke — every milestone, every time

- [ ] Register a brand-new account → lands on a board with the four seeded columns.
- [ ] Log out → redirected to `/login`. Log back in → board restores.
- [ ] Hard refresh on the board → no flash of the login page, no duplicate loading spinner.
- [ ] Create a card via the column's Create button.
- [ ] Create a card via a mid-column `+` gap → it lands at that index, not at the bottom.
- [ ] Rename a card; Escape cancels, Enter saves.
- [ ] Delete a card via the three-dot menu.
- [ ] Drag a card within a column → order persists after refresh.
- [ ] Drag a card across columns → both columns renumber; persists after refresh.
- [ ] Drag a card into a `done` column → green flash fires once.
- [ ] Drag a column left/right → order persists after refresh.
- [ ] Collapse and expand a column.
- [ ] Rename a column; set and clear a min/max limit; confirm the warning appears and does **not** block a drop.
- [ ] Delete a column → forced to pick a destination; its cards arrive at the end of the destination in order.
- [ ] Switch language (en/ru/uz) → no crash, no raw keys rendered.
- [ ] Toggle dark mode.
- [ ] Update profile name/username/bio; upload an avatar.

### Multi-user and roles — from M3 onward

Run with four real accounts, one per role, on one board. **Every ❌ expectation is proved with `curl` against PostgREST or the RPC endpoint using that role's own JWT.** The UI proves nothing about RLS: it never asks for rows it does not expect, and a hidden button is not a denied request. Where a check is UI-only it says so.

**Non-member**
- [ ] Cannot see the board by guessing its URL.
- [ ] `GET /rest/v1/boards?id=eq.<board>` → `[]`.
- [ ] `GET /rest/v1/columns` and `/todos` filtered to that board → `[]`.
- [ ] `PATCH`, `POST`, `DELETE` against any of that board's rows → 0 rows affected or `42501`.

**Viewer**
- [ ] Reads the board, its columns and its work items — same counts as the Owner sees.
- [ ] `POST /rest/v1/todos` on that board → denied.
- [ ] `PATCH /rest/v1/todos?id=eq.<row>` (rename) → denied.
- [ ] `DELETE /rest/v1/todos?id=eq.<row>` → denied.
- [ ] Bulk reorder upsert on `todos` → denied.
- [ ] Same four verbs on `columns` → denied.
- [ ] Any membership RPC → denied.
- [ ] UI: create, drag handles, column menu and delete affordances are absent.

**Editor**
- [ ] Create, rename, delete a work item — all succeed and survive a reload.
- [ ] Create, rename, delete a column; set and clear limits — all succeed.
- [ ] **Drag within a column, drag across columns, drag a column** — the bulk `upsert` path. Each persists after a hard refresh. This is the single most important Editor check: it exercises INSERT *and* UPDATE policies simultaneously, and a missing one fails silently rather than loudly.
- [ ] Delete a column with cards → cards rehome to the chosen destination.
- [ ] Creating a work item allocates a `board_key` (the `KAN-n` label appears), proving the `boards.next_key` trigger works for a non-owner.
- [ ] Any membership RPC → denied.
- [ ] Board rename / delete → denied.

**Admin**
- [ ] Everything in the Editor list succeeds.
- [ ] Add a member as viewer, and as editor → succeeds.
- [ ] Add a member as **admin** → denied.
- [ ] Change viewer ↔ editor → succeeds.
- [ ] Promote an editor to admin, or demote an admin → denied.
- [ ] Remove a viewer, remove an editor → succeeds.
- [ ] Remove another admin → denied.
- [ ] **Remove the Owner → denied.**
- [ ] **Demote the Owner to any other role → denied.**
- [ ] Set themselves to `owner` → denied.
- [ ] Board rename → succeeds (per M3-17). Board delete → denied.

**Owner**
- [ ] Everything in the Admin list succeeds, plus promoting/demoting admins.
- [ ] **Cannot delete or demote their own owner membership** — the invariant holds against the Owner too (I2, I3).
- [ ] Cannot leave the board.
- [ ] Board delete → succeeds.

**Transitions and revocation**
- [ ] Promote viewer → editor: the promoted user can write on their **next** request, with no re-login.
- [ ] Demote editor → viewer: writes stop immediately; a drag already in flight fails visibly and rolls back.
- [ ] Remove a member: their next request for the board returns nothing; a stale open tab degrades without leaking data.
- [ ] Every role change and removal survives a reload on both sides.

**Direct-API hardening**
- [ ] Editor on board A cannot move one of A's work items into board B by sending B's `board_id` in an upsert.
- [ ] Editor on board A cannot inject a work item id belonging to board B into a reorder payload.
- [ ] Editor cannot set a work item's `column_id` to a column belonging to a different board.
- [ ] No membership RPC accepts a board the caller is not a member of.

### Concurrency — from M6 onward

- [ ] Two browsers, same board: A creates a card → appears in B without refresh.
- [ ] A moves a card → B sees the move, and B's own in-flight drag is not disrupted.
- [ ] A and B drag *different* cards in the same column simultaneously → both moves survive.
- [ ] A and B drag the *same* card simultaneously → one wins, no duplicate, no orphan.
- [ ] Kill B's network for 30s, reconnect → B's board converges to A's state.

### Regression — always

- [ ] `npm run build` green.
- [ ] `npm run lint` green.
- [ ] `npm test` green.
- [ ] Browser console clean — no errors, no unhandled promise rejections, no logged user data.
- [ ] Network tab: loading a board issues a bounded number of requests, not one per card.

---

# PART III — MILESTONES

Risk labels, applied to every task:

| Label | Meaning |
|---|---|
| **SAFE** | Additive or local. Worst case is a revert. |
| **MEDIUM RISK** | Touches shared state, the write path, or many files. Needs deliberate testing. |
| **HIGH RISK** | Destructive, or changes the security boundary, or migrates data. Requires backup + rollback + migration strategy, documented per task below. |

## Milestone status — as of 2026-08-10

| Milestone | Status | Note |
|---|---|---|
| M0 · Stabilise | ✅ Done | Build green, `strict` on, schema and RLS in Git, CI running. |
| M1 · Foundation | ✅ Done | Auth provider, key factory, error surfacing, Vitest. |
| M2 · Boards | ✅ Done | Board ownership across schema, RLS, routing and queries. |
| M3 · Members & Roles | 🔶 In progress | **Every M3 backend migration is applied** — M3-01 → M3-05, M3-11, M3-13 → M3-15, M3-17, M3-18; 29 of 29 versions paired local↔remote. The M3-16 gate run and the four UI tasks remain. |
| M4 · Invitations | ⬜ Not started | Depends on M3's membership RPCs. |
| M5 · Work Item Model | ⬜ Not started | Columns exist in the schema since M2-03; the UI does not. |
| M6 · Realtime | ⬜ Not started | Ordering migration first, then channels. |
| M7 · Comments & Activity | ⬜ Not started | Carries an undecided permission question. |
| M8 · Boards UX | ⬜ Not started | |
| M9 · Quality | ⬜ Not started | Four stated core principles are unmet until this lands. |
| M10 · Work Item Depth | 🗺 Roadmap | Types, labels, subtasks, links. |
| M11 · Backlog & Views | 🗺 Roadmap | |
| M12 · Search & Filtering | 🗺 Roadmap | |
| M13 · Configurable Workflow | 🗺 Roadmap | |

The original plan described ten milestones (M0–M9). M10–M13 are roadmap direction added in the 2026-08-10 audit; they are **not** decomposed into tasks and are **not** commitments. Appendix E records what is deliberately out of scope.

---

## Milestone 0 — Stabilise · ✅ **Done**

**Goal.** Make the project compile, make its schema and security reproducible from the repository, and turn on the type checking the spec assumes is already on.

**Why this milestone exists.** `npm run build` currently fails with 18 TypeScript errors, so the app cannot be deployed. The base schema and every RLS policy exist only inside the hosted Supabase project — the repository contains two `ALTER TABLE` files and no `CREATE TABLE`, no `CREATE POLICY`. That means the security model cannot be reviewed and no second environment can be created. `strict` is off in all three tsconfigs, so the "type safety" the spec names a core goal is largely notional. Nothing else in this plan can proceed safely until these three facts change.

**Dependencies.** None. This is the entry point.

**Estimated difficulty.** S–M (11 tasks; grows to M if the RLS audit finds policies missing).

**Risks.**
- The RLS audit (M0-06) is the unknown. If policies are absent, the live application has been exposing every user's data to every other user, M0-07 becomes urgent, and its severity was Critical all along.
- Enabling `strict` will surface a large error count across ~40 files that have never been checked. Split across two tasks; do not attempt one heroic commit.
- `supabase db pull` against a project whose migrations were applied by hand may require `supabase migration repair` to reconcile the migration history table.

**Success criteria.**
- `npm run build` exits 0 with `strict: true`.
- A fresh Supabase project can be built from `supabase/migrations/` alone and the app runs against it.
- Every table has RLS enabled and policies committed to Git.
- CI runs lint + build + self-checks on every PR.

### Tasks

#### M0-01 · Delete dead modules — **SAFE**

Remove the modules with zero live consumers. Roughly 12 of the 18 build errors are inside them, so this is the cheapest possible error reduction. Note `useDragOverTodos` is still re-exported from the barrel and `useUpdateTodo` imports the soon-to-be-deleted `ITodo` — both need adjusting in the same commit.

- **Files:** delete `src/stores/todoStore.ts`, `src/hooks/useDropIndicator.ts`, `src/services/lib/todos/useReorderTodos.ts`, `src/services/lib/todos/useSaveTodoOrder.ts`, `src/services/lib/todos/useDragOverTodos.ts`, `src/services/lib/todos/useChangeTodoStatus.ts` (0 bytes), `src/components/kanban/DraggableTodo.tsx`. Edit `src/services/lib/index.ts` (drop the `useDragOverTodos` export), `src/types/data.ts` (drop `ITodo`, `IServiceTodo`), `src/constants/consants.ts` (drop `BASE_URL`, `filters`), `src/services/lib/todos/useUpdateTodo.ts` (retype from `ITodo` → `ISupabaseTodo` — note `ITodo` has no `column_id`, which is how a real bug was hiding here).
- **DB / Supabase / RLS:** none.
- **React:** none — no rendered component imports any of these.
- **Breaking:** no.
- **Test:** build error count drops from 18 to ~6; `npm run dev` loads the board; create, drag, rename and delete a card.
- **Commit:** `chore: delete dead modules and pre-Supabase types`

#### M0-02 · Clear remaining unused-symbol errors — **SAFE**

The residual `noUnusedLocals` failures in live files.

- **Files:** `src/components/sideBar/app-sidebar.tsx` (4 unused imports), `src/components/todo/TodoItem/TodoColumnMenu.tsx` (unused `updateTodoColumn` import, line 1), `src/hooks/useTodosByColumns.ts` (unused `isLoading`, `error` destructure), `src/services/api/todoApi.ts` (unused `IColumn`), `src/services/lib/todos/useDeleteTodo.ts` (unused `IServiceTodo`), `vite.config.ts` (unused `reactCompilerPreset`, `fileURLToPath`).
- **DB / Supabase / RLS:** none.
- **React:** none.
- **Breaking:** no.
- **Test:** only the two `HeaderTodoForm` errors remain.
- **Commit:** `chore: remove unused imports and bindings`

#### M0-03 · Fix `HeaderTodoForm` — **MEDIUM RISK**

The last two build errors, and a genuine product defect: the header's quick-add calls `useAddTodo({ title, status: "todo" })` — no `column_id`, and `status` predates the columns schema. It has never worked. A board can have arbitrary columns, so a global quick-add needs a defined destination; the leftmost column (lowest `position`) is the conventional answer.

- **Files:** `src/components/layout/header/HeaderTodoForm.tsx`, possibly `src/components/layout/header/Header.tsx`.
- **DB / Supabase / RLS:** none.
- **React:** read columns via `useColumns()`, target the lowest-`position` column, disable the form when the board has no columns.
- **Breaking:** no — it was broken before.
- **Test:** build green (0 errors); type in the header form, press Enter → card appears at the bottom of the leftmost column; the form is disabled on a board with no columns; leftmost column determined by `position`, not array order.
- **Commit:** `fix: header quick-add targets the leftmost column`

> If the product does not actually want a global quick-add, delete `HeaderTodoForm` and its usage in `Header.tsx` instead. Deleting is cheaper than fixing, and this feature has never functioned, so nobody depends on it.

#### M0-04 · Validate env vars, stop logging row data — **SAFE**

- **Files:** `src/services/api/supabase.ts` (throw at module load if either var is missing; also delete the commented-out legacy client block referencing the wrong key name), `src/services/api/todoApi.ts` (remove `console.log(data)` at line 15).
- **DB / Supabase / RLS:** none.
- **React:** none.
- **Breaking:** no.
- **Test:** temporarily blank `VITE_SUPABASE_URL` → clear thrown error at boot instead of an opaque failure on first query; restore; board loads with a clean console.
- **Commit:** `chore: fail fast on missing env vars, stop logging todo rows`

#### M0-05 · Adopt the Supabase CLI workflow and capture a baseline migration — **MEDIUM RISK**

Pull the live schema into a committed baseline. `supabase db pull` is read-only against production, but the migration-history table may need repairing because the two existing migrations were applied by hand in the SQL editor.

- **Files:** `supabase/migrations/<ts>_baseline_schema.sql` (new), `package.json` (add `db:pull`, `db:push`, `db:diff`, `db:types` scripts), `README.md` or `CLAUDE.md` (document the workflow), `.gitignore` (add `backups/`).
- **DB:** none — read only.
- **Supabase:** `supabase link`, `supabase db pull`, `supabase migration repair --status applied` for the two hand-applied files if the history table disagrees.
- **RLS:** none yet — this task only captures what exists.
- **Breaking:** no.
- **Test:** baseline contains `CREATE TABLE` for `profiles`, `columns`, `todos`; `supabase db reset` against a **local/branch** database succeeds and the app runs against it; **also record in the PR whether PITR is enabled on the production project** — M2 depends on it.
- **Commit:** `chore(db): capture baseline schema, adopt CLI migration workflow`

#### M0-06 · Audit RLS and storage policies — **SAFE** (investigation, no code)

Determine what the security boundary actually is. Produce findings, not fixes.

- **Files:** `docs/RLS_AUDIT.md` (new).
- **DB / Supabase / RLS:** read-only queries against `pg_policies` and `pg_tables.rowsecurity`, plus the `storage.objects` policies for the `avatars` bucket.
- **React:** none.
- **Breaking:** no.
- **Test — this is the whole task:**
  - [ ] Is RLS **enabled** on `todos`, `columns`, `profiles`?
  - [ ] Does each have SELECT / INSERT / UPDATE / DELETE policies? `upsert` needs *both* INSERT and UPDATE — `reorderTodos` and `reorderColumns` depend on this.
  - [ ] With user B's token, `curl` the PostgREST endpoint for `columns` — recall `getColumns()` sends **no filter at all**, so if the policy is missing this returns every column in the system.
  - [ ] With user B's token, attempt `PATCH /todos?id=eq.<A's todo id>` — does it succeed?
  - [ ] Can user B overwrite `avatars/<A's uuid>.png`? The upload path is guessable and uses `upsert: true`.
  - [ ] Record each answer in the audit doc.
- **Commit:** `docs: RLS and storage policy audit findings`

#### M0-07 · Commit and correct RLS policies — **HIGH RISK**

Bring the security boundary into Git and close whatever M0-06 found open.

- **Files:** `supabase/migrations/<ts>_rls_policies.sql`, `docs/RLS_AUDIT.md` (mark items resolved).
- **DB:** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` where missing; `CREATE POLICY` per table.
- **Supabase:** storage policy on the `avatars` bucket restricting writes to the owner's path; set a bucket file-size limit.
- **RLS:** this is the entire task. Interim model (user-owned) — M3 replaces it with membership-based policies.
- **Breaking:** **yes, potentially.** A policy that is too tight breaks the running app; too loose leaves the hole open.
- **Test:** every M0-06 check now answers correctly; then the full Smoke checklist as the owning user — a missing UPDATE policy will surface as drags that silently revert on refresh; verify the `upsert` paths specifically (drag a card, drag a column).

> **HIGH RISK — backup / rollback / migration**
> **Backup:** full `supabase db dump` before applying. Policies do not touch data, but a botched `ALTER TABLE` on a live table can lock it.
> **Rollback:** forward-fix migration dropping the new policies. Keep the exact previous policy definitions (captured in M0-05's baseline) in the PR description so the reversal is copy-paste, not reconstruction.
> **Migration:** apply to a branch database first, run the full Smoke checklist against it, then production. Apply during low traffic. Watch for 403s in the browser network tab for ten minutes after — a too-tight policy shows up as silent write failures, not errors, because nothing surfaces mutation errors yet (that lands in M1-07).

#### M0-08 · Generate database types and type the client — **MEDIUM RISK**

Every `.from(...)` currently returns `any`; `getColumns()`'s `Promise<IColumn[]>` is an unchecked assertion. Generating the `Database` type will surface real mismatches between the hand-written interfaces and the actual schema.

- **Files:** `src/types/database.ts` (generated, committed), `src/services/api/supabase.ts` (`createClient<Database>`), `src/types/data.ts` (derive `ISupabaseTodo`/`IColumn`/`ISupabaseProfile` from generated row types rather than hand-writing them), `package.json` (`db:types` script).
- **DB:** none.
- **Supabase:** `supabase gen types typescript --linked > src/types/database.ts`.
- **RLS:** none.
- **Breaking:** no runtime change; expect compile errors where hand-written types were wrong. Those errors are the point.
- **Test:** build green; every mismatch found is recorded in the PR body (they are review findings, not noise); rename a column in a scratch DB, regenerate, confirm the build now fails — proving the types are load-bearing.
- **Commit:** `feat(types): generate and wire Supabase database types`

#### M0-09 · Enable `strictNullChecks` — **MEDIUM RISK**

- **Files:** `tsconfig.app.json`, plus every file the flag flags.
- **DB / Supabase / RLS:** none.
- **React:** null-guards where genuinely needed. Resolve `user?.id!` in `src/services/lib/todos/useTodos.ts` properly rather than re-asserting.
- **Breaking:** no runtime change.
- **Test:** build green; full Smoke checklist — a wrongly-placed `?? ""` or `?? 0` silently changes behaviour, so exercise the board rather than trusting the compiler.
- **Commit:** `chore(ts): enable strictNullChecks`

#### M0-10 · Enable full `strict` — **MEDIUM RISK**

- **Files:** `tsconfig.app.json`, `tsconfig.node.json`, plus fallout.
- **Breaking:** no runtime change.
- **Test:** build green; Smoke checklist.
- **Decision to record in the PR:** whether to also enable `noUncheckedIndexedAccess`. It will flag the `todos[0]?.id` and `destinations[0].id` patterns in `KanbanColumn` and `DeleteColumnModal`. **Recommendation: defer it** — it is a large diff for a class of bug the code mostly already guards, and M0 has higher-value work. Revisit in M9.
- **Commit:** `chore(ts): enable strict mode`

#### M0-11 · CI pipeline — **SAFE**

Turn the Code Review Checklist's mechanical half into something that cannot be skipped.

- **Files:** `.github/workflows/ci.yml` (new).
- **DB / Supabase / RLS:** none.
- **React:** none.
- **Breaking:** no.
- **Test:** open a throwaway PR with a deliberate unused import → CI fails; remove it → CI passes. Runs `npm ci`, `npm run lint`, `npm run build`, and both `node --experimental-strip-types` self-checks.
- **Commit:** `ci: lint, build and self-checks on every pull request`

### Expected commit order — Milestone 0

```
1.  chore: delete dead modules and pre-Supabase types            (M0-01)
2.  chore: remove unused imports and bindings                    (M0-02)
3.  fix: header quick-add targets the leftmost column            (M0-03)   ← build green from here
4.  chore: fail fast on missing env vars, stop logging todo rows (M0-04)
5.  chore(db): capture baseline schema, adopt CLI workflow       (M0-05)
6.  docs: RLS and storage policy audit findings                  (M0-06)
7.  feat(db): commit and correct RLS policies                    (M0-07)   ← HIGH RISK
8.  feat(types): generate and wire Supabase database types       (M0-08)
9.  chore(ts): enable strictNullChecks                           (M0-09)
10. chore(ts): enable strict mode                                (M0-10)
11. ci: lint, build and self-checks on every pull request        (M0-11)
```

M0-05 through M0-07 are independent of M0-01 through M0-04 and can run in parallel if two people are working.

### As built — Milestone 0 · ✅ Done

Recorded 2026-08-10 from the repository. The task descriptions above are left as written; this is what actually shipped and what did not.

| Task | Evidence |
|---|---|
| M0-05 | `supabase/migrations/20260804000000_baseline_schema.sql` |
| M0-06 | `docs/RLS_AUDIT.md` |
| M0-07 | `supabase/migrations/20260805121441_rls_policies.sql` |
| M0-08 | `src/types/database.ts`, generated by `npm run db:types` |
| M0-09 / M0-10 | `strict: true` in `tsconfig.app.json` and `tsconfig.node.json` |
| M0-11 | `.github/workflows/ci.yml` — runs `npm ci`, `npm run lint`, `npm run build`, `npm test` |

**What M0-06 found.** RLS was **disabled** on `todos` and `columns`, and both were granted `ALL` to `anon` — the publishable key that ships in the client bundle. The exposure was unauthenticated, not merely user-to-user. M0-07 closed it.

**Divergences and leftovers, still open.** These are recorded here so they are not lost; each has a home in Appendix B.

- `noUncheckedIndexedAccess` was deferred as the task recommended. Still off.
- **RLS_AUDIT item 3 — avatar storage.** Any authenticated user can `upsert` over `avatars/<any-uuid>.<ext>` and replace another person's avatar. The upload path is still `${userId}.${ext}` in `src/services/profile/uploadAvatars.ts`. **Not fixed.** Real, exploitable, and unowned by any task — see Appendix B.
- **RLS_AUDIT item 6 — `handle_new_user()`** is `SECURITY DEFINER` with no `search_path`. **Not fixed.**
- **RLS_AUDIT item 7 — PITR.** Recorded as disabled. Still disabled, now as an explicit costed decision rather than an oversight — deferred to Part V, PH-01.
- **RLS_AUDIT item 5 — `shift_completed_positions`.** Fixed: dropped in `20260807190500_drop_user_id.sql`.
- **RLS_AUDIT finding D — dead columns.** `todos.status` and `todos.previous_status` still exist in the schema (confirmed in `src/types/database.ts`). They predate the columns schema and nothing reads them. They will actively confuse M13's workflow design; cleanup is M10-00.

---

## Milestone 1 — Foundation · ✅ **Done**

**Goal.** Fix the six structural defects that would otherwise make Milestone 2 dramatically harder, and give the application an error surface.

**Why this milestone exists.** `useAuth` is a plain hook, so every call site opens its own auth subscription and flips its own `loading`. Query keys are global string literals, which blocks per-board caching. No mutation anywhere surfaces an error to the user, so a failed RLS policy is indistinguishable from success. The drop path writes the cache optimistically and never rolls back. Each of these is touched by the ownership migration anyway — fixing them now costs days, fixing them after M2 costs weeks.

**Dependencies.** Milestone 0 complete.

**Estimated difficulty.** M (17 tasks).

**Risks.**
- The `AuthProvider` switch changes loading-state timing; watch for a route flash on first paint.
- The folder restructure (M1-14, M1-15) produces a large mechanical diff. Land it as its own commits, separate from behavioural change, or review becomes impossible.
- M1-09 rewrites the drop path — the highest-traffic write in the app.

**Success criteria.**
- Exactly one auth subscription exists per page load.
- No query key string literal appears outside the key factory.
- Every mutation failure produces a visible message and a correct rollback.
- A thrown render error shows a boundary, not a white screen.
- `services/` follows one convention, matching `docs/FRONTEND.md`.

### Tasks

#### M1-01 · `AuthProvider` — **MEDIUM RISK**

`useAuth` currently holds its own `useState`, its own `getSession()` and its own `onAuthStateChange` subscription. It is called by `ProtectedRoute`, `PublicRoute`, `useTodos` and `useProfile` — at least four independent copies, each flipping `loading` on its own schedule.

- **Files:** `src/providers/AuthProvider.tsx` (new), `src/services/lib/auth/useAuth.ts` (reads context), `src/main.tsx` (mount above `QueryClientProvider`).
- **DB / Supabase / RLS:** none.
- **React:** one context, one subscription, one `loading`.
- **Breaking:** no public API change — `useAuth()` keeps its `{ user, loading }` shape.
- **Test:** network tab shows exactly one `getSession` on load; log in → board renders without a double spinner; log out → redirect is immediate; open two tabs, log out in one → the other reacts.
- **Commit:** `feat(auth): hoist useAuth into a provider`

#### M1-02 · Clear the query cache on sign-out — **SAFE**

`useLogout` clears the cache, but only when logout goes through that button — not on token expiry or a sign-out in another tab. With a global `["todos"]` key, a stale cache is a cross-user exposure risk.

- **Files:** `src/providers/AuthProvider.tsx`, `src/services/lib/auth/useLogout.ts` (drop the now-redundant clear).
- **React:** `queryClient.clear()` on `SIGNED_OUT` inside the single subscription.
- **Breaking:** no.
- **Test:** log in as A, load the board, log out, log in as B → B sees B's board with no flash of A's cards; repeat by expiring the session in another tab.
- **Commit:** `fix(auth): clear query cache on any sign-out, not just the button`

#### M1-03 · Query key factory — **MEDIUM RISK**

Keys are inline string literals across a dozen files. `API.md` mandates predictable, feature-owned keys, and M2 needs them board-scoped.

- **Files:** `src/services/queryClient/queryKeys.ts` (new), every hook in `src/services/lib/todos/*`, `src/services/lib/profile/*`, `src/services/columns/*`, plus `src/components/kanban/KanbanBoard.tsx` and `src/services/lib/todos/useTodoDrop.ts`.
- **DB / Supabase / RLS:** none.
- **React:** typed factory — `queryKeys.todos()`, `queryKeys.columns()`, `queryKeys.profile(userId)`. Leave room for the `boardId` argument M2 adds.
- **Breaking:** no.
- **Test:** grep for `queryKey: [` → every hit routes through the factory; Smoke checklist (a mistyped key means a mutation writes to a cache nothing reads — it looks like "the UI didn't update").
- **Commit:** `refactor(query): centralise query keys in a typed factory`

#### M1-04 · Fix the profile cache-key mismatch — **SAFE**

`useUpdateProfile` writes `["profile"]`; `useProfile` reads `["profile", user?.id]`. The write lands in an orphan entry. It only appears to work because `ProfilePage` mirrors the response into local state.

- **Files:** `src/services/lib/profile/useUpdateProfile.ts`.
- **React:** use the factory key; add optimistic update + rollback while here.
- **Breaking:** no.
- **Test:** update the bio, navigate away, navigate back → the new bio is there **without a refetch** (watch the network tab); force a failure (offline) → the field reverts and an error shows.
- **Commit:** `fix(profile): write to the key useProfile actually reads`

#### M1-05 · QueryClient defaults — **SAFE**

`new QueryClient()` has zero configuration: every window focus refetches the whole board, and a 403 from a missing policy retries three times before surfacing.

- **Files:** `src/services/queryClient/queryClient.ts`.
- **React:** `staleTime`, `gcTime`, and a `retry` predicate that does **not** retry 4xx.
- **Breaking:** no.
- **Test:** load the board, switch tabs and back → no refetch within `staleTime`; simulate a 403 → surfaces once, not after three retries.
- **Note:** `@tanstack/query-persist-client` and `query-sync-storage-persister` are installed but unimported. **Leave them unwired.** A persisted cache with a global `["todos"]` key is exactly where cross-user leakage happens. Revisit after M2 scopes the keys.
- **Commit:** `chore(query): set explicit client defaults`

#### M1-06 · Toast primitive — **SAFE**

- **Files:** `src/components/ui/Toast.tsx`, `src/providers/ToastProvider.tsx` (new), `src/main.tsx`.
- **React:** minimal — a queue, a portal, auto-dismiss, an imperative `toast.error()` / `toast.success()`. **Do not add a toast library**; this is ~60 lines and a dependency here buys nothing.
- **Breaking:** no.
- **Test:** trigger one from a scratch button — appears, auto-dismisses, stacks correctly, is announced to a screen reader (`role="status"` / `aria-live`).
- **Commit:** `feat(ui): minimal toast primitive`

#### M1-07 · Global mutation error surfacing — **MEDIUM RISK**

Not one mutation in the codebase has a user-visible `onError`. `FRONTEND.md`: *"Never silently ignore errors."* This is what makes every other milestone observable — a silently-failing RLS policy currently looks identical to success.

- **Files:** `src/services/queryClient/queryClient.ts` (`MutationCache` / `QueryCache` `onError` defaults).
- **React:** default error handler pushes a toast; per-mutation `onError` can still override.
- **Breaking:** no — but expect previously-invisible failures to start appearing. **That is the feature.** Triage what surfaces; do not suppress it.
- **Test:** go offline → create a card → optimistic card appears, then rolls back **with a toast**; break a policy in a scratch DB → the 403 is visible; confirm no toast storms on a single failure.
- **Commit:** `feat(query): surface mutation failures to the user`

#### M1-08 · Error boundary and 404 route — **SAFE**

A render throw in any card currently blanks the entire application.

- **Files:** `src/components/ErrorBoundary.tsx` (new), `src/components/routes/Routes.tsx` (`errorElement`, `path: "*"`), `src/components/kanban/KanbanColumn.tsx` (wrap the card list).
- **React:** class boundary with a reset action; a 404 page.
- **Breaking:** no.
- **Test:** throw deliberately inside `TodoItem` → one column shows the fallback, the rest of the board still works; visit `/nonsense` → 404, not a blank page.
- **Commit:** `feat: error boundaries and a 404 route`

#### M1-09 · Convert `todoDrop` into a mutation with rollback — **MEDIUM RISK**

The worst correctness bug in the running app. `todoDrop` writes the cache and then awaits `reorderTodos`; on failure the cache keeps the wrong order and the rejection is unhandled — `onDragEnd` is `async` and awaits it with no `try`/`catch`. A failed drop leaves the UI permanently inconsistent with the database, silently, until the next refetch. The file is also named `use*` but exports a plain async function, and it imports the module-level `queryClient` singleton.

- **Files:** `src/services/lib/todos/useTodoDrop.ts` → real hook, `src/components/kanban/KanbanBoard.tsx` (call the mutation), `src/services/lib/index.ts` (barrel).
- **DB / Supabase / RLS:** none.
- **React:** `useMutation` with `onMutate` snapshot → optimistic splice → `onError` restore + toast. Use `useQueryClient()`. Translate the Russian comments to English while here (the only non-English comments in the codebase).
- **Breaking:** no.
- **Test:** drag within a column and across columns → order persists after refresh; **go offline, drag → the card visibly returns to its original position and a toast appears**; go back online, drag again → succeeds; drag a card into a `done` column → the flash still fires exactly once.
- **Commit:** `fix(dnd): make the drop path a mutation with rollback`

#### M1-10 · Remove direct `queryClient` singleton imports — **SAFE**

- **Files:** `src/components/kanban/KanbanBoard.tsx` (column reorder path), anywhere else grep finds `from "@/services/queryClient/queryClient"` outside `main.tsx`.
- **React:** `useQueryClient()`.
- **Breaking:** no.
- **Test:** grep is clean; drag a column → order persists.
- **Commit:** `refactor(query): use useQueryClient instead of the module singleton`

#### M1-11 · Fix the impure memo in `useTodosByColumns` — **SAFE**

`grouped` is declared **outside** `useMemo` and mutated inside it. It is recreated every render but only repopulated when the memo re-runs, so the returned reference is a stale-but-mutated accumulator. It works by luck of ordering and will not survive StrictMode double-invocation, concurrent rendering, or the React Compiler.

- **Files:** `src/hooks/useTodosByColumns.ts`.
- **React:** move the declaration inside the memo; return a stable, correctly-memoised record.
- **Breaking:** no.
- **Test:** enable `<StrictMode>` temporarily → columns still group correctly and cards do not duplicate; drag between columns repeatedly; add a card mid-column.
- **Commit:** `fix: make useTodosByColumns memo pure`

#### M1-12 · Fix the card's "Change status" menu — **SAFE**

`TodoMenu` renders `<TodoStatusMenu currentColumnId={""} />`, so the filter `column.id !== currentColumnId` never matches and the menu offers the card's own column as a move target.

- **Files:** `src/components/todo/TodoItem/TodoMenu.tsx`, `src/components/todo/TodoItem.tsx` (pass `column_id` through), `src/types/data.ts` (the commented-out `currentColumnId` fields are the abandoned attempt — finish or remove them).
- **React:** thread the real `column_id`.
- **Breaking:** no.
- **Test:** open the menu on a card in "In Progress" → "In Progress" is absent from the list, the other columns are present; pick one → the card moves; a `done` target fires the flash.
- **Commit:** `fix(todo): exclude the current column from the move menu`

#### M1-13 · Auth form validation and feedback — **SAFE**

Both forms submit raw state — no trim, no length check, no error rendering, no loading state. A failed login currently does nothing at all.

- **Files:** `src/components/authForm/LoginForm.tsx`, `src/components/authForm/RegisterForm.tsx`, `src/utils/validation.ts` (new — email shape, required, min length; **pure, no React**, per `docs/FRONTEND.md`).
- **React:** inline field errors, disabled + spinner on `isPending`, server error surfaced.
- **Breaking:** no.
- **Test:** empty submit → field errors, no network call; malformed email → caught client-side; wrong password → server error visible; correct credentials → spinner then redirect; whitespace-padded email is trimmed. Add a `validation.check.ts` self-check.
- **Commit:** `feat(auth): validate and give feedback on the auth forms`

#### M1-14 · Introduce `providers/` and `utils/` — **MEDIUM RISK** (mechanical)

`docs/FRONTEND.md` specifies both; neither exists. `ThemeProvider` currently lives under `services/lib/themes/` and `cn` under `services/lib/utils.ts`.

- **Files:** move `src/services/lib/themes/ThemeProvider.tsx` → `src/providers/`, `src/services/lib/utils.ts` → `src/utils/cn.ts`; update every importer.
- **React:** import paths only.
- **Breaking:** import paths — but caught at compile time.
- **Test:** build green; dark mode toggles; every `cn`-styled surface still renders (board, cards, headers, modals).
- **Commit:** `refactor: introduce providers/ and utils/ per FRONTEND.md`

#### M1-15 · Collapse `services/lib/` into feature folders — **MEDIUM RISK** (mechanical)

`services/` currently has three competing conventions: `services/api/` (todos, auth, profile), `services/columns/` (its own api + hooks — the shape the docs describe), and `services/lib/` (hooks plus a provider plus a util). A newcomer has no rule to follow.

- **Files:** `services/api/todoApi.ts` + `services/lib/todos/*` → `services/todos/`; `services/api/authApi.ts` + `services/lib/auth/*` → `services/auth/`; `services/api/profile/*` + `services/lib/profile/*` → `services/profile/`; keep `services/api/supabase.ts` as the shared client; delete `services/lib/` and its barrel. Standard shape becomes `services/<feature>/{<feature>Api.ts, use*.ts}`, matching `docs/API.md`.
- **React:** import paths only.
- **Breaking:** import paths; the `services/lib` barrel disappears — prefer explicit imports over recreating it.
- **Test:** build green; full Smoke checklist.
- **Commit:** `refactor(services): one folder per feature, per API.md`

#### M1-16 · Relocate UI primitives, fix the shadcn alias — **SAFE**

`button`, `input`, `tooltip`, `skeleton`, `separator`, `avatar` sit under `components/ui/SideBarUI/` and are not sidebar components. `components.json` maps `utils` to `@/lib/utils`, which does not exist — so every future `npx shadcn add` lands in the wrong place with a broken import.

- **Files:** move generic primitives from `src/components/ui/SideBarUI/` → `src/components/ui/`; leave genuinely sidebar-specific files behind; update importers; fix `components.json` aliases to point at `@/utils/cn`.
- **Breaking:** import paths.
- **Test:** build green; sidebar renders, opens, collapses; dropdown menus in `ColumnMenu` and `DeleteColumnModal` still work; `npx shadcn add <something>` into a scratch branch lands correctly and is then discarded.
- **Commit:** `refactor(ui): move shared primitives out of SideBarUI, fix aliases`

#### M1-17 · Add a test runner — **MEDIUM RISK**

Nine milestones of schema migrations and realtime races cannot be defended by two `*.check.ts` files. Pulling this forward from M9 makes M2 and M6 measurably safer.

- **Files:** `vitest.config.ts` (new), `package.json` (`test`, `test:watch`), `.github/workflows/ci.yml` (add the step), migrate `insertDense.check.ts` and `limitBreach.check.ts` to Vitest **or** keep both mechanisms — decide and record it in `CLAUDE.md`.
- **Breaking:** no.
- **Test:** `npm test` passes; a deliberately broken assertion fails CI.
- **Recommendation:** Vitest reuses the existing Vite config and adds one dev dependency. Migrate the two self-checks so there is one way to run tests, not two. Do **not** add React Testing Library yet — pure logic is where the risk is, and component tests you do not need are a maintenance tax.
- **Commit:** `test: add Vitest and port the existing self-checks`

### Expected commit order — Milestone 1

```
1.  feat(auth): hoist useAuth into a provider                        (M1-01)
2.  fix(auth): clear query cache on any sign-out                     (M1-02)
3.  refactor(query): centralise query keys in a typed factory        (M1-03)
4.  fix(profile): write to the key useProfile actually reads         (M1-04)
5.  chore(query): set explicit client defaults                       (M1-05)
6.  feat(ui): minimal toast primitive                                (M1-06)
7.  feat(query): surface mutation failures to the user               (M1-07)
8.  feat: error boundaries and a 404 route                           (M1-08)
9.  fix(dnd): make the drop path a mutation with rollback            (M1-09)
10. refactor(query): use useQueryClient instead of the singleton     (M1-10)
11. fix: make useTodosByColumns memo pure                            (M1-11)
12. fix(todo): exclude the current column from the move menu         (M1-12)
13. feat(auth): validate and give feedback on the auth forms         (M1-13)
14. test: add Vitest and port the existing self-checks               (M1-17)
15. refactor: introduce providers/ and utils/                        (M1-14)
16. refactor(services): one folder per feature                       (M1-15)
17. refactor(ui): move shared primitives out of SideBarUI            (M1-16)
```

The three mechanical refactors land **last**, after the behavioural work, so their large diffs never obscure a real change. M1-06 must precede M1-07.

### As built — Milestone 1 · ✅ Done

| Task | Evidence |
|---|---|
| M1-01 / M1-02 | `src/providers/AuthProvider.tsx` + `authContext.ts`; `queryClient.clear()` on `SIGNED_OUT` |
| M1-03 | `src/services/queryClient/queryKeys.ts` — the only place a key is spelled out |
| M1-05 / M1-07 | `src/services/queryClient/queryClient.ts` (`MutationCache`/`QueryCache` toasts, `meta: { silent: true }` opt-out) and `retryPolicy.ts` |
| M1-06 | `src/providers/ToastProvider.tsx` — hand-rolled, no dependency added |
| M1-08 | `src/components/ErrorBoundary.tsx`, route `errorElement`s in `src/components/routes/Routes.tsx` |
| M1-09 | `src/services/todos/useTodoDrop.ts` — a real mutation with snapshot rollback |
| M1-13 | `src/utils/validation.ts` + `validation.test.ts` |
| M1-14 / M1-15 / M1-16 | `src/providers/`, `src/utils/`, one folder per feature under `src/services/`; `services/lib/` is gone |
| M1-17 | `vitest.config.ts`, `npm test`; the two `*.check.ts` self-checks were **ported to Vitest and deleted**, so there is one way to run tests |

**Divergence worth recording.** M1-17 offered a choice between keeping both test mechanisms or migrating to one. The decision was to migrate: `insertDense.test.ts`, `limitBreach.test.ts` and the `cache.test.ts` siblings are Vitest, `*.check.ts` no longer exists, and CI runs `npm test` rather than enumerating files. **Every reference to `*.check.ts` elsewhere in this document is historical; do not resurrect it.** `CLAUDE.md` records the same decision.

---

## Milestone 2 — Boards · ✅ **Done**

**Goal.** Move ownership from User to Board, across the schema, the RLS policies, the routing, and every query.

**Why this milestone exists.** This is the milestone the whole review is about. `docs/ARCHITECTURE.md` states three times that columns and todos must never belong to users. Today `columns.user_id` and `todos.user_id` are the ownership columns. Every remaining MVP feature — Multiple Boards, Team Members, Invitations, Task Assignment — is structurally impossible against a `user_id` foreign key, because there is no query that can share a board when there is no board. Every line of feature code written before this lands is written against a model already documented as wrong, and becomes migration surface.

**Dependencies.** Milestones 0 and 1, both fully complete. In particular: RLS must be in Git (M0-07), types must be generated (M0-08), and error surfacing must work (M1-07) — otherwise this migration proceeds blind.

**Estimated difficulty.** XL (21 tasks). Budget 2–4 weeks part-time. **Do not run other feature work in parallel.**

**Risks.**
- The highest-risk milestone in the plan. Destructive data migration touching every table.
- The UUID conversion of `todos.id` must be a single transaction.
- Board scoping changes every query key simultaneously; a missed one reads the wrong cache.
- If real users exist, this needs a backup and a maintenance window.

**Mitigation:** work on `milestone/m2-boards`. Rehearse the whole sequence end-to-end on a branch database before touching production. Strict expand → backfill → contract ordering, with the app deployed between backfill and contract.

**Success criteria.**
- `boards` exists; every column and todo has a non-null `board_id`.
- `user_id` no longer exists on `columns` or `todos`.
- `/boards/:boardId` renders that board and only that board.
- Query keys are board-scoped; two boards do not share a cache entry.
- A new signup gets a board, then four columns inside it.
- `KanbanBoard.tsx` no longer holds business logic.
- Cache-update functions are pure and callable from outside a mutation.

### Tasks

> **Sequencing is load-bearing here.** M2-01 → M2-05 are additive and safe. M2-06 → M2-08 are the migration. M2-09 → M2-12 are the app rewrite. M2-13 → M2-15 are the contraction, and must come *after* the app rewrite is deployed. M2-16 → M2-21 are cleanup and preparation.

#### M2-01 · Create `boards` — **SAFE**

- **Files:** `supabase/migrations/<ts>_create_boards.sql`, `src/types/database.ts` (regenerate).
- **DB:** `boards` — `id uuid pk default gen_random_uuid()`, `owner_id uuid → profiles.id`, `title`, `description`, `icon`, `cover_color`, `visibility text check (visibility in ('private','team')) default 'private'`, `created_at`, `updated_at`. Index on `owner_id` per `docs/DATABASE.md`.
- **RLS:** enable; interim owner-only policies (M3 replaces them with membership).
- **Breaking:** no — nothing reads it yet.
- **Test:** insert a board as user A; user B cannot select it (`curl` with B's token); regenerated types contain `boards`.
- **Commit:** `feat(db): create boards table`

#### M2-02 · Add nullable `board_id` to `columns` and `todos` — **SAFE**

Expand phase. Nullable and unconstrained, so existing code is untouched.

- **Files:** `supabase/migrations/<ts>_add_board_id.sql`, regenerate types.
- **DB:** `board_id uuid null` on both tables. **No FK, no NOT NULL yet.**
- **RLS:** unchanged.
- **Breaking:** no.
- **Test:** app behaves identically; both columns exist and are null everywhere.
- **Commit:** `feat(db): add nullable board_id to columns and todos`

#### M2-03 · Add the missing `todos` columns — **SAFE**

`docs/DATABASE.md` specifies nine fields that do not exist. Adding them now, while the table is already being rewritten, is cheap; adding them after comments and attachments hold FKs is not.

- **Files:** `supabase/migrations/<ts>_todos_task_fields.sql`, regenerate types.
- **DB:** `description text`, `priority text check (priority in ('lowest','low','medium','high','highest'))`, `due_date timestamptz`, `estimate numeric`, `archived boolean not null default false`, `creator_id uuid → profiles.id on delete set null`, `assignee_id uuid → profiles.id on delete set null`, `updated_at timestamptz`. The `on delete set null` implements the documented rule that deleting a user preserves their created tasks.
- **RLS:** unchanged.
- **Breaking:** no — all nullable or defaulted. UI lands in M5.
- **Test:** app unchanged; insert a todo with a priority outside the set → rejected by the constraint.
- **Commit:** `feat(db): add task fields to todos`

#### M2-04 · Timestamps and the shared `updated_at` trigger — **SAFE**

`docs/ARCHITECTURE.md` requires `id`/`created_at`/`updated_at` on every entity. `updated_at` is not bookkeeping — it is the conflict-resolution input M6 will need.

- **Files:** `supabase/migrations/<ts>_timestamps.sql`, regenerate types.
- **DB:** `columns.created_at`, `columns.updated_at`; one `moddatetime`-style trigger function applied to `boards`, `columns`, `todos`.
- **Breaking:** no.
- **Test:** update a column title → `updated_at` advances; update a todo → same; `created_at` never changes.
- **Commit:** `feat(db): add created_at/updated_at and a shared trigger`

#### M2-05 · Indexes — **SAFE**

Every index `docs/DATABASE.md` lists, plus what the new access pattern needs. Do this *before* the RLS rewrite — membership sub-selects run per row and are unusable without them.

- **Files:** `supabase/migrations/<ts>_indexes.sql`.
- **DB:** `boards(owner_id)`, `columns(board_id, position)`, `todos(column_id, position)`, `todos(board_id)`. Use `create index concurrently` if the tables have meaningful size.
- **Breaking:** no.
- **Test:** `explain analyze` the board-load query before and after; record both plans in the PR.
- **Commit:** `perf(db): add the indexes specified in DATABASE.md`

#### M2-06 · Backfill: personal board per user — **HIGH RISK**


The data migration. Every existing user gets one board; their columns and todos are repointed to it.

- **Files:** `supabase/migrations/<ts>_backfill_personal_boards.sql` (data migration, separate file from any schema DDL).
- **DB:** for each distinct `user_id` in `columns` ∪ `todos` ∪ `profiles`: insert a board (title "My Board", `owner_id = user_id`); `update columns set board_id = <that board>`; same for `todos`. Also backfill `todos.creator_id = user_id` while the mapping still exists — **after `user_id` is dropped this information is gone forever.**
- **RLS:** unchanged (the migration runs as service role).
- **Breaking:** no — nothing reads `board_id` yet.
- **Test:** `select count(*) from columns where board_id is null` → 0; same for `todos`; board count equals distinct user count; every user's column count and todo count matches the pre-migration numbers exactly; spot-check one user end-to-end; app still works (it still reads `user_id`).

> **HIGH RISK — backup / rollback / migration**
> **Backup:** full `db dump` immediately before. Record `count(*)` for `profiles`, `columns`, `todos` and the distinct `user_id` count in the PR body — these are the verification numbers.
> **Rollback:** this migration is *additive to data* — it writes `board_id` and inserts `boards`, and destroys nothing. Rollback is `update columns set board_id = null; update todos set board_id = null; delete from boards;` in a forward-fix migration. Safe precisely because `user_id` still exists. **This is why M2-13 must not be in this task.**
> **Migration:** rehearse on a branch database restored from the production dump. Compare all counts. Only then apply to production. Run inside a transaction; a partial backfill is worse than none.

#### M2-07 · Contract: `board_id` NOT NULL + foreign keys — **HIGH RISK**

- **Files:** `supabase/migrations/<ts>_board_id_constraints.sql`, regenerate types.
- **DB:** `alter column board_id set not null` on both; FK `columns.board_id → boards.id on delete cascade`; FK `todos.board_id → boards.id on delete cascade`; FK `todos.column_id → columns.id` — note `docs/DATABASE.md` requires that deleting a column does **not** delete todos, so this FK must be `on delete restrict` or `set null`, matching the rehoming logic already in `deleteColumn`. Decide explicitly and record the choice.
- **Breaking:** yes — inserts without `board_id` now fail. `addTodo` and `createColumn` must already send it (M2-11) or be deployed together.
- **Test:** insert without `board_id` → rejected; delete a board → its columns and todos cascade; delete a column → todos are **not** destroyed.

> **HIGH RISK — backup / rollback / migration**
> **Backup:** dump before. The `NOT NULL` will fail loudly if M2-06 missed rows — that failure is a safety net, not an error; investigate rather than forcing.
> **Rollback:** forward-fix dropping the constraints and FKs. No data loss risk; this task only adds constraints.
> **Migration:** verify `count(*) where board_id is null = 0` on production immediately before applying. Deploy the app code from M2-11 first or simultaneously.

#### M2-08 · Rewrite RLS in terms of board ownership — **HIGH RISK**

- **Files:** `supabase/migrations/<ts>_rls_board_ownership.sql`, `docs/RLS_AUDIT.md`.
- **DB:** none.
- **RLS:** every policy on `columns` and `todos` changes from `user_id = auth.uid()` to "the board is owned by `auth.uid()`". `boards` policies stay owner-based. M3 replaces all of this with membership — write it so the predicate is easy to swap.
- **Breaking:** yes — this *is* the authorization boundary.
- **Test:** owner does everything on the Smoke checklist; user B, via `curl` with a real token, cannot SELECT, INSERT, UPDATE or DELETE any of A's columns or todos; verify `upsert` still works (both INSERT and UPDATE policies present) by dragging a card and a column.

> **HIGH RISK — backup / rollback / migration**
> **Backup:** dump before (policy changes can lock tables). Capture the exact current policy definitions into the PR body first, so reversal is copy-paste.
> **Rollback:** forward-fix restoring the captured policies. Keep the old `user_id`-based policies commented in the migration file until M2-13 drops `user_id` — after that they are unrestorable, which is another reason M2-13 comes last.
> **Migration:** branch database first, full multi-user test, then production during low traffic. Watch for 403s for 15 minutes after. M1-07 makes these visible — without it you would be flying blind.

#### M2-09 · `services/boards/` — **SAFE**

- **Files:** `src/services/boards/boardsApi.ts`, `useBoards.ts`, `useBoard.ts`, `useCreateBoard.ts`, `useUpdateBoard.ts`, `useDeleteBoard.ts`, plus `queryKeys` additions.
- **React:** hooks only, no UI yet. Follow `docs/API.md` naming exactly: `getBoards`, `createBoard`, `updateBoard`, `deleteBoard`.
- **Breaking:** no.
- **Test:** temporary scratch component lists boards, creates one, renames it, deletes it; keys are board-scoped; optimistic create rolls back offline.
- **Commit:** `feat(boards): boards API and query hooks`

#### M2-10 · `/boards/:boardId` routing and board context — **MEDIUM RISK**

The route param becomes the single source of `boardId` for every query key.

- **Files:** `src/components/routes/Routes.tsx`, `src/pages/BoardPage.tsx` (new), `src/providers/BoardProvider.tsx` or a `useBoardId()` hook reading the param.
- **React:** nested route; redirect `/` → the user's first board; invalid or unauthorised `boardId` → 404 via the error boundary from M1-08.
- **Breaking:** the `/` route changes meaning.
- **Test:** `/boards/<valid>` renders that board; `/boards/<other user's board>` → 404, not a blank board or someone else's data; `/boards/not-a-uuid` → 404; `/` redirects sensibly; browser back/forward behave.
- **Commit:** `feat(boards): route the board by :boardId`

#### M2-11 · Scope every todo and column query by `boardId` — **MEDIUM RISK**

The core application-side change. Miss one and it reads the wrong cache.

- **Files:** `src/services/todos/todosApi.ts`, `src/services/columns/columnsApi.ts`, every `use*` hook in both, `src/services/queryClient/queryKeys.ts`, `src/hooks/useTodosByColumns.ts`, `src/components/kanban/KanbanBoard.tsx`.
- **DB:** none.
- **React:** `queryKeys.todos(boardId)`, `queryKeys.columns(boardId)`; `.eq("board_id", boardId)` on every read; `board_id` in every insert. Note `getColumns()` today has **no filter at all** — this task is what fixes that.
- **RLS:** none — but the client filter is defense in depth, as the Code Review Checklist requires.
- **Breaking:** yes, internally. Coordinate with M2-07.
- **Test:** create two boards with distinct cards; switch between them → no cross-contamination and no flash of the other board's cards; drag in board A → board B's cache is untouched; grep confirms no unscoped `["todos"]` or `["columns"]` remains; **also confirm the `max_rows = 1000` PostgREST cap in `supabase/config.toml` is no longer a silent truncation risk per board**.
- **Commit:** `feat(boards): scope todo and column queries by board`

#### M2-12 · Seed a board at signup — **MEDIUM RISK**

`signUp` currently seeds four columns with no board. It must seed the board first.

- **Files:** `src/services/auth/authApi.ts`.
- **DB:** consider moving the whole seed into a `SECURITY DEFINER` RPC or an `on auth.users insert` trigger — the current client-side sequence is three separate writes with no transaction, so a failure mid-way leaves a half-provisioned account. **Recommended: one RPC.**
- **React:** none.
- **Breaking:** changes the new-user path. Existing users are unaffected.
- **Test:** register a fresh account → exactly one board, exactly four columns inside it, in the right order and categories, and a profile row; simulate a failure partway → no orphaned board and no half-provisioned user; register twice with different emails → no cross-talk.
- **Commit:** `fix(auth): provision a board and its columns atomically at signup`

#### M2-13 · Drop `user_id` from `columns` and `todos` — **HIGH RISK**

The final contraction. Leaving `user_id` in place creates two competing sources of truth and every future RLS policy would have to reconcile them.

- **Files:** `supabase/migrations/<ts>_drop_user_id.sql`, regenerate types, `src/types/data.ts`.
- **DB:** `alter table columns drop column user_id;` and the same on `todos`.
- **RLS:** confirm **no** remaining policy references `user_id` before running. A policy referencing a dropped column fails at query time, not migration time.
- **Breaking:** yes, irreversibly. `IColumn.user_id` and `ISupabaseTodo.user_id` disappear; `useAddTodo`'s optimistic todo currently sets `user_id: ""`.
- **Test:** grep the entire `src/` tree for `user_id` — only `profiles` should remain; full Smoke checklist; full multi-user check.

> **HIGH RISK — backup / rollback / migration**
> **Backup:** mandatory full dump. **This is the point of no return** — once `user_id` is gone, the user↔row mapping exists only through `board_id`. Confirm M2-06 backfilled `creator_id` before proceeding.
> **Rollback:** the column cannot be restored from the schema; only PITR or the dump recovers it. Confirm PITR is enabled (checked in M0-05) and record the pre-migration timestamp.
> **Migration:** run only after M2-07, M2-08 and M2-11 are all verified in production and have been stable for at least a day. Query `pg_policies` for any surviving `user_id` reference first. Run in a transaction. Verify the full Smoke checklist immediately after — do not walk away.

#### M2-14 · Migrate `todos.id` to UUID — **HIGH RISK**

`todos.id` is an integer sequence while `columns.id` and `profiles.id` are UUIDs. Optimistic inserts mint fake ids with `Date.now()`, which collides with the real sequence space and forces the `isOptimistic` flag. Sequential ids also leak row counts. Under realtime, client-generated UUIDs are what make echo suppression an identity match instead of bespoke de-duplication.

- **Files:** `supabase/migrations/<ts>_todos_uuid.sql`, regenerate types, `src/types/data.ts`, `src/services/todos/*`, `src/components/todo/TodoItem.tsx` and `TodoItem/TodoMenu.tsx` (`todoId: number` → `string`), `src/hooks/useKanbanDnd.ts` (`beforeId`/`afterId`), `src/components/kanban/DropZone.tsx`.
- **DB:** add `id_new uuid default gen_random_uuid()`, backfill, swap the primary key, drop the old column — all in one transaction. Preserve the integer in a `legacy_id` column if the `KAN-{id}` label must stay stable for existing users.
- **Breaking:** yes — the todo id type changes throughout the frontend.
- **Test:** every existing card still loads and its identity is stable; create, rename, delete, drag; **remove the `isOptimistic` flag and confirm optimistic inserts still reconcile** (this is the payoff); `KAN-` labels behave per the decision recorded above.

> **HIGH RISK — backup / rollback / migration**
> **Backup:** mandatory dump. No FKs point at `todos.id` yet — **this is precisely why this task is in M2 and not later.** After M7 adds `comments.todo_id`, this migration becomes an order of magnitude harder.
> **Rollback:** PITR or dump restore. A partial PK swap leaves the table unusable, so the whole thing runs in one transaction — it either completes or it does not.
> **Migration:** rehearse twice on a branch database. Deploy the frontend that expects string ids in the same window; there is no version of the app that tolerates both.
> **Alternative if this feels too risky right now:** skip it, keep integer ids, and accept bespoke echo suppression in M6. Record the decision here as a deliberate deferral, not an omission — and note that the cost grows every milestone.

#### M2-15 · Drop `todos.completed`, retire `clearCompleted` — **MEDIUM RISK**

Two competing sources of truth for one concept, already out of sync: dragging a card into a Done column does not set `completed`. `docs/DATABASE.md` lists no such field and says *"Never store duplicated information."* `clearCompleted` therefore currently deletes nothing.

- **Files:** `supabase/migrations/<ts>_drop_completed.sql`, `src/services/todos/todosApi.ts`, delete `useClearCompleted.ts`, `src/types/data.ts`, any consumer.
- **DB:** `alter table todos drop column completed`.
- **React:** derive completion from the column's `category === 'done'`, which is what the board already does.
- **Breaking:** yes — the type loses a field.
- **Test:** grep for `completed` → only genuine category logic remains; cards in a done column are treated as done; the `done` flash still fires; nothing references the removed hook.
- **Commit:** `refactor(db): drop todos.completed in favour of column category`

#### M2-16 · Extract pure cache-update functions — **SAFE**

Realtime preparation, and the single cheapest thing this milestone can do for M6. `docs/API.md`: *"Realtime should later reuse the same cache update logic."* Today that logic lives inside the `onMutate`/`onSuccess` closures of `useAddTodo`, `useDeleteTodo` and `useTodoDrop`, where a channel handler cannot reach it.

- **Files:** `src/services/todos/cache.ts` (new), `src/services/columns/cache.ts` (new), plus every mutation hook in both.
- **React:** pure `(todos, row) => todos` functions — `applyTodoInserted`, `applyTodoUpdated`, `applyTodoDeleted`, `applyTodoMoved`, and the column equivalents. Mutation hooks call them; M6's channel handlers call the same ones.
- **Breaking:** no.
- **Test:** every existing mutation still behaves identically; **add `cache.check.ts` / Vitest tests for each function** — these are pure, they are on the critical path of realtime correctness, and they are exactly the kind of logic that must not be trusted by inspection.
- **Commit:** `refactor(query): extract pure cache-update functions`

#### M2-17 · Extract the drag-end business logic — **MEDIUM RISK**

`KanbanBoard.tsx` is 254 lines holding DnD orchestration, column reordering, cross-column transition derivation, four modal states, collapse state and the layout. The `onDragEnd` handler alone is 45 lines of business logic inline in JSX. `docs/FRONTEND.md`: *"Business logic should never live inside UI components."*

- **Files:** `src/hooks/useBoardDragEnd.ts` (new), `src/components/kanban/KanbanBoard.tsx`.
- **React:** move the whole `onDragEnd` body — column branch, todo branch, done-flash trigger, transition derivation.
- **Breaking:** no.
- **Test:** the entire drag section of the Smoke checklist; particularly the column-gap index shift (`from < columnIndicator ? columnIndicator - 1 : columnIndicator`) — the off-by-one is easy to lose in a move.
- **Commit:** `refactor(kanban): extract drag-end logic into a hook`

#### M2-18 · Extract column reorder and modal state — **MEDIUM RISK**

- **Files:** `src/hooks/useColumnReorder.ts` (new), `src/hooks/useBoardModals.ts` or a reducer (new), `src/components/kanban/KanbanBoard.tsx`.
- **React:** `moveColumn` and the four modal target states move out; `KanbanBoard` becomes composition plus layout.
- **Breaking:** no.
- **Test:** move columns via the menu arrows and via drag; open and close each of the three modals; confirm modal targets do not leak between columns.
- **Commit:** `refactor(kanban): extract column reorder and modal state`

#### M2-19 · `App.tsx` → `BoardPage`, delete `TodoPage` — **SAFE**

`App.tsx` is currently the board screen with a hardcoded `"My Kanban Project"` string. `TodoPage.tsx` is a five-line pass-through that renders `{children}` and nothing else.

- **Files:** `src/App.tsx` → `src/pages/BoardPage.tsx`; delete `src/components/pages/TodoPage.tsx`; move remaining pages from `components/pages/` → `pages/` per `docs/FRONTEND.md`; update `Routes.tsx`.
- **React:** the hardcoded title becomes the board's real title.
- **Breaking:** import paths.
- **Test:** build green; the board shows its actual title; profile and auth pages still route.
- **Commit:** `refactor: move pages to pages/, replace App with BoardPage`

#### M2-20 · Translate columns by category, not by title — **SAFE**

`KanbanBoard` calls `t(column.title)`. `en.json` contains `todo`, `in_progress`, `completed`, `rejected` — **not** `"To Do"`, `"In Review"` or `"Done"`, the titles actually seeded. So `t("To Do")` falls through and returns its own key. It renders correctly by accident, ru/uz users see English, and the moment a user renames a column they are naming a translation key.

- **Files:** `src/components/kanban/KanbanBoard.tsx`, `src/components/kanban/TodoDragOverlay.tsx`, `src/components/columns/*`, `src/components/i18n/locales/*.json`, `src/constants/columns.ts`.
- **React:** render user-authored titles verbatim; translate only the fixed `category` set.
- **Breaking:** seeded titles stop being translation keys.
- **Test:** switch to ru and uz → seeded columns show translated **category** labels, user-renamed columns show their literal titles; rename a column to `"todo"` → it renders as `"todo"`, not as a translated string.
- **Commit:** `fix(i18n): translate column categories, not user titles`

#### M2-21 · Per-board human-readable task key — **MEDIUM RISK**

The card shows `KAN-{id}` from the raw row id. With UUIDs that is unreadable; with integers it is globally sequential and leaks total row count.

- **Files:** `supabase/migrations/<ts>_board_task_seq.sql`, `src/services/todos/todosApi.ts`, `src/components/todo/TodoItem.tsx`.
- **DB:** `todos.board_key integer` plus a per-board counter (a `boards.next_key` column incremented in the insert RPC is simpler and adequate; a sequence per board is not).
- **Breaking:** the card label changes.
- **Test:** three cards on board A → 1, 2, 3; first card on board B → 1; delete card 2 on A, create another → 4, not 2; concurrent creates do not collide.
- **Commit:** `feat(todos): per-board task keys for card labels`
- **Note:** if M2-14 was deferred, this task can be deferred with it — they solve the same display problem.

### Expected commit order — Milestone 2

```
── expand (safe, deployable at every step) ────────────────────────────
1.  feat(db): create boards table                                  (M2-01)
2.  feat(db): add nullable board_id to columns and todos           (M2-02)
3.  feat(db): add task fields to todos                             (M2-03)
4.  feat(db): add created_at/updated_at and a shared trigger       (M2-04)
5.  perf(db): add the indexes specified in DATABASE.md             (M2-05)

── backfill (HIGH RISK, still reversible) ─────────────────────────────
6.  feat(db): backfill a personal board per user                   (M2-06)  ← HIGH

── application rewrite (deploy before contracting) ────────────────────
7.  feat(boards): boards API and query hooks                       (M2-09)
8.  feat(boards): route the board by :boardId                      (M2-10)
9.  feat(boards): scope todo and column queries by board           (M2-11)
10. fix(auth): provision a board and its columns atomically        (M2-12)
                                                    ← DEPLOY AND VERIFY HERE
── contract (HIGH RISK, one-way) ──────────────────────────────────────
11. feat(db): board_id NOT NULL and foreign keys                   (M2-07)  ← HIGH
12. feat(db): rewrite RLS in terms of board ownership              (M2-08)  ← HIGH
                                                    ← SOAK ONE DAY MINIMUM
13. feat(db): drop user_id from columns and todos                  (M2-13)  ← HIGH
14. feat(db): migrate todos.id to uuid                             (M2-14)  ← HIGH
15. refactor(db): drop todos.completed                             (M2-15)

── cleanup and realtime preparation ───────────────────────────────────
16. refactor(query): extract pure cache-update functions           (M2-16)
17. refactor(kanban): extract drag-end logic into a hook           (M2-17)
18. refactor(kanban): extract column reorder and modal state       (M2-18)
19. refactor: move pages to pages/, replace App with BoardPage     (M2-19)
20. fix(i18n): translate column categories, not user titles        (M2-20)
21. feat(todos): per-board task keys for card labels               (M2-21)
```

**The two marked checkpoints are not optional.** Deploying the application rewrite before contracting the schema is what makes commits 11–15 a revert instead of an incident.

### As built — Milestone 2 · ✅ Done

Every task landed, including the two the plan offered as deferrable (M2-14 and M2-21). Where the implementation chose differently from the task text, the choice is recorded below rather than back-written into the task.

| Task | Migration / evidence |
|---|---|
| M2-01 | `20260806090000_create_boards.sql` |
| M2-02 | `20260806092634_add_board_id.sql` |
| M2-03 | `20260806092902_todos_task_fields.sql` |
| M2-04 | `20260806093353_timestamps.sql` |
| M2-05 | `20260806093650_indexes.sql` |
| M2-06 | `20260806094242_backfill_personal_boards.sql` |
| M2-07 | `20260806095331_board_id_constraints.sql` |
| M2-08 | `20260806100619_rls_board_ownership.sql` |
| M2-12 | `20260806094000_provision_new_user.sql` |
| M2-13 | `20260807190500_drop_user_id.sql` |
| M2-14 | `20260807190600_todos_uuid.sql` |
| M2-15 | `20260807190700_drop_todos_completed.sql` |
| M2-21 | `20260807190800_board_task_keys.sql` |
| M2-09 → M2-11, M2-16 → M2-20 | `src/services/boards/`, `src/services/*/cache.ts` + tests, `src/hooks/useBoardDragEnd.ts`, `useColumnReorder.ts`, `useBoardModals.ts`, `src/pages/` |

**Decisions the tasks left open, and how they were resolved.**

- **M2-07, the `todos.column_id` FK.** Resolved as **`on delete restrict`**. `docs/DATABASE.md` requires that deleting a column must not destroy its work items, and `deleteColumn` in `columnsApi.ts` rehomes them server-side before the delete. `restrict` turns "forgot to rehome" into a loud error instead of silent data loss.
- **M2-12, provisioning.** Resolved as the recommended single RPC: `provision_new_user()`, `SECURITY DEFINER`, idempotent — it returns the caller's existing board if there is one, so a retried signup cannot mint a second board.
- **M2-14, the `KAN-` label.** No `legacy_id` column was kept. The label moved to `todos.board_key` (M2-21) instead, so the integer id was not needed for display. `isOptimistic` is gone: the client mints the uuid, `addTodo` upserts, and the optimistic row *is* the stored row.
- **M2-21, key allocation.** Built as a **`BEFORE INSERT` trigger** (`todos_assign_board_key`) reading `boards.next_key`, not as an insert RPC as the task text suggested. The trigger is the stronger choice and is now the project's precedent for "an invariant every writer must satisfy": an RPC only constrains callers who use it, a trigger constrains all of them. A unique index on `(board_id, board_key)` backs it, and keys are never reused.
  - Consequence worth knowing before M3-16: inserting a work item performs an `UPDATE` on `boards`. It succeeds for a non-owner **only** because the trigger is `SECURITY DEFINER` and bypasses the owner-only `boards` UPDATE policy. The Editor create path depends on that, which is why M3-16 tests it explicitly.
- **M2-08's swap point held.** `accessible_board_ids()` was widened to membership in M3-05 without touching a single policy definition, exactly as designed. The pattern is worth repeating.

**Known leftover.** The `KAN-` prefix is hardcoded in `src/components/todo/TodoItem.tsx`. A per-board prefix is a Jira-shaped requirement; the schema decision is recorded in Appendix D rather than being built now.

---

## Milestone 3 — Members & Roles · 🔶 **In progress**

**Goal.** Replace row ownership with the permission model defined in Part II — `viewer → editor → admin → owner`, enforced in the database, with the Owner protected against every membership operation.

**Why this milestone exists.** Boards without members are just namespaced personal boards. Before M3, "can I edit this?" was answered by "do you own the board"; in the target it is answered by a role lookup, and that lookup must happen in the database, not in React. `docs/ARCHITECTURE.md`: *"Frontend authorization is only for UI convenience."*

**Dependencies.** Milestone 2, fully complete and soaked. ✅

**Estimated difficulty.** L→XL (19 tasks: 4 done, 1 applied with verification outstanding, 14 remaining). Grew during the 2026-08-10 audit: the original 12 tasks assumed membership could be written from the client and assumed the member list was readable. Neither is true — see *Where the original M3 was wrong*, below.

**Risks.**
- **The RLS recursion trap.** A policy on `board_members` that itself queries `board_members` causes infinite recursion in Postgres and a hard 500. The remedy — `SECURITY DEFINER STABLE` helper functions — is in place from M3-02 and every later policy must use it.
- **Privilege escalation through membership mutation.** Every membership RPC is a privilege-granting function. An admin who can edit an admin, or set their own role, defeats the whole hierarchy. M3-14 and M3-15 are the two highest-risk tasks in the milestone and neither may be merged on a UI test.
- Membership sub-selects run per row. The M2-05 indexes and both `board_members` indexes exist, which is the structural mitigation. Measuring it at scale is deferred (PH-03) — a fixture board of 21 work items cannot show a cliff.

**Every remaining M3 task is Tier A** under Rule 6: functions, triggers, policies and one constraint, touching no existing row. None needs a dump, a rehearsal or PITR, and **none is blocked on backup infrastructure.** Their real risk is authorization logic, which is mitigated by review and by M3-16 — not by recovery tooling.

**Success criteria.**
- Every board has exactly one `owner` row in `board_members`, and `boards.owner_id` agrees with it.
- All RLS on boards, columns and work items routes through the helper functions.
- Every cell of both matrices in *Permission Model* has a passing REST-level test (M3-16).
- Owner immutability invariants I1–I5 hold against a direct API attempt by an admin, and against the Owner's own attempt.
- No client-writable policy exists on `board_members`.
- The board still loads and drags without visible regression on the fixture board. *Load-testing at 500 cards / 10 members is deferred to PH-03 — it is a production-scale question and this milestone has no production scale to measure.*

### Where the original M3 was wrong

Found in the 2026-08-10 audit, against the applied migrations. Recorded because the corrections change task scope, not merely wording.

1. **M3-06 as written implied direct client writes to `board_members`.** `board_members` has RLS on with a **self-read policy only** — no INSERT, UPDATE or DELETE policy — which is correct and deliberate. Hooks named `useAddMember` / `useUpdateMemberRole` / `useRemoveMember` therefore cannot call PostgREST tables; they must call RPCs. M3-06 is re-scoped and M3-14 is new.
2. **M3-07 (member list) could not have worked.** A member can only read *their own* `board_members` row, and `profiles` carries one `FOR ALL … USING (auth.uid() = id)` policy, so a member cannot read a teammate's name or avatar either. Two read policies are missing. M3-13 is new and blocks M3-06, M3-07 and M3-08. It does **not** block M3-09 — permission gating reads only the caller's own membership row, which the self-read policy already allows.
3. **M3-08 said "guard against removing the last owner".** That is a weaker rule than the model requires. The Owner is immutable — not merely "not the last one" — and the guard belongs in the database against every writer, not in a UI check. M3-15 is new.
4. **Nothing owned the Admin-versus-Owner boundary.** The single most important negative rule in the model ("an admin must never modify the Owner") had no task and no test. M3-14, M3-15 and M3-16 now carry it.
5. **The role matrix was never going to be verified by the tasks as written.** M3-05's one-line test asked for "all four roles against all four verbs" as a side note on a migration task. That is a milestone-gating verification, not a footnote. M3-16 is new.
6. **There is currently no way to create an editor or admin membership at all.** The only writer to `board_members` is the `add_owner_membership` trigger. The existing viewer fixture was seeded out-of-band. So M3-16 cannot run before either M3-14 lands or fixtures are seeded with the service role — the dependency is stated in the task.

### Tasks

#### M3-00 · ~~Enable PITR~~ — **DEFERRED to Part V (PH-01)** — decided 2026-08-10

**This task no longer exists in M3 and blocks nothing.** It is retained as a numbered entry so the decision is visible rather than silently dropped.

It was written as a prerequisite for M3-14, M3-15 and M3-17 on the reasoning that Rule 6 demanded "a real recovery path" for migrations that replace policies or grant privileges. Investigation showed that reasoning does not hold:

- **PITR cannot be enabled with current access.** The Supabase CLI has no command for it — `supabase backups` exposes only `list` and `restore`, and `config.toml` has no PITR key. It is a billing add-on set in the dashboard or via `PATCH /v1/projects/{ref}/billing/addons`.
- **It requires the Pro plan plus a Small compute add-on plus the add-on itself** — roughly **$125/month, recurring, and explicitly not covered by the spend cap**. The compute change alone causes up to ~2 minutes of downtime.
- **None of the tasks it "blocked" can lose data.** They create functions, triggers, policies and a constraint. All are Tier A under Rule 6 and reverse with forward-fix SQL.
- **PITR's recovery window starts at enablement**, so it could never have protected anything already in the database, and a PITR restore is a whole-project rollback that destroys every later write — the wrong instrument for reverting a policy.

Spending $1,500/year to insure a fixture dataset of two accounts and 21 work items, while blocking the permission model on it, is the wrong trade. **Deferred to PH-01 with a stated reopen trigger.**

- **Replaced by:** nothing. M3-13 → M3-18 carry their own Tier A rollback (prior definition captured verbatim in each migration file), which is what the project has done since M2-08 and what actually reverses these changes.
- **Reopen when:** the project takes real users, or before the next Tier B migration (M6-05 drops `position`).

#### M3-01 · Create `board_members` — **SAFE** — ✅ Done
`board_id`, `user_id`, `role text check (role in ('owner','admin','editor','viewer'))`, `joined_at`, PK `(board_id, user_id)`, indexes on both columns per `docs/DATABASE.md`. RLS enabled with a deliberately minimal self-read policy for now.
**Test:** insert a membership; a user can read their own rows; regenerated types include the table.
**Commit:** `feat(db): create board_members`
> **As applied** — `20260810090000_create_board_members.sql`, commit `c19ab03`. Both foreign keys cascade. `role` has no default, deliberately: a membership without an explicit role is a call-site bug, and `'viewer'` as a default would hide it. The only policy is `"Users select own memberships"` — self-read. **There is no INSERT/UPDATE/DELETE policy and there must never be one** (Permission Model, rule 4).
> **Divergence:** the migration created only `board_members_user_id_idx`. The `board_id` index the task called for was missed and added by a follow-up, `20260810094000_add_board_members_board_id_index.sql` (commit `4d2b04e`). Both indexes exist now. It matters because `is_board_member`/`board_role` filter on `board_id` on every policy evaluation.

#### M3-02 · `is_board_member` / `board_role` helpers — **MEDIUM RISK** — ✅ Done
`SECURITY DEFINER STABLE` functions with an explicit `search_path`. Every future policy calls these instead of sub-selecting `board_members` — this is the recursion remedy and it must exist before any policy uses it.
**Test:** call each as two different users; confirm no recursion; confirm `STABLE` lets the planner cache within a statement; `explain analyze` a board fetch.
**Commit:** `feat(db): board membership helper functions`
> **As applied** — `20260810093000_board_membership_helpers.sql`, commit `403fd5e`. Both are `language sql`, `stable`, `security definer`, `set search_path = ''`, revoked from `public`/`anon` and granted to `authenticated` and `service_role`. `board_role(uuid)` returns `NULL` for a non-member, and `NULL in (…)` is `NULL`, which both `USING` and `WITH CHECK` treat as failure — non-membership is denied by the same expression that grades roles, with no separate branch to forget.
> 🔶 **Outstanding:** the `explain analyze` half of the test was not run. It is folded into M3-12.

#### M3-03 · Backfill owner memberships — **HIGH RISK** — ✅ Done
Every existing board gets an `owner` row for its `owner_id`.
**Test:** `select count(*) from boards b where not exists (select 1 from board_members m where m.board_id = b.id and m.role = 'owner')` → 0.
> **Backup:** dump before. **Rollback:** `delete from board_members` — purely additive, so reversal is clean. **Migration:** run before M3-04/M3-05, or the new policies lock every existing owner out of their own board.
**Commit:** `feat(db): backfill owner memberships for existing boards`
> **As applied** — `20260810100000_backfill_owner_memberships.sql`, commit `fc7372a`. **No dump was taken**: Docker and a direct database connection were unavailable in that session. The migration inserts only, with `on conflict do nothing`, and reverses with a single `delete`, so it was judged recoverable by forward-fix. That judgement was specific to this migration — see Rule 6 before reusing it.
> **Divergence, and an important one:** the task described a backfill only. What shipped also added `add_owner_membership()` (`SECURITY DEFINER`, revoked from `public`/`anon`/`authenticated`) and the `boards_add_owner_membership` AFTER INSERT trigger. That is what makes "every board has an owner membership" an **invariant for future boards** rather than a one-time fact about existing ones. The trigger is the only writer that can mint a board's first membership, because that row cannot be authorized by membership — there is none yet. M3-15 builds on this.

#### M3-04 · Boards RLS via helpers — **HIGH RISK** — ✅ Done
**Test:** owner full access; member read access; non-member no access, verified by `curl`.
> **Backup:** dump; capture current policies into the PR. **Rollback:** forward-fix restoring the captured M2-08 policies. **Migration:** branch DB, full multi-user test, then production off-peak; watch 403s for 15 minutes.
**Commit:** `feat(db): board RLS via membership helpers`
> **As applied** — `20260810110000_boards_rls_via_membership.sql`, commit `1419dee`. **Only the SELECT policy changed**: `"Users select own boards"` was replaced by `"Members select accessible boards"`, `using (owner_id = auth.uid() or is_board_member(id))`. INSERT, UPDATE and DELETE on `boards` remain **owner-only** from M2-01. That is a deliberate narrow scope, not an omission, but it leaves board settings unassigned to a role — M3-17 closes it.
> The `owner_id = auth.uid()` disjunct is kept alongside the membership check on purpose: it is a safety net. If an owner's membership row ever went missing, they would still reach their own board.
> **No pre-migration dump was taken** (same session constraint as M3-03). This one *replaced a policy*, so under Rule 6 it should have had one; the old definition survives only because it is in the M2-01 migration file.

#### M3-05 · Columns and todos RLS via helpers — **HIGH RISK** — 🔶 Applied, verification outstanding
Read for any member; write for `editor` and above; `viewer` read-only.
**Test:** all four roles against all four verbs on both tables, via `curl`; then the full Smoke checklist as `owner` and again as `editor`.
> **Backup / Rollback / Migration:** as M3-04. Additionally confirm `upsert` paths still work for `editor` — both INSERT and UPDATE policies are required.
**Commit:** `feat(db): column and todo RLS via membership helpers`
> **As applied** — `supabase/migrations/20260810120000_columns_todos_rls_via_membership.sql`, committed as `3c3eec8`. It was applied before it was committed, which Rule 1 exists to prevent; the gap is closed and `supabase migration list` confirms local and remote agree on all 23 versions.
> What it does: widens `accessible_board_ids()` to `boards.owner_id ∪ board_members.user_id` — the M2-08 swap point, used exactly as designed, with **no policy definition edited** for reads. The two SELECT policies are renamed to `"Members select …"`. The six write policies are dropped and recreated as `"Editors and above insert/update/delete todos"` and the three column equivalents, each `using`/`with check` on `board_role(board_id) in ('owner','admin','editor')`.
> **Read and write use different predicates on purpose, and this is worth understanding before changing either.** Reads go through `accessible_board_ids()`, which includes `boards.owner_id`; writes go through `board_role()`, which reads `board_members` only. An owner with no membership row could therefore read but not write. In practice M3-03's backfill and trigger make that state unreachable, and M3-15 makes it an enforced invariant.
> **Verified:** read behaviour only. On the current fixture — board `5819a045-0bca-4a8a-9dc1-a67f7911b854`, owner `qwerty@gmail.com`, viewer `qqq@gmail.com` — both accounts see the same 5 columns and 21 work items, and the viewer cannot mutate.
> **Not verified — and not to be claimed as verified:** the Editor path, the Admin path, the upsert/reorder path for any non-owner, and every REST-level denial. No editor or admin membership exists yet, because nothing can create one. The whole matrix is M3-16.
> **No pre-migration dump was taken.** It replaced eight policies and touched no row — Tier A under Rule 6, reversible by the forward-fix SQL captured in the migration file itself. Correct as applied.

#### M3-13 · Board roster RPC (`board_roster`) — **MEDIUM RISK** — 🔶 Applied 2026-08-11, verified in the live schema, role matrix outstanding

**New in the 2026-08-10 audit. This blocks M3-06, M3-07 and M3-08** — none of them can render a member list against today's policies. It does not block M3-09, which reads only the caller's own row.

Today `board_members` is self-read only and `profiles` carries a single `FOR ALL … USING (auth.uid() = id)` policy. A member can see neither who else is on the board nor their names and avatars. This task closes that gap **without widening either policy**.

**The approved boundary is an RPC, not a policy (Option B, decided 2026-08-11).** RLS filters *rows*, not *columns*. `profiles` carries `email` and `bio`, and any co-member SELECT policy hands both over whatever the client asks for — `fetchProfile` already issues `select("*")`. A `SECURITY DEFINER` function is the only place the database can state which columns leave it, so the function's return list is the exposure boundary.

- **Files:** `supabase/migrations/20260811090000_membership_roster.sql`, `docs/RLS_AUDIT.md`.
- **DB:**
  - New `public.board_roster(p_board_id uuid)` — `language plpgsql`, `stable`, `security definer`, `set search_path = ''`, every identifier schema-qualified.
  - Two ordered guards: raise `28000` if `auth.uid()` is null; `return` an empty set unless `public.is_board_member(p_board_id)`. Membership goes through the M3-02 helper, never a sub-select on `board_members` (recursion trap, Enforcement rule 3).
  - Returns exactly six columns: `id`, `username`, `full_name`, `avatar_url`, `role`, `joined_at`. **`email` and `bio` are never exposed.** Changing this list is a product decision, not a refactor.
  - Grants: `revoke all … from public, anon`; `grant execute` to `authenticated` and `service_role`.
  - `board_members` table privileges narrowed in the same migration: `anon` revoked outright; `authenticated` revoke-all-then-`grant select`. The captured production ACL showed `anon` and `authenticated` each holding all eight privileges including `TRUNCATE`, which RLS does not filter. Client writes were previously blocked only by the absence of a policy; this makes it two independent mistakes deep. `SELECT` is retained because M3-01's self-read policy and M3-09's `usePermissions` both need it. **`service_role` untouched.**
- **NOT in this task:** `profiles` RLS — unchanged, still self-only; **no broad co-member SELECT policy is added**. `board_members` policies — unchanged, M3-01's self-read stays. Membership mutations are M3-14's `SECURITY DEFINER` RPCs.
- **Breaking:** no, additive. But it changes what one user can learn about another — treat the six-column list as a product decision.
- **Test (REST-level, a real JWT per role):**
  - Owner and viewer of the same board: `POST /rest/v1/rpc/board_roster` returns every member, each carrying **exactly** those six keys. Assert on the payload *keys*, not only the values — `email` and `bio` must be absent.
  - Non-member with a real board id → `200 []`. Non-member with a fabricated uuid → `200 []`, byte-identical. If those differ the function is an existence oracle and the task has failed.
  - No `Authorization` header → `42501 permission denied for function board_roster`, stopped by the grant rather than by guard 1.
  - Co-member: `GET /rest/v1/profiles?id=eq.<teammate>&select=*` still returns `[]`. This is the property the RPC exists to preserve.
  - Member: `GET /rest/v1/board_members?board_id=eq.<board>` still returns exactly **one** row, the caller's own. Correct under this design.
  - Member: `POST /rest/v1/board_members` → `42501` — privilege denied, not merely an RLS filter.
  - A user removed from the board immediately stops seeing the roster.
- **Follow-up:** run `npm run db:types` after applying so `board_roster` reaches the generated `Database` type before M3-06 starts. **`returns table` carries no nullability**, so `username`, `full_name` and `avatar_url` — nullable in `profiles` — will likely generate as non-null. Narrow at the API-function boundary rather than trusting the generated type.
- **Commit:** `feat(db): board roster RPC with explicit column exposure`
> **Tier A** — adds one function and adjusts privileges, touches no row. The production ACL is captured verbatim in the migration file; rollback is a forward-fix dropping the function and restoring the captured grants. No dump, no blocker.

#### M3-14 · Membership mutation RPCs — **HIGH RISK** — ✅ Applied 2026-08-11, verified 67/67

**New in the 2026-08-10 audit.** This is the task that makes membership manageable at all, and it is a privilege-granting surface. Review it line by line.

`board_members` has no client write policy and must not get one. Every mutation is a `SECURITY DEFINER` function that performs its own authorization against the *Membership matrix* in Part II.

- **Files:** `supabase/migrations/<ts>_membership_rpcs.sql`, regenerate types.
- **DB:** four functions, all `SECURITY DEFINER`, `set search_path = ''`, revoked from `public`/`anon`, granted to `authenticated`:
  - `add_board_member(p_board_id uuid, p_user_id uuid, p_role text)`
  - `set_member_role(p_board_id uuid, p_user_id uuid, p_role text)`
  - `remove_board_member(p_board_id uuid, p_user_id uuid)`
  - `leave_board(p_board_id uuid)` — the self-removal path; see the exception below
- **Authorization each function must enforce, in this order:**
  1. Caller is authenticated; otherwise raise.
  2. Caller's role on the board comes from `board_role(p_board_id)`, never from an argument. A caller with no role on the board is denied outright.
  3. **The target is never the Owner** — neither the row whose role is `owner`, nor `boards.owner_id`. Denied for every caller, including the Owner themselves (I2, I3, I4). This check comes before the caller-rank check deliberately: it must not be reachable past an `admin or owner` gate.
  4. `p_role` is never `'owner'`. Ownership transfer is not a membership operation (I6).
  5. Caller is `admin` or `owner`; otherwise raise — **except for the self-removal branch below.**
  6. An `admin` caller may only act on a target whose current role is `viewer` or `editor`, and may only set `p_role` to `viewer` or `editor`. An admin acting on another admin, or on themselves via these functions, is denied.
  7. An `owner` caller may act on any non-owner target and may set any non-owner role.
- **Self-service exception, and it is the one branch that skips step 5:** removing *yourself* is allowed for admin, editor and viewer, and denied for the Owner (step 3 already denies it). **Build it as a separate `leave_board(p_board_id)` function rather than a branch inside `remove_board_member`.** A rule that reads "remove_board_member happens to allow self" is one refactor away from disappearing, and the two operations have genuinely different authorization: one is administration, the other is consent. M8-09 is its UI.
- **Breaking:** no — nothing calls these yet.
- **Test:** every row of the *Membership matrix* and every invariant, called directly as RPC with each role's own JWT. Both the ✅ and the ❌ cells. Specifically: admin removing the owner, admin demoting the owner, admin promoting themselves to owner, admin editing another admin, owner demoting themselves, editor calling any of the three, a non-member calling any of the three, and a caller passing a `p_board_id` they have no membership on. Concurrent double-call is idempotent, not duplicating.
- **Commit:** `feat(db): membership mutation RPCs with role enforcement`
> **HIGH RISK — privilege-granting.** The risk here is a **logic flaw**, not data loss. No backup mitigates a function that lets an admin demote the Owner; only reading it does.
> **Tier A** — creates four functions, touches no row. **Rollback:** forward-fix dropping the four functions; audit `board_members` for any row they created, using `joined_at` as the window. **No dump, no PITR, no prerequisite task.**
> **What this task actually requires:** review every authorization branch against the matrix before applying, and test the failure branches **first**. A flaw here hands over a board. Do not merge on a UI test.

#### M3-15 · Owner immutability in the database — **HIGH RISK** — ✅ Applied 2026-08-11, verified 37/37

**New in the 2026-08-10 audit.** M3-14 enforces the rules for callers who use it. This task enforces them for **every** writer — a future RPC, a migration, a careless `service_role` script, an admin screen written in six months.

The M2-21 `todos_assign_board_key` trigger is the precedent: an invariant every writer must satisfy belongs in a trigger, not in one function's body.

- **Files:** `supabase/migrations/<ts>_owner_immutability.sql`.
- **DB:** a `BEFORE UPDATE OR DELETE` trigger on `board_members` that raises when the affected row is the board's Owner (I2, I3). Plus enforcement that `boards.owner_id` and the `owner` membership row cannot drift apart (I5) — a `BEFORE UPDATE` trigger on `boards.owner_id`, or a documented decision that `owner_id` is immutable until ownership transfer exists.
- **Decide and record:** whether the trigger exempts `service_role`. Recommendation: **no exemption.** An exemption is a hole that exists precisely when someone is operating under pressure. Ownership transfer, when it is built, should be a function that lifts the invariant explicitly and transactionally, not a role that is quietly outside it.
- **Breaking:** yes for any writer that currently deletes owner rows. Nothing in `src/` does; confirm no migration does either.
- **Test:** as `service_role` — the most privileged path there is — attempt `delete from board_members where role = 'owner'`, `update … set role = 'viewer'` on an owner row, and `update boards set owner_id = <someone else>`. Each raises. Then re-run M3-14's owner tests and confirm they still fail at the RPC layer, so both layers hold independently. Then confirm a normal membership change to a viewer/editor/admin row still succeeds — an over-broad trigger that blocks everything would pass the negative tests.
- **Commit:** `feat(db): enforce owner immutability for every writer`
> **HIGH RISK — changes what the database will accept.** The failure mode is an over-broad trigger breaking signup, which is an availability bug caught in seconds, not data loss.
> **Tier A** — creates triggers, touches no row. **Rollback:** forward-fix dropping the triggers. **No dump, no PITR, no prerequisite task.**
> **Sequencing that does matter:** apply after M3-14 so the RPC tests can be re-run against it, and verify `provision_new_user()` and `add_owner_membership()` still work — signup creates a board, which creates an owner row, and a badly scoped trigger would break account creation.

#### M3-17 · Board settings by role — **MEDIUM RISK** — 🔶 Applied 2026-08-12, verification outstanding

> **State.** `supabase/migrations/20260811120000_boards_settings_by_role.sql` applied 2026-08-12. A policy is invisible in the generated types, so the apply succeeding is the only evidence so far — `scripts/verify-m3-16-role-matrix.sql` §5, §6 and §11 are what confirm the behaviour, and they have not been run.
> **What shipped that the task body below does not describe:** the task asks the UPDATE policy's `WITH CHECK` to keep `owner_id` unchangeable. It cannot — `USING` sees the old row and `WITH CHECK` the new one, and no policy expression can compare them. That rule is enforced instead by M3-15's `boards_owner_immutable` trigger, which landed after this task was written. §3 of the migration records the reasoning and the rejected column-privilege alternative.

**New in the 2026-08-10 audit.** M3-04 changed only the SELECT policy on `boards`; UPDATE and DELETE are still owner-only from M2-01, which no longer matches the model.

Implements the two decisions recorded in *Permission Model → Decisions this section makes*: **admin and owner may update a board; only the owner may delete it.**

- **Files:** `supabase/migrations/<ts>_boards_settings_by_role.sql`.
- **DB / RLS:** replace `"Users update own boards"` with an admin-or-owner predicate via `board_role(id)`. Leave DELETE owner-only. Leave INSERT as-is — creating a board makes you its owner by definition.
- **Watch:** `updateBoard` in `boardsApi.ts` already excludes `owner_id` from its patch type, and the UPDATE policy must keep `owner_id` unchangeable through this path (I5, I6). A `WITH CHECK` that permits changing `owner_id` would be an ownership transfer with no ceremony.
- **Test:** admin renames a board → succeeds; admin deletes → denied; editor renames → denied; admin changes `owner_id` via PATCH → denied; owner deletes → succeeds and cascades.
- **Commit:** `feat(db): board settings editable by admins, deletable by the owner`
> **Tier A** — replaces one policy, touches no row. Capture the M2-01 definitions verbatim in the migration file; rollback is a forward-fix restoring them. No dump, no blocker.

#### M3-18 · Cross-board integrity constraint — **MEDIUM RISK** — 🔶 Applied 2026-08-12, verification outstanding

> **State.** `supabase/migrations/20260811130000_todo_column_same_board.sql` applied 2026-08-12. **Two things the apply itself proves, against real production data:** the preflight found zero cross-board work items, and `add constraint` succeeded — which validates the composite key across every existing row. The behavioural half is `scripts/verify-m3-16-role-matrix.sql` §7 and has not been run.
> **One decision the task left open:** the constraint name `todos_column_id_fkey` is reused rather than renamed to match the now-composite key. It is not private to the database — `db:types` writes it into `src/types/database.ts` and PostgREST accepts it as an embedding hint, so renaming would be a generated-types diff and a possible runtime break for a tidier label.

**New in the 2026-08-10 audit.** A real gap, reachable by any editor through the API.

`todos.board_id` and `todos.column_id` are independent foreign keys. Nothing requires the column to belong to the same board as the work item. An editor on board A can `PATCH` one of A's work items with a `column_id` from board B: `USING` and `WITH CHECK` both evaluate `board_role(board_id)` on A, both pass, and the result is a work item that renders on neither board correctly.

- **Files:** `supabase/migrations/<ts>_todo_column_same_board.sql`.
- **DB:** the standard shape is a composite foreign key — add a `unique (id, board_id)` on `columns` and make `todos (column_id, board_id)` reference it. That is one constraint, enforced for every writer, with no function to maintain. A trigger is the fallback if the composite FK conflicts with something.
- **Preflight:** count existing violations before adding the constraint; it cannot be added while any exist. If there are any, they are their own fix-up migration first.
- **Breaking:** only for writes that were already producing invalid rows.
- **Test:** preflight count is 0; a `PATCH` setting a foreign board's `column_id` is rejected; a normal drag across columns within a board still works; `deleteColumn`'s rehoming upsert still works.
- **Commit:** `feat(db): a work item's column must belong to its board`
> Do this **before** M3-10. It removes most of M3-10's security rationale and leaves it a transactional-integrity task, which is a smaller and clearer thing to build.

#### M3-06 · `services/members/` — **SAFE** — ⬜ Not started
`membersApi.ts` + `useBoardMembers`, `useAddMember`, `useUpdateMemberRole`, `useRemoveMember`. Keys `["members", boardId]` via the factory.
**Commit:** `feat(members): members API and query hooks`
> **Re-scoped 2026-08-10, revised 2026-08-11 for M3-13's RPC boundary.** The read hook calls `supabase.rpc("board_roster", { p_board_id: boardId })` — **never** `.from("board_members").select()`. That table is self-read only and stays that way; a direct query returns the caller's own row and nothing else, which would render a one-person member list with no error to signal it. **The three mutation hooks call the M3-14 RPCs via `supabase.rpc(...)` — never `.from("board_members").insert/update/delete()`.** There is no policy that would let those succeed, and adding one is prohibited (Permission Model, rule 4).
> Add `queryKeys.members(boardId)` to the factory — no inline key literals, per the Code Review Checklist.
> **Depends on:** M3-13 (the `board_roster` RPC), M3-14 (the mutation RPCs).
> **Test:** the list renders every member for a member of the board; each mutation hook rolls back optimistically on a denied RPC and surfaces the error through the M1-07 toast path.

#### M3-07 · Member list UI — **SAFE** — ⬜ Not started
Avatars, names, role badges, joined date. Read-only.
**Commit:** `feat(members): board member list`
> **Depends on:** M3-13. A teammate's `profiles` row is not readable directly and will not become readable — the data comes from `board_roster`, which returns exactly `id`, `username`, `full_name`, `avatar_url`, `role`, `joined_at`. Render from those six and no others; there is no `email` or `bio` to fall back on. `username`, `full_name` and `avatar_url` are nullable in the base table, so the UI must handle a null name and a missing avatar.
> The Owner is visually distinguished from admins: it is the one role no control can change, and the UI should say so rather than offering a disabled button with no explanation.

#### M3-08 · Role management UI — **MEDIUM RISK** — ⬜ Not started
Change role, remove member, with optimistic update and rollback. The Owner is never a target of either control.
**Test:** promote, demote, remove; attempt to target the Owner → no control exists in the UI **and** the operation is refused by the database; a removed member loses access on their next request.
**Commit:** `feat(members): manage roles and remove members`
> **Re-scoped 2026-08-10.** The original wording was *"guard against removing the last owner"*, which understates the rule and implies a board can have several owners. **A board has exactly one Owner and the Owner is immutable** (I1–I4) — the UI offers no control that targets them at all, for any caller. Enforcement is M3-14 and M3-15; this task only makes the UI honest about it. The task body above was corrected rather than annotated, because this task has not been started and a stale instruction here would be implemented.
> The role selector an **admin** sees offers `viewer` and `editor` only, and is absent on rows held by an admin or the Owner. The selector an **owner** sees offers `viewer`, `editor`, `admin` — never `owner`.
> **Test additions:** as an admin, no control exists that targets the Owner or another admin; a role change that the database rejects rolls back visibly rather than sticking optimistically; the actor's own row cannot be escalated.

#### M3-09 · Frontend permission gating — **SAFE** — ⬜ Not started
`usePermissions()` derived from the current user's role. Hide destructive affordances from viewers. UI convenience only — RLS remains the boundary.
**Test:** as a `viewer`, the create button, drag handles, column menu and delete are absent; bypassing the UI still fails at the database.
**Commit:** `feat(members): gate UI affordances by role`
> **Re-scoped 2026-08-10.** `usePermissions(boardId)` reads the current user's role from their own `board_members` row — readable under M3-01's self-read policy, so this does **not** depend on M3-13. Derive booleans (`canEditContent`, `canManageMembers`, `canManageAdmins`, `canDeleteBoard`) from the matrices in Part II, in **one** module, so a rule lives in one place. Do not scatter `role === "admin"` comparisons through components.
> Gate the drag sensors too, not only the buttons: a viewer who can start a drag gets an optimistic move that silently reverts, which reads as a broken board rather than as a permission.
> **This is UX. It is never the enforcement.** Every gated action must already be denied by M3-05, M3-14, M3-15 or M3-17 with the UI bypassed entirely.

#### M3-10 · `reorder_todos` RPC — **MEDIUM RISK** — ⬜ **Deferred to M6** (decided 2026-08-10)
Replaces the client-supplied bulk `upsert`, which is an unbounded client-controlled write of `column_id` and `position` across arbitrary row ids. The RPC validates membership and renumbers server-side in one transaction.
**Test:** drag within and across columns; attempt to reorder a board you are not a member of → rejected; attempt to inject a foreign todo id into the payload → rejected.
**Commit:** `feat(db): transactional reorder_todos RPC`
> **Deferred, with the reason, per Definition of Done.** It keeps its ID and stays documented here; it is **not** part of M3's Definition of Done and does not block the milestone. It is re-evaluated at M6-04 and appears in M6's commit order.
> **Why.** Most of the security case is already covered: M3-05's `USING` clause is evaluated against each *existing* row, so a foreign work item id in the payload is rejected by the policy, and M3-18 closes the cross-board `column_id` gap. What remains is transactional integrity — a partial bulk upsert leaves a column with duplicate or gapped positions — and payload size. **M6-04 replaces whole-column renumbering with a single-row rank write, which removes both.** Building this now means building something M6 deletes.
> **The trigger to reopen it:** M6-04 ships and a bulk renumber path still exists (rebalancing, or an import). If it is built at any point, it must take the board id and derive everything else server-side.

#### M3-11 · `delete_column` RPC — **MEDIUM RISK** — 🔶 Backend applied 2026-08-12; frontend not started

> **State.** `supabase/migrations/20260811140000_delete_column_rpc.sql` applied 2026-08-12; `delete_column` is present in the regenerated types. Behaviour is `scripts/verify-m3-16-role-matrix.sql` §10 and has not been run.
> **The half that is not done is the frontend half, and it belongs to the Lead:** `deleteColumn` in `src/services/columns/columnsApi.ts` still performs the four round-trips. Swapping it to `supabase.rpc('delete_column', { p_column_id, p_move_to_column_id })` is what makes the RPC live. Nothing was removed, so the old path keeps working until then.
> **Why the row count is checked inside the function.** An RLS denial on UPDATE or DELETE is zero rows, not an error. Without the check a viewer would call this, change nothing, and be told it worked — the exact silent failure the task exists to remove, one layer up. The zero-row `DELETE` raises 42501, and that *is* the authorization check: not "what role is the caller" but "did the write actually happen".
The current path is four sequential round-trips; a failure between the rehoming upsert and the delete leaves an empty column the user believes is gone.
**Test:** delete a column with cards → all cards arrive at the destination in order, column gone; simulate a mid-operation failure → nothing is half-applied.
**Commit:** `feat(db): transactional delete_column RPC`
> Unlike M3-10 this does not go away with M6 — rehome-then-delete is inherently multi-statement. Build it as `SECURITY INVOKER` so the caller's own RLS still applies, and it inherits the editor+ gate from M3-05 for free. If it must be `SECURITY DEFINER` for any reason, it takes on its own `board_role` check (Permission Model, rule 5).
> Verify the destination column belongs to the same board as the one being deleted — the same class of gap M3-18 closes for work items.

#### M3-16 · Role matrix acceptance verification — **SAFE** (verification) — 🔶 Harness authored 2026-08-12, **NOT RUN**

**New in the 2026-08-10 audit. This task gates the milestone: M3 is not done until it passes.**

Execute the entire *Multi-user and roles* section of the Testing Checklist and record the results. It is deliberately a separate task with its own commit, because a verification folded into a feature task is a verification that gets skipped.

- **Fixtures:** four accounts on one board, one per role, plus a fifth non-member. The existing fixture is board `5819a045-0bca-4a8a-9dc1-a67f7911b854` with owner `qwerty@gmail.com` and viewer `qqq@gmail.com`; editor, admin and non-member accounts still need creating.
- **Dependency, and it is a real one:** nothing can currently create an editor or admin membership — `board_members` has no write policy and the only writer is the owner trigger. Either land M3-14 first and mint the fixtures through it (preferred — it tests the RPC at the same time), or seed them with the service role for an interim run of the content matrix only. **State in the PR which was used**; a matrix verified against service-role-seeded fixtures says nothing about M3-14.
- **Method:** direct PostgREST and RPC calls with each role's own JWT. Every ❌ cell needs an observed denial — an empty array for a filtered read, `42501` or 0 rows affected for a write. A UI screenshot is not evidence.
  - **Method as built, and the deviation is deliberate.** `scripts/verify-m3-16-role-matrix.sql` sets `request.jwt.claims` directly and does `set local role authenticated` per case, the same mechanism M3-14 and M3-15 already use — six roles across three boards, no tokens to mint and no fixture accounts to create. It exercises the policies *and* the table privileges, so a denial that came from a missing `GRANT` rather than from RLS still shows up. **What it does not exercise is the HTTP layer** — PostgREST status codes, and anon reaching an endpoint at all. That gap is named at the head of the file rather than papered over.
  - **The trap the file is built around:** an INSERT denial raises `42501`, but UPDATE, DELETE and SELECT denials are *zero rows, silently*. Asserting "it raised" would pass a schema with no UPDATE policy at all; asserting "it did not raise" would pass one that permits everything. Only row counts separate them, which is why `rows_as()` exists beside `try_as()`.
  - It also absorbs M3-17 (§5, §6), M3-18 (§7) and M3-11 (§10). Those are cells of these same matrices, not separate concerns, and a second harness for each would be three files to keep in step.
- **Reload persistence:** every ✅ write is re-read after a hard refresh. The Editor drag path especially: it exercises INSERT and UPDATE policies through one `upsert`, and a missing policy reverts silently on refresh rather than erroring.
- **Output:** a results table committed to `docs/RLS_AUDIT.md` — every cell of both matrices, plus I1–I5, with the observed status code or row count. Any failure becomes a new task in this document before the milestone closes.
- **Commit:** `docs: role matrix verification results`

#### M3-12 · Membership performance verification — **DEFERRED to Part V (PH-03)** — decided 2026-08-10
Seed a board with 500 cards, 12 columns and 10 members. `explain analyze` the board load. Compare against the M2-05 baseline.
**Test:** load time within 20% of baseline; no sequential scan on `board_members`; findings recorded in the PR. If it regresses, that is a finding — fix it here, not in M9.
**Commit:** `perf(db): verify RLS membership lookup cost`
> **Deferred, and it does not gate the milestone.** Seeding 500 cards and 10 members to measure a fixture-scale application is production-readiness work, not product work. The structural mitigation — indexes on `board_members(board_id)` and `(user_id)`, plus the M2-05 indexes — is already in place, and the set-returning `accessible_board_ids()` design deliberately plans as an InitPlan.
> **What stays in M3, for free:** if the board becomes visibly slower to load or drag on the fixture after M3-13 → M3-18, that is a finding and it gets its own task. No instrumentation needed to notice it.
> **Reopen (PH-03) when:** a real board passes a few hundred work items, or someone reports slowness. Two plans to look at then, and they are not the same shape: reads go through `accessible_board_ids()` (row-independent, once per statement), writes through `board_role(board_id)` (row-dependent, potentially once per row on a bulk upsert). Profile the bulk reorder path specifically. This also absorbs the `explain analyze` check M3-02 did not run.

### Expected commit order — Milestone 3

Done, in the order it happened:

```
1.  feat(db): create board_members                          (M3-01)  ✅
2.  feat(db): board membership helper functions             (M3-02)  ✅
3.  fix(db): add missing board_members(board_id) index      (M3-01 follow-up)  ✅
4.  feat(db): backfill owner memberships                    (M3-03)  ✅ HIGH
5.  feat(db): allow board reads via membership              (M3-04)  ✅ HIGH
6.  feat(db): record M3-05 membership RLS migration         (M3-05)  ✅ HIGH
7.  feat(db): board roster RPC with explicit column exposure (M3-13) ✅ applied 2026-08-11
8.  feat(db): complete M3 membership permissions             (M3-14, M3-15) ✅ applied 2026-08-11 HIGH
9.  test(db): add M3 permission verification                 (M3-14, M3-15, M3-16 harnesses) ✅
```

**Applied and verified:** M3-14 at 67/67 and M3-15 at 37/37, both on a clean replica built from all 26 migrations, with mutation testing confirming the harnesses catch a removed protection. Both carry an independent security review at APPROVE. `supabase migration list` shows all 26 paired local↔remote, and `src/types/database.ts` matches the live schema byte for byte.

Applied 2026-08-12, in one `supabase db push`:

```
── permission model in the database ───────────────────────────────────
1.  feat(db): board settings by role                        (M3-17)  ✅ applied
2.  feat(db): a work item's column must belong to its board (M3-18)  ✅ applied
3.  feat(db): transactional delete_column RPC               (M3-11)  ✅ applied, backend half only

── the gate ───────────────────────────────────────────────────────────
4.  docs: role matrix verification results                  (M3-16)  ← MILESTONE GATE
    scripts/verify-m3-16-role-matrix.sql is written; it has NOT been run.
    Run it after step 3 — §5/§6 cover M3-17, §7 covers M3-18, §10 covers M3-11.

── the product surface — the Lead's, all four ─────────────────────────
5.  feat(members): members API and query hooks              (M3-06)
6.  feat(members): board member list                        (M3-07)
7.  feat(members): manage roles and remove members          (M3-08)
8.  feat(members): gate UI affordances by role              (M3-09)
9.  the M3-11 client swap in columnsApi.ts — no commit of its own

deferred out of this milestone:
    feat(db): transactional reorder_todos RPC               (M3-10)  → re-evaluated at M6-04
    perf(db): verify RLS membership lookup cost             (M3-12)  → PH-03
    enable PITR                                             (M3-00)  → PH-01
```

**Nothing in this list waits on infrastructure.** Every remaining migration is Tier A — written, applied and reversed with SQL alone. The old ordering put a $125/month billing decision in front of the permission model; it is gone.

> **Git and the database agree.** `supabase migration list` shows **29 of 29 versions paired local↔remote**, with no unpaired entry in either direction, and `src/types/database.ts` is generated from the live schema. The gap that opened when these three were committed ahead of being applied is closed.
>
> **What is still outstanding is verification, not deployment.** Every M3 migration is live; the M3-16 harness that proves the role matrix behaves as specified has never been executed. Applied is not verified, and the milestone gate is the second of those.

**The order that remains is a real dependency chain, not ceremony:**

- **M3-13 before M3-06/07/08** — a member list cannot render rows RLS will not return.
- **M3-14 before M3-15** — the triggers need the RPCs to exist so both layers can be tested against each other.
- **M3-14 before M3-16** — the matrix needs editor and admin fixtures, and nothing else can create them.
- **M3-16 before the UI** — building four member screens on an unverified permission model is how a permission bug ships behind a polished interface. It re-runs cheaply later; it cannot usefully run for the first time later.
- **M3-18 before M3-11** — both concern a column belonging to the right board.

---

## Milestone 4 — Invitations · ⬜ **Not started**

**Goal.** Let an admin or owner add members without a manual database insert.

**Why this milestone exists.** M3 makes membership meaningful and mutable by RPC, but provides no way for a new person to acquire it without an administrator knowing their user id.

**Dependencies.** Milestone 3 — specifically M3-14 (the authorization rules an invite must reuse) and M3-16 (the matrix those rules are verified against). An invite that bypasses the membership matrix is a second, weaker permission system.

**Estimated difficulty.** M (7 tasks).

**Risks.** Invite acceptance is one of the very few paths where a not-yet-member touches board data, so its RLS deserves its own review. Token generation must be cryptographically random and acceptance must be atomic, or a replayed link creates duplicate memberships.

**Permission rules this milestone inherits — not negotiable, and each needs a test.**

- An invite's `role` may **never** be `owner`. Ownership is not grantable by link (invariant I6).
- An **admin** may create invites for `viewer` and `editor` only.
- An **owner** may create invites for `viewer`, `editor` and `admin`.
- `editor` and `viewer` may not create invites at all.
- Acceptance grants exactly the invite's role and never upgrades an existing membership to a higher one — decide the collision rule explicitly (recommended: accepting an invite while already a member is a clean no-op, never a downgrade and never an upgrade).
- Enforcement is inside the RPCs. The invite role selector in the UI is UX.

**Scope decision.** `docs/DATABASE.md` describes both email invitations and invite links. **Ship link invites only.** Email invites require a transactional provider, deliverability handling and bounce logic — real work for no additional capability in v1. Schema keeps the `email` column so email invites are additive later.

**Success criteria.** An owner generates a link; a second account opens it and becomes a member with the intended role; expired and revoked links fail cleanly; replay is impossible.

### Tasks

#### M4-01 · Create `board_invites` — **SAFE**
`id`, `board_id`, `email` (nullable — unused in v1), `token unique`, `role`, `expires_at`, `created_by`, `accepted_at`. RLS: board admins read their board's invites; nobody reads by token directly (acceptance goes through the RPC).
**Commit:** `feat(db): create board_invites`
> **Added 2026-08-10.** `role` carries `check (role in ('admin','editor','viewer'))` — `owner` is excluded at the column level, so no code path can express it. The read policy uses `board_role(board_id) in ('owner','admin')` via the helper, never a sub-select on `board_members`. As with `board_members`, there is **no client INSERT/UPDATE/DELETE policy**: creation and revocation go through RPCs.

#### M4-02 · `create_invite` RPC — **MEDIUM RISK**
Validates the caller is `owner`/`admin`, generates a cryptographically random token, sets expiry.
**Test:** an `editor` calling it is rejected; the token is unguessable; expiry is set correctly.
**Commit:** `feat(db): create_invite RPC`
> **Added 2026-08-10.** The caller's role comes from `board_role(p_board_id)`, never from an argument. An admin requesting `role = 'admin'` is **denied** — admins may not create admins, by the same rule that stops them promoting one. Any request for `role = 'owner'` is denied. Test both denials explicitly; they are the two that a "caller is admin or owner" check alone would let through.

#### M4-03 · `accept_invite` RPC — **HIGH RISK**
Single transaction: validate token, check not expired, check not already accepted, insert the membership, stamp `accepted_at`.
**Test:** valid token → membership created, exactly once; **calling twice → second call is a clean no-op, not a duplicate**; expired token rejected; revoked token rejected; unauthenticated call rejected; garbage token rejected without leaking whether it exists.
> **Added 2026-08-10.** Two more denials to test: a token whose stored `role` is `owner` (however it got there) must be refused rather than honoured — defence in depth behind M4-01's constraint. And accepting while already a member must not change the existing role in either direction, which is what makes a leaked old link harmless to someone who has since been promoted or demoted.
> **HIGH RISK — this is a privilege-granting function.**
> **Backup:** dump before deploying. **Rollback:** forward-fix dropping the function; any memberships it created must be audited manually against `board_invites.accepted_at`. **Migration:** review the function line by line before deploying — a flaw here grants board access. Test every failure branch explicitly, including the concurrent double-accept. Decide and document what happens when the invited email does not match the accepting account (recommended for v1: allow it — the link is the credential).
**Commit:** `feat(db): accept_invite RPC`

#### M4-04 · `services/invites/` — **SAFE**
API + hooks: create, list pending, revoke, accept.
**Commit:** `feat(invites): invites API and query hooks`

#### M4-05 · Invite management UI — **SAFE**
Generate a link with a role selector, copy to clipboard, list pending invites, revoke.
**Test:** generate, copy, revoke; a revoked link stops working immediately; only owners and admins see the controls.
**Commit:** `feat(invites): invite management UI`

#### M4-06 · `/invite/:token` accept route — **MEDIUM RISK**
Public route. Unauthenticated visitors are sent to login/register and returned to the invite afterwards.
**Test:** logged out → login → returned to the invite → accepted → lands on the board; already a member → friendly message, no duplicate; expired → clear error, no stack trace.
**Commit:** `feat(invites): invite acceptance route`

#### M4-07 · Invite expiry — **SAFE**
`docs/ARCHITECTURE.md`: *"Invites should expire automatically."* Enforcement already lives in `accept_invite`; this task hides expired invites from the pending list and optionally sweeps them.
**Recommendation:** filter in the query. **Do not add `pg_cron` for this** — an expired row that nobody can use and nobody can see is not a problem worth a scheduler.
**Commit:** `feat(invites): hide expired invites`

### Expected commit order — Milestone 4

```
1. feat(db): create board_invites            (M4-01)
2. feat(db): create_invite RPC               (M4-02)
3. feat(db): accept_invite RPC               (M4-03)  ← HIGH
4. feat(invites): invites API and query hooks(M4-04)
5. feat(invites): invite management UI       (M4-05)
6. feat(invites): invite acceptance route    (M4-06)
7. feat(invites): hide expired invites       (M4-07)
```

---

## Milestone 5 — Work Item Model · ⬜ **Not started**

**Goal.** Make the four remaining MVP work-item features real: assignment, due dates, priorities, descriptions.

**Why this milestone exists.** The columns landed in M2-03 and the UI placeholders already exist and are inert — the assignee avatar in `TodoItem.tsx` and the calendar/user/priority buttons in `TodoCreateForm.tsx` render and do nothing. The design is ahead of the schema; this closes the gap. It is also where the card component's accumulated shortcuts finally get paid off.

**Dependencies.** M2 (columns), M3 (assignee must be a board member — M3-13's `board_roster` RPC is what makes the picker able to show names at all; `profiles` stays self-only).

**Estimated difficulty.** M (8 tasks).

**Risks.** Low structurally. Budget more than the feature list suggests — M5-01 and M5-02 are refactors of a component every other feature touches.

**Success criteria.** A work item can be assigned, prioritised, dated and described; all four persist and survive refresh; the card component no longer fetches or mutates on its own.

**Permission rules this milestone inherits.** Every field added here is work-item content: **editor and above may set it, viewers may not.** No new policy is needed — M3-05's UPDATE policy already covers the whole row — but M5's UI must gate the new controls through `usePermissions` (M3-09), and M5-05's picker must offer only board members.

> **Architecture decision that outlives this milestone: M5-06.** The task detail view is where UX principle 1 ("board context is never lost") is either honoured or lost, and M11 builds more views on whatever shape it establishes. Decide deliberately between a panel/overlay that keeps the board behind it and a full-page route, record the choice and the reason in the M5-06 PR, and make the work item addressable by URL either way — a deep link is what M12's search results and M7's comment notifications will point at.

### Tasks

#### M5-01 · Split the todo types — **SAFE**
`ISupabaseTodo` carries `isOptimistic?` — a UI flag inside a database row type — and `TodoItemProps extends ISupabaseTodo`, so every card spreads a full database row as props and a schema change becomes a props change in a leaf component. Split into `Todo` (generated row), `TodoView` (row + client state), `TodoCardProps` (what the card renders).
**Test:** build green; card renders identically; a scratch `TodoCardProps` object with no database dependency renders the card.
**Commit:** `refactor(types): separate todo row, view and card props`

#### M5-02 · Move edit state out of `TodoItem` — **SAFE**
`docs/FRONTEND.md` uses `TodoCard` as its named example of a component that *"only renders"*; today it owns edit state and calls `useUpdateTodo` directly.
**Test:** rename via the pencil; Escape cancels; Enter saves; blur saves; empty title reverts.
**Commit:** `refactor(todo): lift card edit state out of the card`

#### M5-03 · Priority — **MEDIUM RISK**
Constants in `src/constants/priorities.ts` mirroring the `columns.ts` category precedent (colours in the frontend, not the database, per `docs/DATABASE.md`). Check constraint already added in M2-03. **Do not create a lookup table** — it is a fixed set users pick from and never define.
**Test:** set each of the five; persists; renders on the card; sorting/filtering by priority behaves.
**Commit:** `feat(todos): priority field and control`

#### M5-04 · Due date — **SAFE**
Use `<input type="date">`. **Do not add a date-picker dependency** for this.
**Test:** set, clear, persists; overdue styling correct across a timezone boundary; a date set today at 23:59 is not shown as overdue.
**Commit:** `feat(todos): due dates`

#### M5-05 · Assignee — **MEDIUM RISK**
Picker sourced from `useBoardMembers`. Replaces the placeholder icon on the card.
**Test:** assign, reassign, unassign; only board members are offered; a removed member's assignment degrades gracefully (`on delete set null` from M2-03); optimistic update rolls back offline.
**Commit:** `feat(todos): assign a board member to a task`
> **Added 2026-08-10.** Assignability follows **membership, not write permission**: a viewer may be assigned work (see *Permission Model → Decisions*). Setting an assignee is still an editor+ action, because it writes the row.
> Two cases the test list must cover, both reachable in normal use: assigning someone who is then **removed from the board** (`assignee_id` survives as a dangling reference until the profile is deleted — decide whether the card shows "unassigned" or a former-member state), and assigning someone whose role is later **demoted to viewer** (the assignment stays valid).
> **Depends on M3-13.** The picker's names come from `board_roster`; `profiles` is not directly readable by co-members and will not receive a broad co-member SELECT policy. See the standing roster-boundary decision in `docs/RLS_AUDIT.md`.

#### M5-06 · Description and task detail view — **MEDIUM RISK**
**Test:** open, edit, save, close; unsaved changes prompt; deep link to a task; a task from another board 404s.
**Commit:** `feat(todos): task detail view with description`

#### M5-07 · Narrow the list query — **MEDIUM RISK**
`select("*")` fetches `description` and `estimate` for a board view that renders neither.
**Test:** network payload measurably smaller on a 200-card board; the detail view still gets the full row; record before/after sizes in the PR.
**Commit:** `perf(todos): select only card fields for the board view`

#### M5-08 · Wire the create form's inert controls — **MEDIUM RISK**
The bug, chevron, calendar and user buttons in `TodoCreateForm` currently do nothing.
**Test:** set priority, due date and assignee at creation → all three persist on the created card; the mid-column insert position is still honoured; the skeleton-then-form timing still works for a fast typist.
**Commit:** `feat(todos): set priority, date and assignee at creation`

### Expected commit order — Milestone 5

```
1. refactor(types): separate todo row, view and card props    (M5-01)
2. refactor(todo): lift card edit state out of the card       (M5-02)
3. feat(todos): priority field and control                    (M5-03)
4. feat(todos): due dates                                     (M5-04)
5. feat(todos): assign a board member to a task               (M5-05)
6. feat(todos): task detail view with description             (M5-06)
7. feat(todos): set priority, date and assignee at creation   (M5-08)
8. perf(todos): select only card fields for the board view    (M5-07)
```

---

## Milestone 6 — Realtime · ⬜ **Not started**

**Goal.** Two people on one board see each other's changes without refreshing, and concurrent edits merge instead of overwriting.

**Why this milestone exists.** `docs/PRODUCT_SPEC.md` names Realtime Collaboration a core principle. Everything before this made it possible; this makes it happen.

**Dependencies.** M2 (board-scoped keys, pure cache functions from M2-16, UUIDs from M2-14) — **all shipped**, so the "if they were deferred, do them here first" contingency in the original plan no longer applies. M3 (membership) must be complete: a realtime channel that ignores roles is a permission bypass with a socket attached.

**Estimated difficulty.** L–XL (12 tasks).

**Risks.**
- **The hardest milestone to test.** You need two browsers and deliberate races. Realtime plus optimistic updates is where double-applied inserts and flickering reorders live.
- The fractional-rank migration is a second rewrite of the ordering column. Get the rebalance path right, or precision exhaustion becomes a production incident a year out.

**Ordering decision.** Fractional ranks come **first**, before any channel is subscribed. Dense integer positions plus concurrent editors is not a merge conflict — it is silent data loss, because each client renumbers the entire column from its own stale snapshot and last-write-wins across every row. Shipping realtime on top of dense integers means debugging phantom reorders in production.

**Consequences for other milestones, recorded 2026-08-10.**

- **M3-10 (`reorder_todos` RPC) should wait for M6-04.** A single-row rank update makes a bulk-reorder RPC pointless. Building it first means building something M6 deletes.
- **The rank column is what M11's backlog will order by.** A backlog is another ordered view of the same rows; if ordering is still dense integers when the backlog arrives, two views renumber the same column from two stale snapshots. M6 before M11 is not negotiable.
- **Realtime is a permission surface, not only a transport.** Every channel event carries row data, so RLS must apply to replication exactly as it applies to a query, and a demoted or removed member must stop receiving events. M6-07 owns proving it.

**Success criteria.**
- A card move writes exactly one row.
- Two clients dragging different cards in one column both survive.
- Two clients dragging the same card produce one winner, no duplicate, no orphan.
- A client offline for 30 seconds converges on reconnect.
- No realtime handler refetches the board.

### Tasks

#### M6-01 · Add the `rank` column — **HIGH RISK** (expand)
Nullable `rank`, written alongside `position` (dual-write). Reads still use `position`.
> **Backup:** dump. **Rollback:** drop the column — nothing reads it. **Migration:** additive only; the risk label reflects that this begins an ordering migration, not that this step is dangerous.
**Commit:** `feat(db): add fractional rank column to todos and columns`

#### M6-02 · Backfill ranks — **HIGH RISK**
Derive `rank` from existing `position`, leaving wide gaps for future midpoint inserts.
**Test:** every row has a rank; ordering by rank exactly matches ordering by position, per column, for every board.
> **Backup:** dump. **Rollback:** null the ranks. **Migration:** verify the orderings match on every board before proceeding — a mismatch here silently scrambles someone's board later.
**Commit:** `feat(db): backfill ranks from positions`

#### M6-03 · Read by rank — **HIGH RISK**
Switch every sort to `rank`. Writes still dual-write both.
**Test:** every board renders in exactly its previous order — check several boards, including one with 100+ cards in a column.
> **Rollback:** revert the deploy; `position` is still maintained, so reverting is clean. **This is why dual-write exists.**
**Commit:** `feat(todos): order by rank`

#### M6-04 · Write single-row rank updates — **HIGH RISK**
A move computes the midpoint between its two neighbours and updates **one row**. Replaces whole-column renumbering.
**Test:** drag a card → network shows one row updated, not N; drag to the top and to the bottom of a column; drag into an empty column; drag across columns; 50 consecutive drags of the same card between two neighbours → precision holds or rebalance fires.
> **Backup:** dump. **Rollback:** revert the deploy; `position` is still being written. **Migration:** soak for several days before M6-05 — this is the change most likely to reveal an edge case in production.
**Commit:** `feat(todos): single-row rank writes on move`

#### M6-05 · Drop `position` — **HIGH RISK** (contract)
Removes `insertDense` and the whole-column renumbering path.
> **Tier B — the first one since M2.** Mandatory dump; a dropped column is not recoverable by forward-fix. **This is the task that reopens PH-01 and PH-02** — decide on PITR and prove a dump restores *before* applying it, not after. **Rollback:** one-way. **Migration:** only after M6-04 has soaked and no ordering bugs have been reported. Retire `insertDense.ts` and `insertDense.test.ts` in the same commit — the `*.check.ts` this originally named was replaced by a Vitest sibling in M1-17.
**Commit:** `refactor(db): drop position in favour of rank`

#### M6-06 · Rank rebalancing — **MEDIUM RISK**
Repeated midpoint insertion between two adjacent ranks eventually exhausts precision. Detect and renumber that column server-side.
**Test:** synthetically drive a column to exhaustion → rebalance fires, order is preserved, no visible disruption. **This needs a Vitest test, not a manual check** — it is the failure mode nobody will reproduce by hand.
**Commit:** `feat(db): rebalance ranks on precision exhaustion`

#### M6-07 · Enable the realtime publication — **MEDIUM RISK**
Add `todos` and `columns` to `supabase_realtime`. Confirm RLS applies to realtime — **a client must not receive change events for boards it cannot read.**
**Test:** subscribe as a non-member → receives nothing for that board. Verify explicitly; this is a security check, not a plumbing check.
**Commit:** `feat(db): enable realtime on todos and columns`
> **Added 2026-08-10 — three more security checks, each a state that happens in normal use.**
> - A **viewer** subscribed to a board receives events (they can read) but cannot act on them. Confirm the handlers do not assume the receiving client has write permission.
> - A member **removed while subscribed** stops receiving events on that board — and if the transport keeps an authorized connection open until the token refreshes, that window is a finding: write it down and decide whether to force a resubscribe on membership change.
> - Nothing in a payload exposes a column the client could not have read through a query. Realtime replicates the row, not the `select` list.

#### M6-08 · `useBoardRealtime` — **MEDIUM RISK**
One channel per board, subscribed in `BoardPage`, torn down on unmount. Per-board filter so clients react only to their own board's events, per `docs/ARCHITECTURE.md`.
**Test:** navigate between boards → old channel closes, new one opens, no leak across ten navigations; the connection survives a tab backgrounding and reconnects.
**Commit:** `feat(realtime): per-board channel subscription`

#### M6-09 · Wire handlers to the pure cache functions — **MEDIUM RISK**
Insert/update/delete events call the same `applyTodo*` functions the mutations use (M2-16). **Never refetch the board** — `docs/API.md` is explicit.
**Test:** two browsers — A creates, renames, deletes, moves; B reflects each within a second, with no full refetch visible in the network tab.
**Commit:** `feat(realtime): apply change events to the query cache`

#### M6-10 · Echo suppression — **MEDIUM RISK**
Your own writes come back as events. With client-generated UUIDs this is an identity match.
**Test:** create a card → it appears exactly once, never briefly twice; drag a card → no flicker back to the old position; two rapid creates → two cards, correct order.
**Commit:** `fix(realtime): suppress echoes of local writes`

#### M6-11 · Presence — **SAFE**
Who is viewing the board, via the presence channel.
**Test:** two browsers see each other; closing one removes the avatar within a few seconds; a network drop eventually clears it.
**Commit:** `feat(realtime): board presence`

#### M6-12 · Concurrency verification — **SAFE** (verification)
Execute the full Concurrency section of the Testing Checklist and record results in the PR. Any failure becomes a new task in this document before the milestone closes.
**Commit:** `docs: realtime concurrency verification results`

### Expected commit order — Milestone 6

```
── ordering migration (must complete before any channel opens) ────────
1.  feat(db): add fractional rank column                (M6-01)  ← HIGH
2.  feat(db): backfill ranks from positions             (M6-02)  ← HIGH
3.  feat(todos): order by rank                          (M6-03)  ← HIGH
4.  feat(todos): single-row rank writes on move         (M6-04)  ← HIGH
                    ← re-evaluate M3-10 here: if no bulk renumber
                      path survives M6-04, close it as unnecessary
5.  feat(db): rebalance ranks on precision exhaustion   (M6-06)
                                            ← SOAK SEVERAL DAYS
6.  refactor(db): drop position in favour of rank       (M6-05)  ← HIGH

── realtime ───────────────────────────────────────────────────────────
7.  feat(db): enable realtime on todos and columns      (M6-07)
8.  feat(realtime): per-board channel subscription      (M6-08)
9.  feat(realtime): apply change events to the cache    (M6-09)
10. fix(realtime): suppress echoes of local writes      (M6-10)
11. feat(realtime): board presence                      (M6-11)
12. docs: realtime concurrency verification results     (M6-12)
```

---

## Milestone 7 — Comments & Activity · ⬜ **Not started**

**Goal.** Ship the last MVP item (comments). Add activity history only if it is genuinely being built.

**Why this milestone exists.** Comments complete the MVP list in `docs/PRODUCT_SPEC.md`.

**Dependencies.** M5 (work item detail view), M6 (realtime patterns), M3-13 (a comment author's name and avatar are another user's profile).

**Estimated difficulty.** M (5 tasks).

**Risks.** Low. Watch comment volume on the board query — do **not** join comments into the board fetch; load them per open work item.

**Success criteria.** Comments post, edit, delete and appear live for other viewers of the same work item.

> **⚠ Open permission decision — must be resolved before M7-01's RLS is written.**
> **May a viewer comment?** The role specification covers work items, columns and membership; it does not mention comments, and this plan will not invent the answer.
> The two defensible positions: *commenting is content, so it needs editor+* (consistent with the content matrix, and a viewer is by definition read-only); or *commenting is participation, not content, so any member may comment* (a reviewer or stakeholder who can read a board but not change it is exactly the person who has something to say about it).
> **Recommendation: any member may comment, and may edit or delete only their own comments.** It matches what "viewer" means in practice on collaborative tools and costs nothing to reverse in the other direction later; the reverse is harder, because it would remove a capability people already use.
> **Whichever is chosen, record it in the *Permission Model* table in Part II in the same PR**, and give it a row in the M3-16 matrix. A permission rule that exists only in a milestone's prose is a rule nobody will find.
>
> The same question recurs for **editing and deleting other people's comments**. Recommendation: authors edit their own; admins and owners may delete any (moderation); nobody edits someone else's text. Decide it here rather than discovering it in a moderation incident.

### Tasks

#### M7-01 · Create `comments` — **SAFE**
`id`, `todo_id`, `author_id`, `content`, `created_at`, `updated_at`. Index on `todo_id` per `docs/DATABASE.md`. RLS via the board-membership helpers.
**Commit:** `feat(db): create comments`
> **Added 2026-08-10 — carry `board_id` on the row.** The membership helpers take a board id; without a denormalised `board_id`, every policy evaluation joins `comments → todos` to find one, on every row. `docs/DATABASE.md` warns against duplicated information, and this is the exception worth making: it is a *derived key used by the security boundary*, not duplicated user data, and it keeps every collaborative table on the same one-hop predicate. Enforce it with the same composite-FK shape as M3-18 so it cannot drift from the work item's board.
> This also decides the shape for `attachments`, `labels` and `activities` when they arrive: **every board-scoped table carries `board_id` and is policed by `board_role(board_id)`.** Deciding it once here is cheaper than four inconsistent designs later.
> Resolve the viewer-comment question above before writing the INSERT policy.

#### M7-02 · `services/comments/` — **SAFE**
Key `["comments", todoId]`. Optimistic create/edit/delete with rollback.
**Commit:** `feat(comments): comments API and query hooks`

#### M7-03 · Comment UI — **SAFE**
List and composer inside the task detail view. Author avatar, relative timestamp, own-comment edit/delete.
**Test:** post, edit, delete; empty and whitespace-only submissions rejected; long content wraps; another user's comment offers no edit control.
**Commit:** `feat(comments): comment list and composer`

#### M7-04 · Realtime comments — **MEDIUM RISK**
Subscribe only while a task is open; tear down on close.
**Test:** two browsers on the same task → comments appear live; close and reopen → no duplicate subscription; open ten tasks in sequence → no channel leak.
**Commit:** `feat(comments): realtime comment updates`

#### M7-05 · Activity history — **MEDIUM RISK, CONDITIONAL**
**Only build this if the activity feed UI is actually being designed in this milestone.** `docs/DATABASE.md` lists `activities` in the base ERD, but an unbounded audit table with no reader grows forever and is silently wrong the day you finally build the UI. If there is no feed, skip it and record the deferral here.
If built: write via trigger, never from the client. Plan retention from day one.
**Commit:** `feat(db): activity history`
> **Added 2026-08-10 — the shape, if and when it is built.** Activity is named as a differentiator in Part I ("history is a feature, not an audit log"), so its schema is worth getting right in one attempt: `board_id` (policy key, as above), `actor_id`, `entity_type`, `entity_id`, `action`, a `jsonb` change payload, `created_at`. Read policy: any member of the board. **No client write policy at all** — triggers are the only writer, which is also what makes the log trustworthy.
> Two rules that are cheap now and expensive later: record the **actor**, never infer it at read time; and never let an activity row outlive the ability to explain it — if `entity_id` points at a deleted row, the payload must still say what happened.
> Membership changes are the entries most worth having (who added whom, who changed a role) and the ones a client-written log would never capture honestly. If activity is built, membership events go in it.

### Expected commit order — Milestone 7

```
1. feat(db): create comments                     (M7-01)
2. feat(comments): comments API and query hooks  (M7-02)
3. feat(comments): comment list and composer     (M7-03)
4. feat(comments): realtime comment updates      (M7-04)
5. feat(db): activity history                    (M7-05)  ← conditional
```

---

## Milestone 8 — Boards UX · ⬜ **Not started**

**Goal.** Make multiple boards usable, not merely possible.

**Why this milestone exists.** By M7 the data model is complete, but the product still effectively opens on one board. This is deliberately late: building the board management screens after members and roles exist means building them once.

**Dependencies.** M2 functionally; M3-17 for the settings permissions these screens surface; sequenced here so roles and members are already available.

**Estimated difficulty.** M (9 tasks).

**Risks.** Low, except board deletion, which cascades across every table.

**Success criteria.** A user creates, renames, decorates, archives and deletes boards; the sidebar shows boards they own **and** boards they are a member of; every route in `docs/FRONTEND.md` exists.

**Permission note.** `getBoards()` deliberately has no `owner_id` filter, so it already returns membership boards once RLS allows them (M3-04, applied). Every screen here shows the caller's role and gates its controls through `usePermissions` (M3-09): an editor sees a board they cannot rename, an admin sees one they cannot delete.

### Tasks

#### M8-01 · `/dashboard` and `/boards` — **SAFE**
Board list with owner/member distinction, empty state, loading skeleton.
**Commit:** `feat(boards): dashboard and board list`

#### M8-02 · Create board — **SAFE**
Modal creating the board and seeding four default columns, reusing the M2-12 RPC.
**Test:** new board arrives with four correctly-categorised columns and a creator owner-membership; optimistic entry rolls back on failure.
**Commit:** `feat(boards): create board`

#### M8-03 · Rename, archive, delete — **MEDIUM RISK**
Delete requires typed confirmation.
**Test:** rename persists; archive hides without destroying; delete requires the exact title; a non-owner cannot delete.
**Commit:** `feat(boards): rename, archive and delete boards`
> **Added 2026-08-10.** The permissions are M3-17's: **admin and owner rename and archive; owner alone deletes.** The typed confirmation is a mistake-guard, not a permission — the denial for a non-owner happens in the database whether or not the modal is reached.
> `archived` needs a decision this task must record: does an archived board disappear for its members too, and can a member still read it? Recommendation: archived is board-wide and read-only for everyone, owner included, until it is restored. That keeps "archived" from becoming a second, weaker delete with per-user semantics.

#### M8-04 · Board appearance — **SAFE**
`icon`, `cover_color`, `visibility`. Per `docs/DATABASE.md` colours are presentation — store a token or key, not a hex value, and keep the palette in `src/constants/`.
**Commit:** `feat(boards): board icon, cover colour and visibility`

#### M8-05 · Wire the sidebar to real boards — **SAFE**
`nav-projects.tsx` is currently static placeholder data.
**Test:** sidebar lists real boards, marks the active one, updates on create/rename/delete without a refetch.
**Commit:** `feat(sidebar): list real boards`

#### M8-06 · `/settings` — **SAFE**
Account settings: language, theme, password change.
**Commit:** `feat: settings page`

#### M8-07 · `/forgot-password` — **SAFE**
Specified as a public route in `docs/FRONTEND.md` and currently missing.
**Test:** request a reset for a real address → email arrives, link works, new password logs in; unknown address gives the same neutral response (no account enumeration).
**Commit:** `feat(auth): password reset flow`

#### M8-08 · Verify the deletion cascade — **HIGH RISK** (verification)
`docs/DATABASE.md` specifies exactly what a board deletion removes and what a user deletion preserves.
**Test:** on a scratch board — delete it, then confirm zero orphans in `columns`, `todos`, `comments`, `board_members`, `board_invites`, `activities`; delete a user and confirm their created tasks and comments survive with a null author while their memberships are gone.
> **Backup:** run against a scratch board on a branch database. **Never** verify a cascade against production data. **Rollback:** none needed if the rule is followed. **Migration:** any FK found to have the wrong `on delete` becomes its own follow-up task, sequenced before this milestone closes.
**Commit:** `test(db): verify board and user deletion cascades`
> **Added 2026-08-10.** Add two membership cases to the checks: deleting a **member's** profile removes their `board_members` rows and leaves the boards intact, and deleting an **owner's** profile cascades their boards away entirely (`boards.owner_id … on delete cascade`). The second is a large, quiet blast radius — every member of every board that person owned loses it. Confirm it is what the product wants **before** M8-03 ships a delete-account path; if it is not, the answer is ownership transfer (Appendix B), not a softened cascade.

#### M8-09 · Leave a board — **SAFE**

**New in the 2026-08-10 audit.** Membership is now something a person can be given; it must be something they can decline.

Calls the self-removal path from M3-14. Available to viewer, editor and admin. **The Owner cannot leave** (invariant I1 — a board always has an Owner), and the control is absent rather than disabled-with-no-reason.

**Test:** each non-owner role leaves and immediately loses access; the board disappears from their list; their assigned work items survive with the assignment intact; the Owner has no leave control and the RPC denies it if called directly; leaving a board you are not a member of is a clean no-op.
**Commit:** `feat(members): leave a board`

### Expected commit order — Milestone 8

```
1. feat(boards): dashboard and board list                (M8-01)
2. feat(boards): create board                            (M8-02)
3. feat(boards): rename, archive and delete boards       (M8-03)
4. feat(boards): board icon, cover colour and visibility (M8-04)
5. feat(sidebar): list real boards                       (M8-05)
6. feat(members): leave a board                          (M8-09)
7. feat: settings page                                   (M8-06)
8. feat(auth): password reset flow                       (M8-07)
9. test(db): verify board and user deletion cascades     (M8-08)  ← HIGH
```

---

## Milestone 9 — Quality · ⬜ **Not started**

**Goal.** Meet the four core principles in `docs/PRODUCT_SPEC.md` that are currently unmet: Accessible, Keyboard Friendly, Fast, Mobile Friendly.

**Why this milestone exists.** This is not polish — these are four stated requirements that do not currently hold. The board is pointer-only: `useKanbanDnd` registers a `PointerSensor` and nothing else, cards are `<div>`s with no roles, and there are no drag announcements.

**Dependencies.** Everything. Consider pulling M9-01 and M9-02 forward to M5 — accessibility retrofitted is accessibility done twice.

**Estimated difficulty.** L (10 tasks).

**Risks.** The real risk is perpetual deferral, at which point four documented core principles quietly become aspirations. Schedule this milestone; do not leave it as "when there's time."

**Success criteria.** The board is fully operable by keyboard, announced to screen readers, usable on a phone, and route-split.

### Tasks

#### M9-01 · Keyboard drag and drop — **MEDIUM RISK**
Not a config flag. The custom `collisionDetection` reads `pointerCoordinates` as the first thing it does, so a `KeyboardSensor` needs a parallel index-based resolution path alongside the pointer path. **Budget a day, not an hour.**
**Test:** tab to a card, activate, arrow between positions and columns, drop, cancel with Escape; keyboard and pointer produce identical results; column reorder works by keyboard too.
**Commit:** `feat(a11y): keyboard drag and drop`

#### M9-02 · ARIA roles and drag announcements — **SAFE**
`role`, `aria-label`, `aria-describedby` on cards and columns; dnd-kit `announcements` and `screenReaderInstructions`.
**Test:** VoiceOver announces pick-up, move and drop; the board is navigable and comprehensible with the screen off.
**Commit:** `feat(a11y): roles and drag announcements`

#### M9-03 · Route-level code splitting — **SAFE**
`docs/FRONTEND.md`: *"Use lazy loading for large routes."*
**Test:** initial bundle measurably smaller; each route loads on demand with a suspense fallback; record before/after sizes.
**Commit:** `perf: lazy-load routes`

#### M9-04 · React Compiler decision — **MEDIUM RISK**
The babel plugin is installed but commented out in `vite.config.ts`, and `README.md` claims it is enabled. Either turn it on and verify, or remove the plugin and fix the README. **Do not leave it ambiguous.**
**Test (if enabling):** full Smoke checklist — the compiler changes memoisation semantics, and M1-11's memo fix is a prerequisite.
**Commit:** `chore: enable the React Compiler` **or** `chore: remove the unused React Compiler plugin`

#### M9-05 · Render profiling and targeted memoisation — **MEDIUM RISK**
Every mutation replaces the whole `["todos"]` array, and `TodoItem` is not memoised, so every card re-renders on every cache write. **Profile first; memoise only what the profiler names.** `docs/FRONTEND.md`: *"Memoize only when beneficial."*
**Test:** React DevTools profiler before and after on a 200-card board; both recordings in the PR.
**Commit:** `perf(kanban): memoise cards based on profiler findings`

#### M9-06 · i18n coverage — **MEDIUM RISK**
Eight strings are translated. Everything else — "Create", "Transition to...", "Rename column", "What needs to be done?", the whole profile page, both auth forms — is a hardcoded English literal.
**Test:** switch to ru and uz → no English leaks on any screen; no raw keys rendered; long translations do not break layout.
**Commit:** `feat(i18n): translate remaining UI strings`

#### M9-07 · Mobile layout — **SAFE**
`docs/PRODUCT_SPEC.md` lists Mobile Friendly as a core principle.
**Test:** 375px viewport — columns scroll horizontally, cards are readable, modals fit, the sidebar collapses, drag works by touch (`touch-none` is already set on the cards).
**Commit:** `feat: mobile board layout`

#### M9-08 · Drop unused dependencies — **SAFE**
`axios`, `shadcn` (a CLI listed as a runtime dependency), `@dnd-kit/react`, `@dnd-kit/modifiers`, `@dnd-kit/utilities`, and `@dnd-kit/sortable` if `arrayMove` has been inlined (it is six lines). Reassess the two persist-client packages — keys are board-scoped by now, so persistence is finally safe to consider; adopt it deliberately or remove them.
**Test:** build green; bundle smaller; full Smoke checklist.
**Commit:** `chore: drop unused dependencies`

#### M9-09 · Naming cleanup — **SAFE**
`useColumnsApi.ts` exporting `useColumns`; `todoApi.ts` vs the documented `todosApi.ts`; `fetchTodos`/`addTodo` vs the documented `getTodos`/`createTodo`; `SortableColumn` using `useDraggable`; `TodoColumnMenu` imported as `TodoStatusMenu`; `constants/consants.ts`; inconsistent `I` prefixes.
**Do this opportunistically as files are touched wherever possible.** A single sweeping rename PR is a large diff with zero behavioural value; this task exists to catch what opportunism missed.
**Commit:** `refactor: align names with API.md conventions`

#### M9-10 · Virtualisation — **SAFE, CONDITIONAL**
**Only if M9-05's profiling proves a real problem.** `docs/FRONTEND.md` says *"Virtualize long lists if necessary."* Virtualising a 40-card column is a dependency and a pile of scroll bugs bought for nothing. Skip by default; record the decision.
**Commit:** `perf(kanban): virtualise long columns`

### Expected commit order — Milestone 9

```
1.  feat(a11y): keyboard drag and drop                    (M9-01)
2.  feat(a11y): roles and drag announcements              (M9-02)
3.  feat(i18n): translate remaining UI strings            (M9-06)
4.  feat: mobile board layout                             (M9-07)
5.  perf: lazy-load routes                                (M9-03)
6.  chore: React Compiler decision                        (M9-04)
7.  perf(kanban): memoise cards based on profiler findings(M9-05)
8.  chore: drop unused dependencies                       (M9-08)
9.  refactor: align names with API.md conventions         (M9-09)
10. perf(kanban): virtualise long columns                 (M9-10)  ← conditional
```

---

# PART IV — ROADMAP (M10 → M13)

**These are directions, not commitments, and they are deliberately not decomposed into tasks.** A milestone leaves this part and enters Part III when its architecture is understood well enough to write task IDs, dependencies, risk labels and acceptance criteria for it — the same standard M0–M9 meet. Writing forty speculative task IDs now would produce a plan that is wrong in forty places.

One exception, and it is deliberate: **M10-00** is named below because it is a cleanup whose scope is already fully known and which must happen before the rest of M10 is designed. It is the only pre-assigned ID in this part.

Each section below records the same four things: what the milestone is for, what it depends on, **the schema decisions it forces** (the reason it is written down this early), and what it is explicitly *not*.

Everything here inherits the *Permission Model* unchanged. None of it introduces a new role, and none of it may be enforced in the client.

---

## Milestone 10 — Work Item Depth · 🗺 Roadmap

**For.** Making a work item more than a title: types (Task / Bug / Story / Epic), labels, subtasks, and links between items. This is the largest single step toward Jira-level functional depth, and the one with the most schema consequences.

**Depends on.** M5 (the detail view is where all of this is edited), M7 (comments establish the board-scoped child-table pattern).

**Schema decisions it forces — the reason this section exists.**

- **Where does a type live?** A `todos.type` text column with a check constraint, mirroring `columns.category` and `priority`, or a lookup table. The existing precedent is the constrained text column, and it is the right default: a fixed set users pick from and never define. **A lookup table only becomes right when users can define their own types**, which is a different product decision and would be its own task.
- **Do Epics live in `todos`?** A hierarchy where an Epic is a work item with children is one table and one self-referencing `parent_id`; an Epic as its own entity is a second table and a second set of policies, views and cache functions. The one-table answer is almost certainly right, and it must be decided **before** subtasks are built, not after.
- **Subtasks vs. children.** If `parent_id` serves both "subtask of a task" and "task in an epic", the difference is `type`, not structure. Decide whether a subtask appears on the board as a card. Answering "no" is what makes a subtask cheap; answering "yes" makes ordering, columns and the backlog all inherit the question.
- **Links.** A `work_item_links(from_id, to_id, type)` table with a symmetric-pair rule. Decide whether links are directional (`blocks`/`blocked by`) and whether the inverse is stored or derived — storing both halves doubles the write path and the delete path forever.
- **Labels.** `labels` + `todo_labels`, board-scoped (Appendix B already defers these). Labels belong to a board, not globally, or two teams fight over one namespace.
- **Every new table carries `board_id` and is policed by `board_role(board_id)`**, per M7-01. That decision is already made; do not re-litigate it per table.

**Explicitly not.** Custom fields. User-defined work item types. Cross-board links. See Appendix E.

**Prerequisite cleanup — M10-00.** `todos.status` and `todos.previous_status` still exist and are dead (RLS_AUDIT finding D). Drop them before adding `type`, or the schema will carry two plausible-looking status concepts into the milestone that is about to add a third.

---

## Milestone 11 — Backlog & Views · 🗺 Roadmap

**For.** UX principle 2 — one data model, many views. A backlog, a list/table view, and the Kanban board as three renderings of the same rows.

**Depends on.** **M6 is a hard prerequisite**, not a soft one. A backlog is a second ordered view of the same work items; with dense integer positions, two views renumber a column from two stale snapshots and the loser's ordering is silently lost. Fractional ranks are what make a second ordering surface safe.

**Schema decisions it forces.**

- **What is "in the backlog"?** A nullable `column_id` (a work item that exists on the board but is in no column) or an explicit flag. `todos.column_id` is already nullable, so the shape exists — but the FK is `on delete restrict` and every current query assumes a column. Decide before building, and check what a null `column_id` does to `useTodosByColumns`, the DnD collision detection, and every cache function.
- **Does the backlog have its own ordering?** If a work item's position in the backlog is independent of its position in a column, that is a second rank, not a reused one.
- **View state: persisted or ephemeral?** Column collapse is client-only today (`KanbanBoard`). A saved view configuration is a table; a per-session one is not. **Do not build a `board_views` table until a user can actually name and reuse a view** — that is M12 territory.

**Explicitly not.** Timeline/Gantt and roadmap views. They need dependencies and date ranges that do not exist yet, and they are the clearest example of a Jira feature that is easy to want and expensive to justify. Revisit only if scheduling becomes a real requirement.

---

## Milestone 12 — Search & Filtering · 🗺 Roadmap

**For.** Finding work across a board — by text, assignee, label, type, priority, status — and reusing a filter without rebuilding it.

**Depends on.** M10 (there is little worth filtering by until types and labels exist).

**Schema and architecture decisions it forces.**

- **Where does filtering run?** Client-side filtering over the already-cached board array is nearly free and correct up to the board size the cache holds; server-side filtering is a new query shape, a new cache key per filter, and a new interaction with the PostgREST `max_rows = 1000` cap. **Start client-side over the existing `["todos", boardId]` cache.** Move server-side when a board outgrows the cache, and record the threshold when it does — that is the same trigger as the cursor-pagination deferral in Appendix B.
- **Text search.** Postgres full-text (`tsvector` + a GIN index) is the answer when server-side search arrives, and it is a migration, not a library. Do not add a search dependency.
- **Saved filters.** A `saved_filters` table is board-scoped and permission-scoped like everything else. Decide whether a saved filter is personal or shared — a shared filter is visible to every member and therefore has an owner and an edit permission, which is a small permission system of its own. **Personal-only is the cheaper first answer.**
- **Command palette.** A Part I differentiator, and it is a UI surface over search, not a separate data feature. It can ship before saved filters and needs no schema at all. It is the highest product-identity return in this milestone.

**Explicitly not.** A query language (JQL-equivalent). Cross-board search. Both are real features; neither is justified before the single-board case is good.

---

## Milestone 13 — Configurable Workflow · 🗺 Roadmap

**For.** Turning columns into statuses with rules: which transitions are allowed, what a transition requires, and who may perform one. This is what separates "a Kanban board" from "a work-management product", and it is deliberately last because it is the decision most expensive to get wrong early.

**Depends on.** M10 (transition rules that cannot mention work item type are half a feature), M3 (transition permissions are role-scoped).

**Schema decisions it forces.**

- **Is a column a status?** Today they are the same row, and `columns.category` (`todo | in_progress | done`) is the coarse semantic. Two possible futures: keep one table and hang transition rules off column pairs, or split `statuses` from `columns` so several columns can show one status. **One table is right until a board genuinely needs the split**, and the plan should say so rather than pre-splitting — but the decision must be conscious, because it is the one migration in this document that would touch every work item row, every policy and every DnD path at once.
- **Where are transitions enforced?** In the database, like every other rule. A transition rule enforced only in `onDragEnd` is not a rule. That means `todos.column_id` changes get a trigger or an RPC, which interacts directly with M6's single-row rank writes — design them together or one will undo the other.
- **Is `category` still needed?** It drives the done-flash, the column palette and the derived doneness that replaced `todos.completed` in M2-15. A workflow model must either keep it or replace every one of those consumers. Keeping it is fine; forgetting it is not.
- **Per-board or global?** Per-board, like everything else in this architecture. `docs/ARCHITECTURE.md`: *"Does this belong to a Board?"*

**Explicitly not.** Automation rules ("when X then Y"), workflow approval steps, and shared workflow schemes across boards. Each is a product in itself. See Appendix E.

---

# PART V — DEFERRED / PRODUCTION HARDENING

**Nothing in this part blocks any task in Part III or Part IV.**

These are real concerns and they are kept, not deleted. They are deferred because this is a portfolio project: the database holds fixtures, there are no users, there is no uptime commitment, and every item here costs money or days to buy insurance against a loss that would currently be a shrug.

Each carries the trigger that reopens it. **The single trigger that reopens most of this part at once: the project takes real users.**

> **What is NOT in this part, and must never be moved here:**
> - The role matrix — viewer / editor / admin / owner — and its enforcement in RLS, `SECURITY DEFINER` helpers and RPCs.
> - Owner immutability (I1–I6), enforced in the database.
> - `board_members` having no client-writable policy.
> - M3-16, the REST-level role verification.
> - The avatar storage hole (Appendix B) — a live, exploitable bug, cheap to fix.
>
> Those are **product requirements and security correctness**, not hardening. A portfolio project that leaks other people's boards is not a portfolio project. Deferring recovery tooling is a budget decision; deferring authorization would be a defect.

| ID | Deferred item | Why it is deferred | Reopen when |
|---|---|---|---|
| **PH-01** | **Enable PITR** (was M3-00) | ~$125/month recurring, uncapped by the spend cap, requiring Pro + a Small compute add-on and ~2 min of downtime — to insure two test accounts and 21 work items. Its window starts at enablement, so it protects nothing already stored, and a PITR restore is a whole-project rollback that is the wrong tool for reverting a policy. | Real user data exists, **or** before the next Tier B migration (M6-05 drops `position`). |
| **PH-02** | **Verified dump-restore rehearsal** ("an untested backup is not a backup") | Restoring a dump into a scratch database to prove it works is the right standard for data that matters. For Tier A migrations there is nothing to restore, and Tier B is currently one future task. | The first Tier B migration is scheduled (M6-05), or real user data exists. |
| **PH-03** | **RLS membership performance verification** (was M3-12) | Seeding 500 cards, 12 columns and 10 members to `explain analyze` a fixture-scale app measures a problem that does not exist yet. The structural mitigation — both `board_members` indexes plus the M2-05 set — is already in place. | A real board passes a few hundred work items, or the board is visibly slow. Absorbs the `explain analyze` M3-02 skipped. |
| **PH-04** | **Branch-database rehearsals** (Rule 5, for Tier B) | `supabase branches create` per destructive migration is a paid feature and a day of setup. Tier A migrations reverse with SQL. | Same as PH-02. |
| **PH-05** | **Deployment ritual**: apply off-peak, watch 403s for fifteen minutes, maintenance windows, stop-writes procedures | There is no peak, no traffic and nobody to inconvenience. Applying a migration and then using the app is the honest equivalent today. | The app is deployed somewhere users reach it. |
| **PH-06** | **Observability**: error tracking, uptime monitoring, query performance dashboards, billing alerts | Nothing to observe and nobody paged. The `MutationCache` toasts from M1-07 already surface failures to the one person using the app. | Real users, or a deploy that is not a laptop. |
| **PH-07** | **Backup retention and incident runbooks** | Rule 2's forward-fix migration is the whole recovery story at this scale, and it is written into each migration file already. | Real user data exists. |
| **PH-08** | **Revoke unnecessary `anon` table privileges on `public.profiles`** | Privilege hygiene, not an exposure — see the note below. Fixing it means touching the table the signup path writes to, which is its own blast radius; M0-07 deferred it for that reason and the reasoning still holds. | The production-hardening / security pass, or any change that already touches `profiles` privileges. |
| **PH-09** | **Normalize excessive non-DML table privileges across `boards`, `todos`, `columns`, `profiles`** | `authenticated` retains `TRUNCATE`, `REFERENCES` and `TRIGGER` on all four, inherited from the baseline's `GRANT ALL`. PostgREST issues only SELECT/INSERT/UPDATE/DELETE, so none is reachable today. Four tables × the revoke-all-then-grant-back shape is a focused hardening pass, not a bug fix. | The production-hardening / security pass. Do it in one migration, not piecemeal. |

**PH-08 and PH-09 in more detail**, because both were surfaced by the M3-13 review and both are easy to mis-state.

**PH-08 — `anon` on `public.profiles`.** `20260804000000_baseline_schema.sql:367` grants `ALL` on `profiles` to `anon`, and no migration has ever revoked it. RLS *is* enabled on the table (`baseline:172`) and its only policy is `USING (auth.uid() = id)`; for `anon`, `auth.uid()` is null, so the comparison yields null and **no row is returned**. **This is excessive table privilege, not an active data exposure** — do not describe it as a leak. It is the second exception to the pattern M0-07 and M2-01 established; the M3-13 migration comment records that correction. **Not part of M3-13**, which touches `board_members` only.

**PH-09 — non-DML grants.** Verified against every revoke in the repository: the complete set is `todos`, `columns`, `todos_id_seq` (M0-07), `boards` (M2-01) and `board_members` (M3-13). M0-07 and M2-01 revoked `anon` only and never narrowed `authenticated`, so `authenticated` still holds the three non-DML privileges on all four tables. `TRUNCATE` in particular is not filtered by RLS — which is why it is worth fixing eventually, and why "unreachable through PostgREST" is a reason to defer rather than to dismiss. M3-13 is the first migration to use revoke-all-then-grant-back; PH-09 applies that shape to the rest.

Neither becomes M3 work. M3 stays on the product permission system.

**How to use this part.** When a Part III task references a deferred control — a dump, a rehearsal, PITR, a soak window — that reference is satisfied by the corresponding PH row. Do not re-add the control to the task; if you believe it is genuinely needed, move the PH row back into a milestone with the reason, in the same PR.

---

# Appendix A — Task Index by Risk

Each carries a documented backup, rollback and migration strategy in its task entry.

| Task | Status | What makes it high risk |
|---|---|---|
| M0-07 | ✅ | Changes the live security boundary |
| M2-06 | ✅ | First data migration; reversible only because `user_id` still existed |
| M2-07 | ✅ | Constraints and FKs; breaks inserts that omit `board_id` |
| M2-08 | ✅ | Rewrites the authorization boundary |
| M2-13 | ✅ | **Point of no return** — dropped `user_id` |
| M2-14 | ✅ | Primary key type change in one transaction |
| M3-03 | ✅ | Must precede M3-04/05 or every owner is locked out. **Applied without a dump** |
| M3-04 | ✅ | Authorization boundary. **Applied without a dump** |
| M3-05 | 🔶 | Authorization boundary. Applied without a dump (Tier A, correct); committed `3c3eec8`. Role matrix still unverified — M3-16 |
| M3-14 | ⬜ | Privilege-granting functions; a flaw hands over a board. **Tier A** — the mitigation is review and M3-16, not backups |
| M3-15 | ⬜ | Changes what the database will accept from every writer, including `service_role`. **Tier A** |
| M4-03 | ⬜ | Privilege-granting function |
| M6-01 → M6-05 | ⬜ | Ordering migration (five tasks, expand→contract) |
| M8-08 | ⬜ | Cascade verification; never run against production |

Medium-risk tasks that touch the authorization boundary: **M3-13** (widens read access), **M3-17** (replaces a policy), **M3-18** (adds a constraint that can fail on existing rows). All three are Tier A.

**HIGH RISK does not mean "needs backup infrastructure".** It means the change is easy to get wrong and expensive to notice. Match the mitigation to the failure mode:

- **Tier A** (every remaining M3 task): capture the prior definition verbatim in the migration, write the forward-fix rollback in the same file, and **test the denial branches before the success branches**. That is the whole procedure.
- **Tier B** (M2-13 and M2-14, already shipped; M6-05, future): the Backup procedure, plus the deferred controls in Part V when they are reopened.

The deployment ritual the original plan attached to every HIGH RISK task — off-peak windows, fifteen-minute 403 watches, branch rehearsals — is deferred to PH-04 and PH-05. M3-03, M3-04 and M3-05 shipped without it, correctly, and that is recorded rather than treated as debt.

---

# Appendix B — Deferred Decisions

Decisions deliberately postponed, with the trigger that should reopen them. **A deferral is a decision, not an omission** — if one of these is skipped without a note, it becomes invisible debt.

| Decision | Deferred to | Reopen when |
|---|---|---|
| `noUncheckedIndexedAccess` | M9 | The team wants it; it is a large diff for a mostly-guarded bug class |
| Cache persistence (`persist-client`) | M9-08 | Keys are board-scoped and cache clears on sign-out — both true after M2/M1-02 |
| Email invitations | Post-M4 | A transactional email provider is in place |
| `activities` table | M7-05 | An activity feed UI is actually being designed |
| `attachments`, `labels`, `todo_labels` | M10 | A product requirement exists. Design FKs so they *can* attach to `todos`; build nothing |
| Soft deletion beyond `archived` | Indefinite | A concrete undo requirement appears. Broad soft-delete taxes every query and every RLS policy forever |
| List virtualisation | M9-10 | Profiling proves a real problem |
| React Testing Library | Post-M9 | A component bug ships that a unit test would have caught. Pure logic is where the risk lives |
| Cursor pagination | Post-M8 | A board approaches the `max_rows = 1000` PostgREST cap. `docs/API.md`: *"Avoid until necessary"* |

**Added in the 2026-08-10 audit:**

| Decision | Deferred to | Reopen when |
|---|---|---|
| **PITR** | **Part V, PH-01** | Real users, or the next Tier B migration (M6-05). Costed and decided 2026-08-10 — see M3-00 |
| **Avatar storage path hole** (RLS_AUDIT item 3) | **Unowned — needs a task. NOT production hardening** | Now-ish. Any authenticated user can overwrite any other user's avatar: a live, exploitable authorization bug. It is security correctness, so it does **not** belong in Part V. One task: path change (`<uid>/avatar.png`), three storage policies, a bucket size limit. Cheap. Fold it into M3 or M8 rather than leaving it homeless |
| `handle_new_user()` missing `search_path` (RLS_AUDIT item 6) | Next migration that touches auth provisioning | Cheap hardening; fold it into whichever task is next in that file |
| Dead `todos.status` / `previous_status` columns | M10-00 | Before work item types are added — three status-shaped concepts in one table is a trap |
| **Board ownership transfer** | Post-M4 | A user asks to hand over a board, or an owner leaves the organisation. **Until it exists, the Owner of a board never changes** (invariant I6). It is not a membership operation and must not be smuggled into one |
| Board-level roles vs. workspace/organisation roles | Post-M8 | Workspaces become real (`docs/ARCHITECTURE.md` names them as future scope). The four roles are **board**-scoped; an organisation role is a second, orthogonal system and a deliberate architecture decision, not an extension of this one |
| Multiple owners per board | Rejected, not deferred | Would break invariant I1 and make "the ultimate authority" ambiguous. Admins exist for shared administration |
| Renaming the `todos` table to `work_items` | **Rejected** | Touches every policy, index, FK, cache function, realtime publication and query key for zero user-visible gain. "Work item" is the product word; `todos` is the table name |
| Server-side filtering and full-text search | M12 | A board outgrows what the client cache can filter — same trigger as cursor pagination |
| Splitting `statuses` from `columns` | M13 | A board genuinely needs two columns showing one status |
| Viewer comment permission | **M7 — must be decided, not deferred again** | Before `comments` RLS is written |

---

# Appendix C — Quick Reference

```bash
npm run dev                  # vite dev server — does NOT typecheck
npm run build                # tsc -b && vite build — the only typecheck
npm run lint                 # eslint .
npm test                     # vitest run — the only test mechanism
npm run test:watch

npm run db:pull              # capture live schema        (needs Docker)
npm run db:push              # apply migrations — the ONLY way schema changes ship
npm run db:diff -- -f <name> # generate a migration from local changes (needs Docker)
npm run db:types             # regenerate src/types/database.ts
```

**Before a Tier B migration only** (drops a column/table, changes a type, or writes existing rows):
```bash
supabase db dump --linked -f backups/pre-<task-id>-$(date +%Y%m%d-%H%M).sql
# then: confirm non-empty, record row counts for the affected tables
# Tier A — policies, functions, triggers, constraints — needs none of this.
# PITR is deliberately not enabled: Part V, PH-01.
```

**Proving a permission rule** — the only evidence that counts (see Testing Checklist):
```bash
# read denial: expect [] , not the rows
curl "$URL/rest/v1/todos?board_id=eq.$BOARD&select=*" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ROLE_JWT"

# write denial: expect 42501, or 0 rows affected
curl -X PATCH "$URL/rest/v1/todos?id=eq.$ROW" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ROLE_JWT" \
  -H "Content-Type: application/json" -d '{"title":"nope"}'

# RPC denial: expect the function's own raised error
curl -X POST "$URL/rest/v1/rpc/set_member_role" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"p_board_id":"'$BOARD'","p_user_id":"'$OWNER_ID'","p_role":"viewer"}'
```

---

# Appendix D — Forward Schema Decisions

Decisions whose **cost of delay is real**, listed with the milestone that must make them and what gets more expensive by waiting. This is the answer to "will this make a later feature harder?", written down once instead of rediscovered per milestone.

A decision is on this list only if deferring it makes the eventual change *structurally* harder — a migration that touches every row, every policy, or a foreign key that other tables have started pointing at. A nullable column that can be added cheaply at any time is **not** on this list, and adding it early would be speculative work.

| Decision | Must be made by | Cost of deciding late |
|---|---|---|
| Work item type in `todos` vs. a separate entity | **M10** | Once `comments`, links and activity hold FKs to `todos.id`, restructuring the entity is the M2-14 problem again, at ten times the row count. This is the same argument that put the uuid migration in M2 |
| Epic/subtask hierarchy: `parent_id` in one table vs. a second table | **M10, before subtasks are built** | A second table means a second set of policies, cache functions, realtime handlers and views — permanently, and in every future milestone |
| Whether a subtask renders as a board card | **M10** | Decides whether subtasks inherit column, position, rank, DnD and backlog semantics. Reversing it touches every one of them |
| Link directionality and whether the inverse is stored | **M10** | Storing both halves doubles the write and delete paths forever; switching later requires a data migration and a dedupe |
| `board_id` denormalised onto every board-scoped child table | **M7-01 — sets the precedent** | Retrofitting means rewriting each table's policies from a join to a key, and every one of them is a security-boundary change |
| Backlog: nullable `column_id` vs. an explicit flag | **M11** | Every query, cache function and DnD path currently assumes a column. The FK is `on delete restrict`. Changing the assumption later is a sweep through the whole board layer |
| Second ordering surface (backlog rank vs. column rank) | **M11, after M6** | Two views renumbering one column from stale snapshots is silent data loss, not a merge conflict |
| Columns as statuses vs. a separate `statuses` table | **M13** | The only remaining migration that would touch every work item row, every policy and every DnD path at once |
| Where transition rules are enforced | **M13** | A rule enforced in `onDragEnd` is not a rule, and retrofitting it into the database after M6's single-row rank writes means redesigning both |
| Per-board task key prefix (`boards.key_prefix`, replacing the hardcoded `KAN-`) | **Before keys appear anywhere outside the card** | Once a key is in a URL, a comment, a notification or an external reference, it is an identifier people rely on. Cheap now: one nullable column plus one string interpolation in `TodoItem.tsx` |
| Board-scoped roles vs. workspace/organisation roles | **Before workspaces** | A second permission system layered on a first is the hardest kind of authorization change to get right. Decide the relationship before either exists |

---

# Appendix E — Explicitly Out of Scope

Capabilities Jira has that this project is **not** committing to. Listing them is the point: an unlisted feature gets re-argued every few months, and "Jira has it" is not a requirement.

None of these are refused permanently. Each has a condition that would reopen it — and none of those conditions is "it would be impressive".

| Not building | Would reconsider when |
|---|---|
| Sprints and sprint planning | The product has real users running iterations, and the backlog (M11) is in daily use. Sprints without a used backlog are ceremony |
| Releases and versions | Something is actually being released against these boards |
| Advanced roadmaps, timeline/Gantt | Dependencies and date ranges exist and are maintained — neither is true today |
| Automation rules ("when X then Y") | Workflows (M13) exist and users are hand-repeating a transition often enough to name it |
| Custom fields | Users hit a genuine limit of the fixed field set. Custom fields tax every query, every view, every filter and every form, permanently |
| User-defined work item types | Same trigger as custom fields, and it converts the type constraint into a lookup table |
| Enterprise SSO / SAML / SCIM | An organisation that requires it is adopting the product |
| Marketplace, plugins, third-party integrations | There is a product to integrate *with*, and a stable public API — neither exists |
| Jira-style administration console (schemes, permission schemes, screens) | Never in this shape. It is the clearest example of Jira complexity that exists to serve Jira's configurability, not the user's work |
| A query language (JQL-equivalent) | Filtering (M12) is good and users are still hitting its ceiling |
| Cross-board search and cross-board links | Multi-board usage is real and the single-board case is already good |
| Guest users / public boards | `boards.visibility` already has the column; it needs a permission story of its own, not a fifth role |
| Notifications, AI assistant, templates, calendar view | `docs/PRODUCT_SPEC.md` lists these as long-term. They stay long-term until a milestone can state their dependencies |

The two questions that decide anything on this list:

1. **Does it add capability, or does it add resemblance?** Resemblance is not a feature.
2. **Does the thing it depends on already exist and get used?** Sprints need a used backlog; automation needs used workflows; custom fields need a felt limit. Building the dependent feature first is how a product ends up with a configuration surface nobody configures.

---

*Milestones 0 and 1 were prerequisites, not suggestions. Milestone 2 is the milestone this plan originally existed for — every card, menu, modal and query written before it landed was written against an ownership model the documentation had already declared wrong. Milestone 3 is the one it exists for now: until the role matrix is verified at REST level and the Owner is protected by the database, every screen built on top of membership is a screen built on an assumption.*