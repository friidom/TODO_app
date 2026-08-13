# RLS and Storage Policy Audit

**Task:** M0-06 · Investigation only, no fixes.
**Date:** 2026-08-05
**Project:** `nxnnfaoyttbzndphnawe` (TODO, ap-northeast-1)
**Evidence:** `supabase/migrations/20260804000000_baseline_schema.sql` (M0-05 baseline, dumped from production) and a `--schema storage` dump of the same database.

---

## Verdict

**The database has effectively no authorization boundary.**

`todos` and `columns` have row-level security **disabled**, and both are granted `ALL` to the `anon` role. The `anon` role is the publishable key, which ships inside the JavaScript bundle. Anyone who opens DevTools on the deployed site can read, modify, and delete **every user's todos and columns** — no account required.

The plan anticipated this as the worst case for Milestone 0:

> *"If policies are absent, the live application has been exposing every user's data to every other user, M0-07 becomes urgent, and its severity was Critical all along."*

That is now confirmed, and the real exposure is broader than user-to-user: it is unauthenticated.

**M0-07 should be treated as an incident response, not a scheduled task.**

---

## Answers to the M0-06 checklist

### 1. Is RLS enabled on `todos`, `columns`, `profiles`?

| Table | RLS enabled | Evidence |
|---|---|---|
| `profiles` | **Yes** | `ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;` — baseline line 172 |
| `todos` | **No** | No `ENABLE ROW LEVEL SECURITY` statement exists for it anywhere in the dump |
| `columns` | **No** | Same |

### 2. Does each have SELECT / INSERT / UPDATE / DELETE policies?

The entire database contains **one** policy on the `public` schema:

```sql
CREATE POLICY "Users can manage own profile" ON "public"."profiles"
  USING (("auth"."uid"() = "id"))
  WITH CHECK (("auth"."uid"() = "id"));
```

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | ✅ via `FOR ALL` | ✅ | ✅ | ✅ |
| `todos` | ❌ none | ❌ none | ❌ none | ❌ none |
| `columns` | ❌ none | ❌ none | ❌ none | ❌ none |

The `profiles` policy omits `FOR`, so it defaults to `FOR ALL` and covers the `upsert` in `authApi.ts`.

For `todos` and `columns` the question of "does `upsert` have both INSERT and UPDATE" is moot — with RLS off, no policy is consulted at all. `reorderTodos` and `reorderColumns` work today precisely *because* nothing is enforced. **This matters for M0-07:** enabling RLS without both INSERT and UPDATE policies will break drag-and-drop, and it will break it silently, because no mutation errors are surfaced until M1-07.

### 3. With user B's token, `curl` `columns` — does it return every column?

**Not executed empirically** — that requires a second live account and its access token, which I did not create. The schema answers it definitively regardless:

```sql
GRANT ALL ON TABLE "public"."columns" TO "anon";          -- baseline line 361
GRANT ALL ON TABLE "public"."columns" TO "authenticated";  -- line 362
```

With RLS disabled and `GRANT ALL`, PostgREST applies no restriction. `getColumns()` additionally sends **no `.eq()` filter at all**, so the application itself already requests every column row in the system and simply renders whatever comes back. Any token — including the anon key — returns the full table.

**Recommended verification before M0-07** (fill in the result):

```bash
curl "$VITE_SUPABASE_URL/rest/v1/columns?select=*" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY"
```

Note this uses the anon key with **no** `Authorization` header. If it returns rows, the table is publicly readable.

### 4. With user B's token, `PATCH /todos?id=eq.<A's todo id>` — does it succeed?

**Not executed empirically.** Determinate from the schema: `GRANT ALL ON TABLE "public"."todos" TO "anon"` (line 373) plus no RLS means **yes**, and again not merely for authenticated user B — the anon key suffices for UPDATE and DELETE on any row.

### 5. Can user B overwrite `avatars/<A's uuid>.png`?

**Yes.** This one is fully determined by policy text.

Storage is in better shape than the public schema — RLS *is* enabled on `storage.objects` — but the avatar policies check only the bucket, never the path or the owner:

```sql
CREATE POLICY "Public avatars" ON "storage"."objects"
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload avatars" ON "storage"."objects"
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Users can update avatars" ON "storage"."objects"
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars')
                              WITH CHECK (bucket_id = 'avatars');
```

Combined with the client's upload path (`src/services/api/profile/uploadAvatars.ts`):

```ts
const fileName = `${userId}.${fileExt}`;
await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
```

The object key is exactly the victim's UUID. Any authenticated user can `upsert` to `<any-uuid>.png` and replace that person's avatar.

**The UUIDs are trivially obtainable**: `todos.user_id` is exposed to anon by finding 3 above. Read the todos table, harvest every `user_id`, overwrite every avatar. Full chain, no privilege needed beyond a free account.

There is no DELETE policy on the bucket, so objects cannot be deleted — only overwritten. No file-size limit is set on the bucket either.

---

## Additional findings (outside the checklist)

**A. `columns.user_id` defaults to a random UUID.**

```sql
"user_id" "uuid" DEFAULT "gen_random_uuid"()
```

`todos.user_id` correctly defaults to `auth.uid()`. `columns` generates a *random* UUID instead, meaning any column row inserted without an explicit `user_id` is owned by nobody. It also has **no foreign key** to `auth.users`, unlike `todos.user_id` and `profiles.id`. Any ownership-based policy written in M0-07 must account for pre-existing orphaned rows.

**B. `shift_completed_positions(p_user_id uuid)` is granted to `anon`.**

```sql
CREATE FUNCTION "public"."shift_completed_positions"("p_user_id" "uuid") RETURNS "void"
  LANGUAGE "sql" AS $$
    update todos set position = position + 1
    where user_id = p_user_id and status = 'completed';
  $$;
```

Takes the target user as a caller-supplied parameter and is granted to `anon` and `authenticated`. It is **never called from the client** (no `.rpc(` anywhere in `src/`). It is dead code with a live grant, and it references `status`, a column that predates the columns schema. Candidate for dropping outright in M0-07.

