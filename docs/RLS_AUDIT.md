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
