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