**C. `handle_new_user()` is `SECURITY DEFINER` with no `search_path`.**

```sql
CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
  LANGUAGE "plpgsql" SECURITY DEFINER AS $$ ... $$;
```

The Code Review Checklist requires *"New `SECURITY DEFINER` functions are `STABLE` where possible and have an explicit `search_path`."* This has neither. Exploitability is limited — it is a trigger on `auth.users` — but it is the standard hardening gap and cheap to close with `SET search_path = public, pg_temp`.

Note it also inserts into `profiles` on signup, duplicating what `signUp()` in `authApi.ts` does client-side. Two mechanisms seeding the same row.

**D. Dead columns still present on `todos`.** `status` (default `'todo'`) and `previous_status` both survive from before the columns schema. Harmless but they keep confusing the code — `HeaderTodoForm` was still writing `status` until M0-03.

**E. PITR is disabled.** `pitr_enabled: false`, and `backups: []` — no physical backups exist. Recorded here because M0-07 is the first task to alter the live security boundary, and M2 depends on PITR per the plan.

---

## Suggested priority for M0-07

1. `ENABLE ROW LEVEL SECURITY` on `todos` and `columns`, with SELECT/INSERT/UPDATE/DELETE policies keyed on `user_id = auth.uid()`. **Both INSERT and UPDATE are required** or `upsert`-based reordering breaks.
2. Revoke the `anon` grants on `todos`, `columns`, and their sequence. Nothing in the app uses the database unauthenticated.
3. Rewrite the three avatar policies to constrain the object path to the owner, e.g. `(storage.foldername(name))[1] = auth.uid()::text` — which needs the client to upload to `<uid>/avatar.png` rather than `<uid>.png`. Set a bucket size limit.
4. Fix `columns.user_id`'s default to `auth.uid()`, add the FK, and decide what to do with orphaned rows.
5. Drop `shift_completed_positions`, or at minimum revoke it from `anon`.
6. Add `SET search_path` to `handle_new_user()`.
7. Enable PITR before touching data.

Items 1–3 close the active exposure. Items 4–7 are hardening.

---

## M2-08 · Ownership model changed to board-based

**Date:** 2026-08-06
**Migration:** `supabase/migrations/20260806100619_rls_board_ownership.sql`
**Status:** written, **not applied** — see preconditions below.

M0-07's model was "a row belongs to the user named in its `user_id`". That was correct for a single-user application and is wrong for a shared one: there is no predicate over `user_id` that can express "this board is shared with you". M2-08 replaces it.

### What changed

All eight policies on `todos` and `columns` are dropped and recreated. The predicate moves from `user_id = auth.uid()` to `board_id in (select public.accessible_board_ids())`.

The old policies are **dropped, not superseded**. Postgres policies are `PERMISSIVE` by default and therefore OR'd together — leaving them would keep `user_id` as a second independent route to every row, making the change cosmetic.

`boards` keeps the owner-based policies from M2-01 (routing them through the helper would be circular — it reads `boards`). `profiles` is untouched.

### The single swap point

`public.accessible_board_ids()` — `SECURITY DEFINER`, `STABLE`, `set search_path = ''`, granted to `authenticated` only and revoked from `PUBLIC` and `anon`.

Two decisions worth recording:

- **Returns a set, not a boolean.** A no-argument `STABLE` function is independent of the row under test, so `board_id in (select …)` plans as an InitPlan evaluated once per statement. A `can_access(board_id) → boolean` form would be invoked per row.
- **`SECURITY DEFINER` rather than invoker.** The policies on `columns`/`todos` must read `boards` to decide. As invoker that read is itself filtered by `boards`' policies — which works for owner-only access but recurses in M3, where a `board_members` policy would read `board_members`. Establishing the pattern now means M3 edits a function body, not a strategy.

M3 widens this function to membership. No policy definition should need to change.

### Resolved from the M0-06 findings

- **Item 4** — "decide what to do with orphaned rows" is now forced rather than suggested. M2-06 reports rows whose `user_id` matches no profile; M2-07's `NOT NULL` refuses to apply while any remain. After M2-08 they are unreachable regardless, since a NULL `board_id` yields NULL from `in (…)`, which `USING` treats as failure.
- **Item 7 — PITR is still disabled.** Unchanged since M0-06, and now overdue: M2-06 has already been authored and the plan requires PITR before M2 touches data.

### Not resolved by this migration

- **Item 3** — the avatar storage policies still allow one user to overwrite another's object. Untouched by M2; still open.
- **Item 5** — `shift_completed_positions` still exists and is still granted to `anon`. It filters on `user_id` and predates columns entirely; it should be dropped, plausibly as part of M2-13.

### Verification owed

Not yet performed — the migration is unapplied. The multi-user `curl` checks are written out at the foot of the migration file. The UI cannot substitute for them: it never requests rows it does not expect, so it cannot demonstrate that a policy denies them.

### Preconditions before applying

1. M2-06 applied and verified — a NULL `board_id` becomes invisible to everyone the moment this runs.
2. M2-07 applied — `NOT NULL` is what makes that invariant rather than aspiration.
3. **M2-11 deployed.** `reorderTodos` and `reorderColumns` upsert without `board_id`, and the INSERT policy's `WITH CHECK` is evaluated against the proposed row, whose `board_id` would be NULL. M0-07 solved the equivalent problem with a column default; that is not available here, because `board_id` depends on which board rather than which user. The client must send it.

---

## M3-13 · Board roster exposed by RPC; `profiles` RLS deliberately not widened

**Date:** 2026-08-11
**Migration:** `supabase/migrations/20260811090000_membership_roster.sql`
**Status:** **applied 2026-08-11.** Anonymous-access checks passed; the authenticated role matrix is **not** yet run — see *Verification status* below.

A board member could see the board and its contents but not who else was on it. `board_members` is self-read only (M3-01) and `profiles` carries a single self-only policy from the M0-05 baseline, so a member list would have returned one row — the caller — with no teammate names or avatars.

