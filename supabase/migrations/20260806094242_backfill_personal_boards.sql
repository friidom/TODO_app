-- M2-06 · Backfill: one personal board per user. HIGH RISK.
--
-- The backfill phase of the ownership migration. Every user gets a board, and
-- their columns and todos are repointed at it. This is a DATA migration: it
-- contains no DDL, per the rule that schema and data changes are separate
-- files so the schema stays replayable on a fresh database.
--
-- It destroys nothing. It only INSERTs boards and fills columns that are
-- currently NULL — user_id is still present and still authoritative on every
-- row, and nothing reads board_id yet. That is what makes it reversible, and
-- it is why dropping user_id (M2-13) must stay far away from this task.
--
--
-- BEFORE APPLYING
--
--   1. supabase db dump --db-url "$PROD_URL" \
--        -f backups/pre-m2-06-$(date +%Y%m%d-%H%M).sql
--      Verify it is non-empty and restores into a scratch database. An
--      untested backup is not a backup.
--   2. Confirm PITR. CLAUDE.md records it as NOT enabled on
--      nxnnfaoyttbzndphnawe — enable it before running this, or accept that
--      the dump in step 1 is the only recovery path.
--   3. Record these numbers and put them in the PR body. They are what the
--      verification block at the bottom is compared against:
--
--        select count(*) from public.profiles;
--        select count(*) from public.columns;
--        select count(*) from public.todos;
--        select count(distinct user_id) from public.columns;
--        select count(distinct user_id) from public.todos;
--        select count(*) from public.boards;
--
--   4. Rehearse on a branch database restored from the production dump and
--      compare all counts before going near production.
--
--
-- ROLLBACK
--
--   Additive to data, so reversal is a forward-fix migration:
--
--     update public.columns set board_id = null;
--     update public.todos   set board_id = null, creator_id = null;
--     delete from public.boards;
--
--   Safe precisely because user_id still exists to rebuild from. Note that
--   reversing creator_id is only safe while user_id survives — after M2-13
--   the mapping is gone for good.
--
--
-- TRANSACTION
--
--   The Supabase CLI wraps each migration file in a transaction, so this is
--   all-or-nothing. A partial backfill is worse than none; do not split these
--   statements across files.


-- A note on scope, because it departs from a literal reading of the task ------
--
-- The task says "for each distinct user_id in columns ∪ todos ∪ profiles".
-- Taken literally that aborts the migration, and it is worth being explicit
-- about why rather than quietly narrowing it.
--
-- boards.owner_id carries a foreign key to profiles.id (M2-01). But
-- columns.user_id has no foreign key at all, is nullable, and defaulted to
-- gen_random_uuid() until M0-07 replaced that default — a value that can never
-- match a real account. So `columns` may hold rows owned by a UUID belonging
-- to nobody, and inserting a board for one of those violates the foreign key
-- and rolls back everything.
--
-- So boards are created for users that actually exist, and rows owned by
-- nobody are left with a NULL board_id and reported by the verification block
-- rather than being deleted, reassigned, or silently passed over. They are
-- already invisible to the application — every policy filters on
-- `user_id = auth.uid()`, which a random UUID never satisfies — so leaving
-- them untouched loses nothing and preserves the evidence.
--
-- M2-07's NOT NULL is the backstop that forces the question. The plan calls
-- that failure "a safety net, not an error"; this block makes sure it is not a
-- surprise when it fires.


-- 1. One board per user ------------------------------------------------------
--
-- Every profile gets a board, including users who own no columns or todos yet
-- — post-M2 the application needs a board to render at all, so a user without
-- one is a user with a broken account.
--
-- The NOT EXISTS guard makes this re-runnable. If the migration is retried
-- after a failed push, users who already have a board do not get a second one.

insert into public.boards (owner_id, title)
select p.id, 'My Board'
from public.profiles p
where not exists (
  select 1 from public.boards b where b.owner_id = p.id
);


-- 2. Repoint columns ---------------------------------------------------------
--
-- DISTINCT ON picks exactly one board per owner, oldest first, so the choice
-- is deterministic even if a user somehow already had boards before this ran.
-- Ordering by (created_at, id) rather than created_at alone keeps it stable
-- when two boards share a timestamp.
--
-- `board_id is null` makes this idempotent and, more importantly, means a
-- re-run can never move a row that has already been placed.

with personal_board as (
  select distinct on (owner_id) owner_id, id
  from public.boards
  order by owner_id, created_at, id
)
update public.columns c
set board_id = pb.id
from personal_board pb
where pb.owner_id = c.user_id
  and c.board_id is null;


-- 3. Repoint todos -----------------------------------------------------------

with personal_board as (
  select distinct on (owner_id) owner_id, id
  from public.boards
  order by owner_id, created_at, id
)
update public.todos t
set board_id = pb.id
from personal_board pb
where pb.owner_id = t.user_id
  and t.board_id is null;


