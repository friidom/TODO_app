-- M21 · todo_stars — the one thing the For You page could not derive.
--
-- Four of the five tabs on the personal hub are answerable from data the schema
-- already holds: `todos.assignee_id` is "assigned to me", `activities.actor_id`
-- is "worked on", `todos.updated_at` is "recently active", and "viewed" is a
-- per-device recency list that belongs in the browser rather than the database.
-- **A star is the exception**, and it is the exception for a structural reason:
-- it is a fact about a (person, work item) pair that exists nowhere else and
-- cannot be inferred from anything. There is no column to reuse and no
-- behaviour to derive it from.
--
-- So this is the smallest table that can hold that fact, and deliberately not
-- one row more. Two considered alternatives, both rejected:
--
--   · **A `starred_by uuid[]` column on `todos`.** No join, but every star is
--     then a read-modify-write of an array two people can clobber, and "my
--     stars, newest first" becomes a sequential scan with an unnest.
--   · **A general `user_item_flags` table** with a `kind` column, anticipating
--     watch/pin/subscribe. That is the speculative schema the brief rules out:
--     nothing has asked for a second flag, and a `kind` column costs an index
--     prefix on every query to serve a feature that does not exist.
--
--
-- WHY NO `updated_at`
-- ---------------------------------------------------------------------------
--
-- A star has no mutable field. You star or you unstar; there is no edit, which
-- is also why there is no UPDATE policy below. `created_at` is kept because the
-- feed orders by it — "recently starred first" is the only order this table is
-- ever read in.
--
--
-- BLAST RADIUS
-- ---------------------------------------------------------------------------
--
-- Tier A. A new table with no dependents. Nothing reads it until the same
-- commit's client ships, nothing writes it until a user presses a star, and no
-- existing query, policy or trigger is touched. Both foreign keys cascade, so
-- deleting a work item or an account cannot strand a row.
--
-- **`todos` is unchanged**, which is the property that matters: the board query
-- (`TODO_LIST_FIELDS`) does not widen, so no card on any board carries a new
-- column and the cache shape every view shares is exactly as it was.


-- 1. The table ----------------------------------------------------------------

create table if not exists public.todo_stars (
  user_id uuid not null references public.profiles (id) on delete cascade,
  todo_id uuid not null references public.todos (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- The pair IS the identity: starring twice is the same star, so a surrogate
  -- key would let the same fact exist under two ids and make "unstar" ambiguous.
  -- It also makes the client's toggle idempotent through a plain upsert.
  primary key (user_id, todo_id)
);

comment on table public.todo_stars is
  'A person''s starred work items (M21). Self-only by RLS; the pair is the key.';


-- 2. The read index -----------------------------------------------------------
--
-- The primary key already covers `(user_id, todo_id)`, which answers "is this
-- one starred". The feed asks a different question — "my stars, newest first" —
-- and would sort without this.

create index if not exists todo_stars_user_created_idx
  on public.todo_stars (user_id, created_at desc);


-- 3. RLS ----------------------------------------------------------------------
--
-- **Self-only, and that is stricter than the rest of the schema on purpose.**
-- Every other table here is scoped by `accessible_board_ids()` — board members
-- see each other's work. A star is not work; it is a private annotation, and a
-- board mate has no business reading which cards you flagged for yourself.
-- `user_id = auth.uid()` is therefore the whole rule for reading.
--
-- The INSERT policy adds a second condition, and it is the one worth reading
-- twice: you may only star something you can actually see. Without it the table
-- would accept a star on any uuid, which stores no readable data but does let
-- someone probe for the existence of work items by watching which inserts the
-- foreign key rejects. `accessible_board_ids()` is the same SECURITY DEFINER
-- helper every other policy in the schema is built on, so there is one
-- definition of "can reach this board" and this table inherits it rather than
-- restating it.

alter table public.todo_stars enable row level security;

drop policy if exists "Own stars are selectable" on public.todo_stars;
create policy "Own stars are selectable" on public.todo_stars
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Star own reachable todos" on public.todo_stars;
create policy "Star own reachable todos" on public.todo_stars
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
        from public.todos t
       where t.id = todo_id
         and t.board_id in (select public.accessible_board_ids())
    )
  );

-- Unstarring is deliberately NOT gated on board access. Losing access to a
-- board must not leave a star you can no longer remove — the row is yours, and
-- deleting your own row is always allowed.
drop policy if exists "Own stars are deletable" on public.todo_stars;
create policy "Own stars are deletable" on public.todo_stars
  for delete to authenticated
  using (user_id = auth.uid());

-- No UPDATE policy and no update grant: a star has no mutable field. Changing
-- one means deleting it and inserting another, which is what the toggle does.
grant select, insert, delete on public.todo_stars to authenticated;


-- Rollback ---------------------------------------------------------------------
--
-- Forward-only, per Rule 2. To reverse, put the following in a NEW migration:
--
--   drop table if exists public.todo_stars;
--
-- Free to reverse while the table is empty. Once users have starred anything,
-- dropping it discards those stars permanently and the drop becomes Tier B.
--
--
-- Verification -------------------------------------------------------------------
--
--   select relrowsecurity from pg_class where oid = 'public.todo_stars'::regclass;
--   -- expect: t
--
--   select polname, polcmd from pg_policy
--    where polrelid = 'public.todo_stars'::regclass order by polname;
--   -- expect exactly three: select (r), insert (a), delete (d). No update.
--
-- And the isolation actually biting. As user A:
--
--   insert into todo_stars (user_id, todo_id) values (auth.uid(), '<a todo you can see>');
--   -- expect: 1 row
--   insert into todo_stars (user_id, todo_id) values (auth.uid(), '<a todo on someone else''s board>');
--   -- expect: 42501, new row violates row-level security policy
--
-- Then as user B:
--
--   select * from todo_stars;
--   -- expect: zero rows of A's, whatever boards B shares with A
--
--
-- AFTER APPLYING -----------------------------------------------------------------
--
--   npm run db:push
--   npm run db:types      -- todo_stars enters src/types/database.ts
--
-- The second command is not optional: `services/forYou/starsApi.ts` carries a
-- single documented cast because the generated Database type does not know this
-- table until it is run. That file says so, and says to delete the cast.