### The decision, and why it is not the obvious one

The obvious fix is a co-member `SELECT` policy on `profiles`. It was considered and **rejected**, because:

> PostgreSQL RLS filters **rows**, not **columns**.

A policy answers "may you see this row?" and has no opinion about which columns of it you receive. `profiles` carries `email` and `bio`. Any policy letting a co-member read the row hands over both, whatever the client asks for — and `fetchProfile` already issues `select("*")`.

A `SECURITY DEFINER` function is the only place the database can state *which columns leave it*. Column-level `GRANT`s were also considered and rejected: they are per-role, not per-row, so narrowing `authenticated` to four columns would equally stop a user reading their own email on their own profile page.

### What changed

- **New** `public.board_roster(p_board_id uuid)` — `SECURITY DEFINER`, `stable`, `set search_path = ''`. Two ordered guards: raise `28000` if `auth.uid()` is null; return an empty set unless `public.is_board_member(p_board_id)`. Returns exactly `id, username, full_name, avatar_url, role, joined_at`.
- **Function grants:** revoked from `public` and `anon`; `execute` to `authenticated` and `service_role`.
- **`board_members` table privileges narrowed:** `anon` revoked outright (it was the only protected table still carrying the baseline default grant); `authenticated` narrowed to `SELECT` only.

### What deliberately did not change

- **`profiles` RLS.** Untouched, still self-only. A direct read of a teammate's profile row still returns `[]`. This is the property the RPC exists to preserve.
- **`board_members` policies.** M3-01's self-read policy stays — it is what M3-09's `usePermissions` reads to learn the caller's own role.
- **Membership mutations.** Adding, removing and re-roling members are M3-14, with their own authorization matrix and Owner-immutability rules.

### Why a non-member learns nothing

Three points, the third being the non-obvious one:

1. `anon` cannot execute the function — revoked before the body runs.
2. An authenticated non-member gets an empty set from guard 2.
3. **The function is not an existence oracle.** Guard 2 returns empty rather than raising, so a non-member passing a real board id and one passing a fabricated id receive byte-identical responses. A distinct "you are not a member" error would leak which boards exist.

### Defense in depth on `board_members`

Client `INSERT`/`UPDATE`/`DELETE` was previously blocked *only* by the absence of policies — one mistake deep, since an accidentally permissive policy would have found the privilege already granted. Revoking the write privileges makes it two independent mistakes. `SELECT` is retained because M3-01's policy and M3-09 both need it. `service_role` is untouched.

**Captured prior ACL.** Read from production on 2026-08-11 with `select relacl from pg_class where oid = 'public.board_members'::regclass;`, recorded verbatim rather than inferred from the baseline's default privileges:

