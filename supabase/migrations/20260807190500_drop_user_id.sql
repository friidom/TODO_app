-- M2-13 · Drop user_id from columns and todos. HIGH RISK. BREAKING. ONE-WAY.
--
-- The final contraction of M2. board_id is NOT NULL (M2-07) and every live
-- policy routes through board ownership (M2-08), so user_id is no longer read
-- for authorization. Leaving it would keep two competing sources of truth that
-- every future policy has to reconcile.
--
-- ONE-WAY. The column cannot be restored from the schema. Once it is gone the
-- user -> row mapping survives only through boards.owner_id and
-- todos.creator_id. Recovery is PITR or a dump restore, nothing else. Take the
-- dump first and record the pre-migration timestamp.
--
-- Ship the frontend half of M2-13 in the same window: it stops sending user_id
-- on insert. An insert naming a dropped column fails outright, so there is no
-- version of the old client that survives this.


-- 1. Preflight: no policy may reference user_id -------------------------------
--
-- A policy referencing a dropped column fails at query time, not at migration
-- time — the failure would surface as every board read returning nothing.
-- M2-08 already retired these, so this asserts rather than repairs.

do $$
declare
  offending text;
begin
  select string_agg(policyname || ' on ' || tablename, ', ')
  into offending
  from pg_policies
  where schemaname = 'public'
    and tablename in ('columns', 'todos')
    and (coalesce(qual, '') like '%user_id%'
      or coalesce(with_check, '') like '%user_id%');

  if offending is not null then
    raise exception
      'M2-13: policies still reference user_id: %. Apply M2-08 first.',
      offending;
  end if;
end $$;


-- 2. Preflight: authorship must already be preserved --------------------------
--
-- M2-06 copied todos.user_id into creator_id, but only where a matching
-- profile existed — creator_id carries an FK to profiles. Rows whose owner has
-- no profile are expected and are not a reason to stop. Rows whose owner *does*
-- have a profile and still have no creator_id mean M2-06 did not finish, and
-- dropping user_id now would discard that authorship permanently.
--
-- Re-run that backfill first. M2-06 was correct when it ran, but every card
-- created since then came from an addTodo that did not send creator_id — the
-- version that does ships with this task. The preflight below then asserts the
-- result rather than merely reporting the drift.

UPDATE public.todos t
SET creator_id = t.user_id
WHERE t.creator_id IS NULL
  AND t.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = t.user_id
  );

do $$
declare
  unmapped bigint;
begin
  select count(*) into unmapped
  from public.todos t
  where t.creator_id is null
    and t.user_id is not null
    and exists (select 1 from public.profiles p where p.id = t.user_id);

  if unmapped > 0 then
    raise exception
      'M2-13: % todos have a profiled owner but no creator_id. Re-run M2-06.',
      unmapped;
  end if;
end $$;


-- 3. Rewrite provision_new_user -----------------------------------------------
--
-- This is the one that breaks silently. plpgsql bodies are not
-- dependency-checked, so dropping columns.user_id leaves this function
-- referencing a column that no longer exists — and it is called only from
-- signUp, so the failure surfaces as REGISTRATION BROKEN rather than as a
-- migration error. Replaced here, in the same transaction as the drop.
--
-- Byte-identical to the M2-12 definition apart from the columns insert.
-- `create or replace` preserves the M2-12 grants, so they are not repeated.

create or replace function public.provision_new_user()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := (select auth.uid());
  v_email    text;
  v_board_id uuid;
begin
  if v_user_id is null then
    raise exception 'provision_new_user requires an authenticated session';
  end if;

  -- Idempotent by design. signUp can be retried — a dropped connection after
  -- the account exists is the ordinary case — and a retry must not mint a
  -- second board. Returning the existing one also means this repairs an
  -- account that was half-provisioned by the old client-side sequence.
  select b.id into v_board_id
  from public.boards b
  where b.owner_id = v_user_id
  order by b.created_at, b.id
  limit 1;

  if v_board_id is not null then
    return v_board_id;
  end if;

  -- Read from auth.users rather than accepting the address as an argument, so
  -- the profile cannot be seeded with an email the caller does not own.
  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;

  -- handle_new_user() already inserted the id on signup; this fills in the
  -- rest. An existing username is preserved: this function is idempotent, and
  -- a repeat call must not overwrite a name the user chose.
  insert into public.profiles as p (id, email, username)
  values (v_user_id, v_email, split_part(v_email, '@', 1))
  on conflict (id) do update
    set email    = excluded.email,
        username = coalesce(p.username, excluded.username);

  insert into public.boards (owner_id, title)
  values (v_user_id, 'My Board')
  returning id into v_board_id;

  -- user_id is gone as of M2-13. Ownership of these columns is the board's
  -- owner_id and nothing else.
  --
  -- Categories match src/constants/columns.ts. "In Review" is in_progress
  -- rather than a category of its own — the set is fixed at three, which is
  -- why columns.category is a checked text field and not a lookup table.
  insert into public.columns (board_id, title, position, category)
  values
    (v_board_id, 'To Do',       0, 'todo'),
    (v_board_id, 'In Progress', 1, 'in_progress'),
    (v_board_id, 'In Review',   2, 'in_progress'),
    (v_board_id, 'Done',        3, 'done');

  return v_board_id;
end;
$$;


-- 4. Drop shift_completed_positions -------------------------------------------
--
-- Dead since the baseline: nothing in src/ calls it. It filters on
-- todos.user_id AND on status = 'completed', so it references this migration's
-- casualty twice over. LANGUAGE sql in string form is not dependency-tracked
-- either, so it would survive the drop as a function that errors on every call.

drop function if exists public.shift_completed_positions(uuid);


-- 5. The drop -----------------------------------------------------------------
--
-- Indexes on these columns go with them; no explicit drop needed.

alter table public.columns drop column user_id;
alter table public.todos   drop column user_id;


-- Rollback --------------------------------------------------------------------
--
-- There is none. Re-adding the column restores the shape but not the data:
--
--   alter table public.columns add column user_id uuid;
--   alter table public.todos   add column user_id uuid;
--
-- would leave both NULL for every existing row, and the mapping that filled
-- them is exactly what this migration destroys. todos can be partially
-- reconstructed from creator_id; columns cannot be reconstructed at all,
-- only inferred from boards.owner_id. Use PITR or the dump.


-- Verification (run immediately, do not walk away) -----------------------------
--
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name in ('columns', 'todos')
--     and column_name = 'user_id';
--   -- expect: 0 rows
--
--   -- registration still provisions a board and four columns
--   -- (sign up a throwaway account in the browser, then:)
--   select count(*) from public.columns where board_id = '<new board>';
--   -- expect: 4
--
-- Then the full Smoke checklist: load the board, create a card, rename it,
-- drag it between columns, reorder columns, delete a card.