-- 4. Backfill creator_id -----------------------------------------------------
--
-- This is the irreversible-information step, and the reason it sits in this
-- migration rather than a later one: todos.creator_id can only be derived from
-- todos.user_id, and M2-13 drops user_id. After that, who created each task is
-- gone permanently — there is no other record of it.
--
-- The EXISTS guard is required, not defensive: creator_id references
-- profiles.id, while todos.user_id references auth.users.id. A todo whose
-- owner has an auth account but no profile row would violate the foreign key
-- and abort the migration.

update public.todos t
set creator_id = t.user_id
where t.creator_id is null
  and exists (
    select 1 from public.profiles p where p.id = t.user_id
  );


-- 5. Verification ------------------------------------------------------------
--
-- Runs inside the same transaction, so a failure here rolls the backfill back
-- rather than leaving it half-applied.
--
-- The distinction that matters: a row left NULL because its owner does not
-- exist is expected and gets a WARNING. A row left NULL whose owner DOES have
-- a board is a bug in the statements above, and raises — because that is the
-- case where continuing would quietly lose the mapping.

do $$
declare
  v_profiles          bigint;
  v_boards            bigint;
  v_columns_total     bigint;
  v_todos_total       bigint;
  v_columns_orphaned  bigint;
  v_todos_orphaned    bigint;
  v_columns_unmapped  bigint;
  v_todos_unmapped    bigint;
  v_creator_missing   bigint;
begin
  select count(*) into v_profiles      from public.profiles;
  select count(*) into v_boards        from public.boards;
  select count(*) into v_columns_total from public.columns;
  select count(*) into v_todos_total   from public.todos;

  -- Left NULL and explicable: no owner, or an owner with no profile.
  select count(*) into v_columns_orphaned
  from public.columns c
  where c.board_id is null
    and (
      c.user_id is null
      or not exists (select 1 from public.profiles p where p.id = c.user_id)
    );

  select count(*) into v_todos_orphaned
  from public.todos t
  where t.board_id is null
    and not exists (select 1 from public.profiles p where p.id = t.user_id);

  -- Left NULL with no excuse: the owner has a profile, so a board exists.
  select count(*) into v_columns_unmapped
  from public.columns c
  where c.board_id is null
    and c.user_id is not null
    and exists (select 1 from public.profiles p where p.id = c.user_id);

  select count(*) into v_todos_unmapped
  from public.todos t
  where t.board_id is null
    and exists (select 1 from public.profiles p where p.id = t.user_id);

  select count(*) into v_creator_missing
  from public.todos t
  where t.creator_id is null
    and exists (select 1 from public.profiles p where p.id = t.user_id);

  raise notice 'M2-06 backfill complete';
  raise notice '  profiles: %  boards: %', v_profiles, v_boards;
  raise notice '  columns: % total, % still null (orphaned)', v_columns_total, v_columns_orphaned;
  raise notice '  todos:   % total, % still null (orphaned)', v_todos_total, v_todos_orphaned;

  -- One board per profile is the invariant this migration establishes.
  -- Fewer means the insert missed someone; more is only legitimate if boards
  -- predated this run, so it warns rather than raises.
  if v_boards < v_profiles then
    raise exception
      'M2-06: % profiles but only % boards — the insert did not cover every user',
      v_profiles, v_boards;
  elsif v_boards > v_profiles then
    raise warning
      'M2-06: % boards for % profiles — some users own more than one board. '
      'Expected only if boards existed before this migration ran.',
      v_boards, v_profiles;
  end if;

  if v_columns_unmapped > 0 or v_todos_unmapped > 0 then
    raise exception
      'M2-06: % columns and % todos have a real owner but no board_id. '
      'The backfill is incomplete — investigate before M2-07.',
      v_columns_unmapped, v_todos_unmapped;
  end if;

  if v_creator_missing > 0 then
    raise exception
      'M2-06: % todos have a real owner but no creator_id. This mapping is '
      'destroyed by M2-13 and cannot be recovered afterwards.',
      v_creator_missing;
  end if;

  if v_columns_orphaned > 0 or v_todos_orphaned > 0 then
    raise warning
      'M2-06: % columns and % todos are owned by no existing user and keep a '
      'NULL board_id. They are already invisible to the application (every '
      'policy filters on user_id = auth.uid()). M2-07''s NOT NULL will fail on '
      'them — decide whether to delete or reassign them BEFORE running it.',
      v_columns_orphaned, v_todos_orphaned;
  end if;
end $$;


-- AFTER APPLYING -------------------------------------------------------------
--
-- The task's checks, to run against the database and record in the PR:
--
--   select count(*) from public.columns where board_id is null;  -- expect 0
--   select count(*) from public.todos   where board_id is null;  -- expect 0
--   select count(*) from public.boards;                          -- = profiles
--
--   -- per-user counts must match the pre-migration numbers exactly
--   select b.owner_id,
--          (select count(*) from public.columns c where c.board_id = b.id),
--          (select count(*) from public.todos   t where t.board_id = b.id)
--   from public.boards b;
--
-- Then spot-check one user end to end, and confirm the application still
-- works — it still reads user_id, so nothing about its behaviour should have
-- changed. If the board renders differently after this migration, something
-- in it was not as additive as it claims to be.