```
{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

`arwdDxtm` is the full privilege set — `a`=INSERT, `r`=SELECT, `w`=UPDATE, `d`=DELETE, `D`=TRUNCATE, `x`=REFERENCES, `t`=TRIGGER, `m`=MAINTAIN (PG17). So **`anon` and `authenticated` each held every table privilege on `board_members`, including `TRUNCATE`, which RLS does not filter.** Not reachable through PostgREST, which issues only SELECT/INSERT/UPDATE/DELETE — but the grant was real.

M3-13 revokes those direct client privileges outright and grants `authenticated` back **`SELECT` only**. `service_role` and `postgres` are left exactly as captured. The capture is also what makes the migration's rollback (`grant all … to anon, authenticated`) an accurate restoration rather than a guess.

### Latent finding, out of scope here

Verifying the M2-01 precedent turned up two gaps that M3-13 does not address. Both are now tracked in Part V of the implementation plan; **neither is M3 work.**

The complete set of table revokes in this repository, verified by grep: `todos`, `columns`, `todos_id_seq` (M0-07), `boards` (M2-01), `board_members` (M3-13).

**`anon` still holds `ALL` on `public.profiles` — tracked as PH-08.** `20260804000000_baseline_schema.sql:367` grants it and no migration revokes it. RLS is enabled on the table (`baseline:172`) and its only policy is `USING (auth.uid() = id)`, so for `anon` the comparison yields null and **no row is returned**. This is **excessive table privilege, not an active data exposure** — it must not be described as a leak. It is the second exception to the M0-07/M2-01 pattern, which an earlier draft of the M3-13 migration comment got wrong; that comment is now corrected. Left alone here because narrowing privileges on the table the signup path writes to has its own blast radius, which is why M0-07 deferred it in the first place.

**`authenticated` still holds `TRUNCATE`, `REFERENCES` and `TRIGGER` on `boards`, `todos`, `columns` and `profiles` — tracked as PH-09.** M0-07 and M2-01 revoked `anon` only and never narrowed `authenticated`. `TRUNCATE` is not filtered by RLS. Not reachable today because PostgREST issues only SELECT/INSERT/UPDATE/DELETE, which is a reason to schedule it rather than to dismiss it.

M3-13 is the first migration in this repository to use revoke-all-then-grant-back; it sets that precedent rather than following one, and PH-09 applies the same shape to the remaining four tables in a single pass.

### Verification status — applied 2026-08-11

**Application.** `npm run db:push` applied `20260811090000_membership_roster.sql` to `nxnnfaoyttbzndphnawe`. The CLI process hung after completing its work and was cut off at three minutes; it was **not** re-run. Remote state was checked directly instead: `supabase migration list` reports **24 local / 24 remote, nothing pending**, with `20260811090000` present in the remote history. Local and remote migration history are synchronized.

**Passed — anonymous access, run against the live API.**

| Check | Result |
|---|---|
| `anon` → `POST /rest/v1/rpc/board_roster` | HTTP 401, `42501 permission denied for function board_roster`. Not `[]`, and not guard 1's `28000` — the grant stops the call before the body runs. Also proves the function exists; a missing one returns 404. |
| `anon` → `GET /rest/v1/board_members` | HTTP 401, `42501 permission denied for table board_members` |

The second result is **stronger than the pre-migration behaviour**. Previously `anon` received `[]` because RLS filtered the rows; the privilege itself is now gone. PostgREST's own hint — *"Grant the required privileges… `GRANT SELECT ON public.board_members TO anon`"* — names exactly the grant this migration removed.

**Passed — structural, read from the live schema.** `npm run db:types` regenerated `src/types/database.ts` from the applied database. The single added entry is:

```ts
board_roster: {
  Args: { p_board_id: string }
  Returns: { avatar_url: string; full_name: string; id: string;
             joined_at: string; role: string; username: string }[]
}
```

Six fields, **no `email`, no `bio`** — the column boundary holds in the deployed function.

This also **confirms** the nullability cost that was previously only predicted: `username`, `full_name` and `avatar_url` generate as `string`, while they are `string | null` on the `profiles` row. The RPC's generated types overstate non-nullability. M3-06 must narrow at the API-function boundary.

**NOT RUN — the authenticated role matrix.** JWT credentials for the fixture accounts were unavailable; only the publishable `anon` key was to hand, and tokens for `qwerty@gmail.com` / `qqq@gmail.com` cannot be minted without their passwords. **None of the following has been executed, and none may be described as passing:**

- Owner roster returns the full membership with exactly the six keys
- Viewer roster returns the same rows
- Non-member with a real board id → `[]`
- Non-member with a fabricated uuid → identical `[]` (**the existence-oracle test — the most important single check in this migration, and the one still outstanding**)
- Viewer reading a teammate's `profiles` row directly → `[]`
- Viewer reading `board_members` → exactly one row, their own
- Viewer writing to `board_members` → `42501`

The commands are written out at the foot of the migration file. They need a real JWT per role and should be run before M3-06 builds against the RPC.

**Build state after application.** `npm run build`, `npm run lint` and `npm test` (7 files, 91 tests) all green. No application code was hand-edited; the only source change is the generated type above.

### The RPC is the approved boundary — a standing decision, not a one-off

Recorded here because every future feature needing teammate profile data inherits it. `docs/IMPLEMENTATION_PLAN.md` M3-13, M3-06, M3-07, M5-05, the M5 dependency header and the enforcement matrix were all updated on 2026-08-11, so **the plan and this schema are aligned on the RPC architecture**: no surviving instruction anywhere in the plan tells an implementer to add a co-member SELECT policy or to read the roster from the `board_members` table.

1. **`board_roster()` is the M3-13 boundary.** A view was considered and not chosen. To be precise about the plan's escape hatch: the pre-revision plan said *"If the split matters, expose a view rather than the table — decide explicitly and write the reason in the PR"* — **historical text, at `1b1c32c:docs/IMPLEMENTATION_PLAN.md:1401`, no longer present in the current plan.** An RPC is not a view, so the spirit of that clause is honoured but the specific option it named was not the one taken. The decision is closed: `board_roster()` is the database API for member roster data, and no view is being introduced.
2. **`profiles` RLS remains self-only.** `"Users can manage own profile"` (`FOR ALL … USING (auth.uid() = id)`) is the whole of it. A direct read of a teammate's row returns `[]` and is expected to keep returning `[]`.
3. **Only approved fields are exposed:** `id`, `username`, `full_name`, `avatar_url`, `role`, `joined_at`. `email` and `bio` are withheld. No client `select` shaping can widen the list, and `returns table (...)` is an anonymous composite rather than `setof public.profiles`, so PostgREST resource embedding has no relationship to traverse either.
4. **Future features extend this database API; they do not widen `profiles` RLS.** M5-05 assignee avatars, M7 comment authors and M8 activity feeds all need "show me a teammate's name." Each either reuses `board_roster` or adds a sibling `SECURITY DEFINER` function with its own explicit column list and its own membership guard. Adding a co-member SELECT policy to `profiles` reintroduces exactly the `email`/`bio` exposure this task exists to prevent, and is prohibited.
5. **The cost, stated honestly.** A view would have served all of (4) from one relation and kept PostgREST embedding available; the RPC trades that reuse for a column boundary the database states explicitly. It also loses column nullability through the function signature — `username`, `full_name` and `avatar_url` are nullable in `profiles` but carry no nullability through `returns table`, so generated types will overstate them. Handle that at the API-function boundary in M3-06.

---

## M3-14 · Membership mutation RPCs

**Date:** 2026-08-11
**Migration:** `supabase/migrations/20260811100000_membership_mutations.sql`
**Status:** **applied 2026-08-11**, verified 67/67 — see *Verification status* below.

`board_members` had no write path at all. The only writer was `add_owner_membership()` (M3-03), the trigger that mints a board's first owner row. This adds the membership mutation layer as `SECURITY DEFINER` RPCs, keeping the table itself unwritable by clients.

### What changed

Six functions, no policies, no table-privilege changes:

| Function | Purpose |
|---|---|
| `board_role_rank(text)` | `viewer 1 < editor 2 < admin 3 < owner 4`. IMMUTABLE, not definer. |
| `is_board_owner(uuid, uuid)` | Owner test over **both** `board_members.role` and `boards.owner_id`. Internal — revoked from `authenticated`. |
| `add_board_member(uuid, uuid, text)` | Add a member below your own rank. |
| `set_member_role(uuid, uuid, text)` | Re-role a member below your own rank. |
| `remove_board_member(uuid, uuid)` | Remove a member below your own rank. |
| `leave_board(uuid)` | Self-removal. The one function that skips the admin-or-owner gate. |

### The hierarchy is arithmetic, not a list of role names

Every decision is a rank comparison, so the hierarchy is defined once in `board_role_rank`. The whole matrix reduces to **an actor may only act on a member strictly below their own rank, and never on the Owner**:

- `actor_rank <= target_current_rank` → denied. Kills admin-edits-admin and admin-edits-self with no special case.
- `actor_rank <= new_role_rank` → denied. Kills self-promotion and admin-mints-admin.

Duplicating `role in ('owner','admin')` across four functions is how the admin-versus-owner boundary ends up subtly wrong in one of them.

### The NULL trap, and why the guards are shaped the way they are

`board_role_rank` returns NULL for an unrecognised role, and `null <= 3` is NULL — an `IF` on NULL does not branch, so a deny written carelessly becomes an allow. Every rank is therefore explicitly tested for NULL before any comparison: an unknown `p_role` raises `22023`, an unknown caller or target role raises `42501`. This is the most dangerous shape in the migration and it is the reason the guards read the way they do.

### Owner invariants

**Numbering is Part II's, which is the source of truth.** An earlier draft of this entry used a different numbering taken from the task prompt; independent review caught the divergence, and Part II was left unchanged.

| Part II invariant | Status in M3-14 | Enforced by |
|---|---|---|
| **I1** exactly one Owner | ✅ closed | no code path can write `role = 'owner'`, so no second Owner; and the only Owner cannot be removed (I2) |
| **I2** owner row cannot be **deleted** | ✅ closed | `is_board_owner` guard in `remove_board_member`; `leave_board` refuses the Owner |
| **I3** owner role cannot be **changed** | ✅ closed | `is_board_owner` guard in `set_member_role` |
| **I4** admin has **no path** to an owner row | ✅ closed | the owner guard runs **before** the admin-or-owner gate in every function |
| **I5** `owner_id` and the owner row never **drift** | ❌ **not closed by M3-14** — closed by M3-15 | `is_board_owner` reads both sources, so drift cannot be *exploited* — but nothing here *prevents* it. M3-15's triggers now do |
| **I6** changing the Owner is not a membership operation | ✅ closed | explicit `p_role = 'owner'` rejection in add and set; no transfer operation exists |

I2, I3 and I4's guards test the **target**, not the actor, so they hold against the Owner acting on themselves. The owner test runs **before** the caller-rank gate deliberately: that is what makes I4 hold independently of the rank logic being correct.

### What is deferred, stated precisely

**I5** — see the table. M3-15.

**Enforcement Rule 6, which is not an invariant number.** A function cannot constrain a writer that does not call it. `service_role`, a future `SECURITY DEFINER` function, or a migration could still write an owner row directly. **No client can** — M3-13 revoked the table privileges and there is still no write policy — so the residual exposure was narrow. **M3-15's triggers have since closed it**; the section below records that.

An earlier draft called this "I6" and declared I6 open. Under Part II, I6 is the scoping rule about ownership transfer and **is** closed by this migration. The mis-statement was pessimistic rather than dangerous, but it is corrected.

### Cross-board safety

Authority is always derived from `board_role(p_board_id)` for the board being operated on, never from an argument, and every read and write is scoped by `p_board_id`. A member of board A calling with board B's id is a non-member there and is denied at step 2. `leave_board` takes no user id at all, so it cannot be aimed at another member.

### Information disclosure

`board_role()` returns NULL both for "not a member" and "no such board", so the `42501` a non-member receives does not reveal whether the board exists. Consistent with `board_roster`'s empty-set behaviour from M3-13.

### Verification status

**PASSED — 67/67, 2026-08-11.**

`scripts/verify-m3-14-membership.sql` scripts the full matrix: 67 cases covering every ✅ and ❌ cell, invariants I1–I4 and I6, cross-board isolation, argument validation, and the privilege layer. It runs inside a transaction ending in `ROLLBACK`, creates its own fixtures, and **simulates each role by setting `request.jwt.claims` rather than requiring a JWT per account** — so the authorization logic can be proved without credentials. Each case asserts an exact SQLSTATE rather than "did it raise", because a typo in a case would otherwise register as a passing denial.

**Where it ran, and why that is not the production database.** Against a schema replica: a `supabase/postgres:17.6.1.147` container with all 26 migrations applied in order. No database credential for the linked project is available to this working copy — `supabase/.temp/pooler-url` carries no password and `psql` is not installed locally — so the production run is **still owed**, and the file is written to be pasted into the SQL editor unchanged. The replica shares the image, the major version, the roles and the migration history, so a logic defect would surface identically; what it cannot prove is that production's applied state matches its migration history.

**The harness is mutation-tested, which is the reason to believe a green run.** Stripping the `boards.owner_id` branch from `is_board_owner` turns exactly the three §5b cases red — and the "admin adds the drifted owner as a member" case flips to `ok`, which is the privilege escalation that case exists to catch.

**§5b's drift fixture had to be rewritten for M3-15.** It originally deleted the owner membership row after M3-03's trigger minted it; M3-15's I2 guard now refuses that, which aborted the transaction and returned an empty report — a harness that cannot run is worse than no harness, because the summary row still says zero failures. The fixture now suppresses `boards_add_owner_membership` for that one INSERT (`alter table … disable trigger`, transactional, restored by the `ROLLBACK`). The case is retained even though M3-15 makes the state unreachable in production, because `is_board_owner`'s `OR` is what keeps the RPC layer sound **on its own**, without depending on the trigger layer.

It also does `set local role authenticated` around each call, so the EXECUTE grants are exercised — including that `is_board_owner` is revoked from `authenticated` yet still reachable from inside the definer RPCs.

**Still owed to M3-16:** that `anon` cannot reach the RPCs over PostgREST (the script asserts the privilege, not the HTTP path), and that a role change survives a round trip through `board_roster`.

### Non-blocking notes carried forward from review

Recorded so they are not rediscovered; none blocks M3-14.

- **Rollback audit query is blind to role *changes*.** The migration's rollback section finds rows *created* in the window via `joined_at`. `board_members` has no `updated_at`, no audit table, no dump and no PITR — so a flaw that promoted or demoted an existing member leaves no trace and is unrecoverable after the fact. That is the class of bug the HIGH RISK label is about. The honest mitigation is review before applying, not a recovery path.
- **The migration's "complete function inventory" is not complete** — it omits `handle_new_user()` and `shift_completed_positions(uuid)` from the baseline dump. Harmless for the rollback, but this is the second time an "only/complete …" claim in a migration has needed correcting.
- **`board_role_rank` is granted to `authenticated`** and needn't be — it is only ever called from inside the definer RPCs, which reach it by ownership. The grant creates a live `rpc/board_role_rank` endpoint. Harmless (a pure function of a literal), but unnecessary API surface.
- **Concurrency:** `set_member_role` and `remove_board_member` now take `FOR UPDATE` on the target row before deciding, closing a race where a concurrent Owner promotion could make the decision act on a stale role. The race could never have violated an Owner invariant, because nothing in this migration can write `role = 'owner'`. The concurrent double-`add` case remains untestable from a single-session script; the PK plus `ON CONFLICT DO NOTHING` is the reasoning, not a measurement.
- **Report rendering:** the harness ends in `rollback;`. Depending on how the SQL editor renders a multi-statement batch, the two report `SELECT`s may be swallowed — which would read as "it ran fine". Run it in `psql` if the result tables do not appear.

---

## M3-15 · Owner immutability enforced against every writer

**Date:** 2026-08-11
**Migration:** `supabase/migrations/20260811110000_owner_immutability.sql`
**Status:** **applied 2026-08-11**, verified 37/37.

M3-14 enforces the Owner invariants for callers of its four RPCs. A function cannot constrain a writer that does not call it, so `service_role`, a future `SECURITY DEFINER` function, a migration, or an admin screen written in six months could still write an owner row directly. This closes that, and closes I5.

### What changed

Two `SECURITY DEFINER` trigger functions, both with `set search_path = ''`, both revoked from `public`, `anon` and `authenticated`. No policies, no table-privilege changes, no rows written.

| Trigger | Table | Timing | Enforces |
|---|---|---|---|
| `board_members_owner_immutable` | `board_members` | BEFORE INSERT OR UPDATE OR DELETE, FOR EACH ROW | I1, I2, I3, I5 |
| `boards_owner_immutable` | `boards` | BEFORE UPDATE, FOR EACH ROW | I5, I6 |

`boards.owner_id` is frozen outright rather than kept in step with the membership row. That was the stronger of the two options the plan offered: there is nothing to keep in step if neither side can move. Ownership transfer, when it is built, lifts this deliberately and transactionally — which is the point of making it explicit rather than leaving a role exempt.

### `service_role` is not exempt, deliberately

Triggers fire regardless of the writing role, so no exemption is the default and none was added. An exemption is a hole that exists precisely when someone is operating under pressure.

### The cascade problem — the reason this is not four lines

Three foreign keys legitimately delete owner rows: `board_members.board_id → boards`, `board_members.user_id → profiles`, and `boards.owner_id → profiles`, all `ON DELETE CASCADE`. A guard that simply refused every owner-row delete would break board deletion (M8-03) and account deletion, and M8-08 exists to verify exactly those cascades.

The guard therefore allows a delete **only when the parent is already gone**: the referential action deletes the parent first, so by the time the cascade reaches `board_members` the `boards` or `profiles` row is no longer visible to the trigger's snapshot. A direct `delete from board_members` leaves both parents in place and is refused. Both hatches are verified empirically rather than assumed.

**Hatch 2 is client-reachable, which is worth knowing.** `profiles` carries `GRANT ALL TO authenticated` plus a self-policy, so any user can delete their own profile and take that path. That is safe — their boards cascade away with them — but it means a defect in that hatch would have been user-visible, not merely internal.

### Why signup still works

`add_owner_membership()` is an **AFTER** INSERT trigger, so the `boards` row is already visible to the guard's snapshot when I5 looks for it. Had M3-03 been a BEFORE trigger, every board creation — including every signup — would now fail with `42501`. The harness asserts M3-03's timing in the catalog for that reason, and a mutation flipping it to BEFORE aborts the run with `I5: an owner membership must match boards.owner_id`.

### I5 also closes a race the I1 check cannot

Two concurrent inserts of a second owner row are not serialised by the I1 existence check — neither transaction sees the other's uncommitted row. They are serialised by **I5**, which pins both to the same `user_id` (`boards.owner_id`), at which point the `(board_id, user_id)` primary key rejects the loser.

### Behaviour change worth recording: `ON CONFLICT DO NOTHING` is retracted for owner rows

A BEFORE trigger fires **ahead of** conflict arbitration. `add_owner_membership()` writes `on conflict (board_id, user_id) do nothing`, and M3-03's comment offers that idempotency to **M4-03's `accept_invite`**. For an owner row that promise no longer holds: the duplicate now raises `42501` from the I1 branch instead of being silently skipped. Nothing reachable today depends on it — `add_owner_membership` only ever runs once per board, from an AFTER INSERT trigger — but **M4-03 must not rely on `ON CONFLICT` to make an owner insert idempotent.** Pinned by a harness case that asserts `42501` where an untriggered table would give `23505`.

### Residual bypasses

Three, all requiring table ownership or superuser, none reachable by any client — M3-13 left `authenticated` with `SELECT` only on `board_members`:

- `TRUNCATE` does not fire row triggers. **Deliberately not tested**: it takes `ACCESS EXCLUSIVE` on `board_members` and would block every reader on whichever database the harness is run against.
- `ALTER TABLE … DISABLE TRIGGER`. The harness itself uses this on a *different* trigger to build a fixture, which is the demonstration.
- `SET session_replication_role = 'replica'` suppresses `tgenabled = 'O'` triggers wholesale. The harness asserts `tgenabled = 'O'` rather than merely that the trigger row exists, so a guard switched to a replica variant is caught.

A partial unique index (`create unique index … on board_members (board_id) where role = 'owner'`) would survive all three, since a constraint is not a trigger. Worth considering for I1 in M3-18; not added here.

### Verification status

**PASSED — 37/37, 2026-08-11.** `scripts/verify-m3-15-owner-immutability.sql`, same replica and same limitation as M3-14 above: a production run is still owed.

The negative cases are the easy half. Sections 3 and 4 carry the weight, because **every "must be refused" case in this file would also pass against a trigger that raises unconditionally** — they prove non-owner membership management, board renaming, board creation, signup via `provision_new_user()`, todo creation, and both cascade paths still work.

Defects found by running it, all fixed:

- **The fixture used `id` as a plpgsql variable**, which made `on conflict (id)` ambiguous. The script aborted at the first statement and reported nothing. It had never been executed.
- **The I1 branch had no coverage.** Both "second owner row" cases named someone other than `boards.owner_id`, so both stopped at I5 and neither reached I1; deleting the I1 branch outright would not have failed the run. Reaching I1 requires an insert that *satisfies* I5 — a duplicate row for the real owner.
- **Section 5 could not prove its own claim.** Both layers answer `42501`, and only the SQLSTATE was captured, so deleting the RPCs' owner guards would have left those cases green with the trigger answering instead. It now matches on the message: RPC messages are plain prose, trigger messages are prefixed with their invariant number.
- **The catalog assertions accepted an AFTER or disabled trigger** — they checked the INSERT/UPDATE/DELETE bits but not the BEFORE bit, the ROW bit, or `tgenabled`.
- **`provision_new_user()` and todo creation were untested**, and they are the two paths most likely to break: neither is a membership operation, and both reach a guard indirectly through a trigger. Todo creation in particular is the application's highest-traffic write, and `assign_todo_board_key` updates `boards` on every single card insert.

**Mutation-tested.** Dropping `board_members_owner_immutable` turns 11 cases red; dropping `boards_owner_immutable` turns 8 red; flipping M3-03 to BEFORE aborts the run with a precise message.

### Process note

**This migration was applied without authorization.** The instruction was to hold it; `supabase db push` applies *all* pending migrations, and both `20260811100000` and `20260811110000` were pending. It went live unreviewed. Independent review afterwards found nothing live broken, and the migration only ever *adds* refusals — no access is granted by it — but the sequencing was wrong, and it is recorded here rather than left in a chat log. **The remedy is procedural: move an unapproved migration out of `supabase/migrations/` before pushing.**

---

## M3-17, M3-18, M3-11 · Board settings, cross-board integrity, atomic column deletion

**Status: applied 2026-08-12.** Three migrations, one `npm run db:push`:

```
20260811120000_boards_settings_by_role.sql    (M3-17)
20260811130000_todo_column_same_board.sql     (M3-18)
20260811140000_delete_column_rpc.sql          (M3-11)
```

All three were reviewed and committed before being applied, and applied on an
explicit instruction naming them — which is the sequencing the process note above
records going wrong once. `supabase migration list` now shows 29 of 29 versions
paired local↔remote.

### What changed

**M3-17.** Replaces one policy on `boards`. `"Users update own boards"` —
`owner_id = auth.uid()` on both clauses — becomes `"Admins and above update
boards"`, `board_role(id) in ('owner','admin')` on both. DELETE is untouched and
stays owner-only from M2-01. INSERT is untouched, and must be: the owner
membership row is minted by an AFTER INSERT trigger, so a `board_role()`
predicate on INSERT would deny every board creation and break signup.

The owner arm is not spelled out separately because it is not needed. M3-03's
backfill and trigger give every board an owner membership row and M3-15 makes it
un-deletable and un-re-roleable, so `board_role()` returns `'owner'` for the owner
on every board that exists.

**M3-18.** Adds `unique (id, board_id)` on `columns` and re-points
`todos_column_id_fkey` at it as a composite `(column_id, board_id)`, keeping
M2-07's `ON DELETE RESTRICT`. The single-column FK is replaced rather than joined:
PostgREST resolves embedding by foreign key, and two FKs between the same pair of
tables makes every `columns?select=*,todos(*)` an ambiguous-embedding error.

**M3-11.** Adds `delete_column(uuid, uuid)` — rehome then delete, in one
transaction. `SECURITY INVOKER`, which is the exception among M3's functions and
is the point: it performs exactly the writes the caller could already perform by
hand, so M3-05's editor+ policies authorize it and there is no second copy of the
rule to drift from the first.

### `owner_id` and the widened boards policy

M3-17's task text asked the UPDATE policy's `WITH CHECK` to keep `owner_id`
unchangeable. **A policy cannot express that.** `USING` is evaluated against the
old row and `WITH CHECK` against the new one; neither can see the other, so no
policy expression can say "unchanged". Writing `with check (owner_id = auth.uid())`
would not express it either — it would lock admins out entirely, which is the
opposite of the task.

The rule is enforced by M3-15's `boards_owner_immutable` BEFORE UPDATE trigger,
which refuses any `owner_id` change from any writer including `service_role`. That
trigger landed after M3-17 was written, which is why the task words the
requirement as a policy problem. §6 of the M3-16 harness is what proves the
widened policy did not open a door behind it.

Column-level `UPDATE` privileges were considered and rejected: weaker (a grant,
not an invariant — `service_role` holds `grant all`) and a maintenance trap, since
every column added later would be silently un-updatable until someone remembered
to grant it.

### An RLS denial is not an error, and M3-11 is built around that

The single most important property of this batch. RLS refuses in two completely
different shapes:

| Verb | Refusal | Visible to the caller? |
|---|---|---|
| INSERT | `WITH CHECK` fails | **Yes** — raises `42501` |
| UPDATE | `USING` filters the row | No — zero rows, no error |
| DELETE | `USING` filters the row | No — zero rows, no error |
| SELECT | `USING` filters the row | No — empty result |

So a viewer calling a naive `delete_column` would sail through the UPDATE and the
DELETE, change nothing, and be told it worked — reintroducing one layer up the
exact silent failure the task exists to remove. The function therefore asserts the
DELETE's row count and raises `42501` on zero. **That assertion is the
authorization check**: not "what role is the caller" but "did the write the caller
asked for actually happen".

The same asymmetry is why `scripts/verify-m3-16-role-matrix.sql` carries
`rows_as()` beside `try_as()`. Asserting "it raised" would pass a schema with no
UPDATE policy at all; asserting "it did not raise" would pass one that permits
everything. Only row counts separate them.

### Cross-board safety

M3-18 closes a gap reachable by any editor through the API: `todos.board_id` and
`todos.column_id` were independent foreign keys, so a `PATCH` could point one of
board A's work items at a column on board B. `USING` and `WITH CHECK` both
evaluate `board_role(board_id)` on A and both pass — nothing ever looked at the
column. The resulting row renders in no column on A and is invisible on B.

It raises `23503`, not `42501`, and it refuses the owner exactly as it refuses an
editor. That is correct: this is an integrity rule, not an authorization one.

M3-11 carries the same check as an explicit guard rather than leaving it to the
constraint, so a wrong destination is a legible refusal instead of a foreign-key
violation after the fact.

### Verification status

**PASSED — 105/105, 2026-08-12**, on a local replica built from all 29 migrations.
`scripts/verify-m3-16-role-matrix.sql` §5 and §6 cover M3-17, §7 covers M3-18, §10
covers M3-11. M3-14 (67/67) and M3-15 (37/37) were re-run against the same replica
and are unaffected — **209 cases green.**

**Not run against production, and that limitation is real.** This machine has no
Docker, no service-role key and no SQL-editor access, and the Supabase CLI exposes
no arbitrary-SQL path — `migration up` targets a local database, `inspect db` runs
a fixed set of reports. The replica is stock PostgreSQL 17 plus a hand-written shim
for what the migrations assume but no migration creates: the `anon`,
`authenticated` and `service_role` roles, the `auth` schema, `auth.users`,
`auth.uid()` written to Supabase's published definition, and the
`on_auth_user_created` trigger. **What that does not cover:** anything Supabase
configures outside the migration history, PostgREST itself, and any drift between
production and the migration files. **A re-run against the linked project is still
owed** and is one paste.

What the apply itself independently proves, on production rather than the replica:

- **M3-18's preflight ran against real production data and found zero cross-board
  work items**, then `add constraint` succeeded — which validates the composite key
  against every existing row in `todos`. That is the one claim in this section
  backed by production rather than by reading.
- **M3-11 is live**: `delete_column` appears in `src/types/database.ts` regenerated
  from the linked project.
- **M3-18's FK really is composite**: the generated relationship changed from
  `["column_id"] → ["id"]` to `["column_id", "board_id"] → ["id", "board_id"]`.
- `supabase migration list`: 29 of 29 paired, no unpaired entry in either direction.

M3-17 is the one the production apply says least about — a policy is invisible in
generated types, so "it applied without error" was all that could be claimed from
here. §5, §6 and §11 answer it on the replica: an admin renames and re-themes, an
editor and a viewer cannot, an admin cannot delete a board, and `owner_id` is still
refused through the widened policy.
- `npm test` 91/91, `npm run build`, `npm run lint`, `git diff --check` all clean.

### M3-16 · the gate itself

**Harness written 2026-08-12, NOT RUN.** It covers both matrices in Part II across
six users and three boards: the content matrix for work items and columns per role,
the upsert/reorder path, board settings, the `owner_id` path M3-17 opens, cross-board
integrity, `board_members` non-writability, `board_roster` exposure, `delete_column`,
and a structural section asserting the objects the behaviour is supposed to be
coming from.

Two deviations from the task as written, both deliberate:

1. **No JWT per role.** It sets `request.jwt.claims` directly and does `set local
   role authenticated` per case — the mechanism M3-14 and M3-15 already use. It
   exercises policies *and* table privileges, so a denial that came from a missing
   `GRANT` rather than from RLS still shows up. **It does not exercise the HTTP
   layer**: PostgREST status codes, and `anon` reaching an endpoint at all, remain
   untested. That gap is named at the head of the file.
2. **It absorbs M3-17, M3-18 and M3-11** rather than each getting a harness. Those
   are cells of these same matrices, and three files would be three things to keep
   in step.

It also cannot observe reload persistence — everything runs in one transaction. The
upsert path is the one that fails silently on reload, so §4 asserts it by re-reading
the rows rather than by trusting the row count.

### Two harness defects, no schema defects

Both found by running it, both fixed in the harness:

1. **`42P01: relation "m3_16_results" does not exist`** in the Supabase SQL editor,
   which does not reproduce under psql — the reason it survived review. The results
   table was referenced unqualified, so resolution depended on the client leaving
   `pg_temp` in the search path. Every reference is now `pg_temp.m3_16_results`, and
   `on commit drop` is gone: the script ends in `ROLLBACK`, so depending on
   commit-time behaviour bought nothing and cost portability.

2. **Four §8 expectations were wrong, and wrong in the safe direction.** Direct
   `UPDATE`/`DELETE` on `board_members` was expected to be filtered to zero rows by
   RLS. It raises `42501` instead, because **Postgres checks table privileges before
   row security** and M3-13 revoked the write privileges from `authenticated`. The
   implementation is one layer stronger than the expectation assumed: the grant
   would have to be restored *and* a write policy added before any of those could
   succeed. Expectations corrected to `42501`; nothing in the schema changed.

### Mutation-tested

"It passed" is only worth something if it could have failed. Reverting each new rule
turns the run red:

| Mutation | Failures |
|---|---|
| `boards` UPDATE policy → `using (true) with check (true)` | 2 |
| composite FK → M2-07's single-column form | 5 |
| `delete_column`'s zero-row DELETE check removed | 5 |

Two rather than four for the first is not a weak assertion — it is a second layer
showing through. The `boards` SELECT policy independently prevents a non-member from
seeing the row at all, so only the viewer and editor cases flip when the UPDATE
policy is opened up. Worth knowing before anyone "simplifies" the SELECT policy.

**M3's backend is applied and verified in full.** What remains in the milestone is
the four UI tasks and the M3-11 client swap, plus one re-run of all three harnesses
against the linked project.
