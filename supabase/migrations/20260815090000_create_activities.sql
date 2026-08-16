-- M18 · Activity history. MEDIUM RISK. Tier A.
--
-- The table M7-05 specified and refused to build without a reader:
--
--     "an unbounded audit table with no reader grows forever and is silently
--      wrong the day you finally build the UI."
--
-- M18 builds the reader in the same milestone — a board-scoped activity drawer
-- behind `?panel=activity` — so the condition is met. The schema below is
-- M7-05's, carried forward unchanged; M18 does not re-decide it.
--
--
-- THE TWO RULES M7-05 RECORDED, AND WHERE EACH ONE LIVES HERE
--
--   1. "Record the ACTOR, never infer it at read time."  → `actor_id`, written
--      by the trigger from `auth.uid()` at the moment of the change. Nothing
--      downstream guesses who did something from who owns something.
--
--   2. "Never let an activity row outlive the ability to explain it — if
--      `entity_id` points at a deleted row, the payload must still say what
--      happened."  → `entity_id` carries NO foreign key, and `payload` holds a
--      snapshot of whatever the sentence needs. "Moved KAN-12 from Todo to
--      Done" still reads correctly after the card, both columns, or all three
--      are gone.
--
--
-- WHAT MAKES THE LOG TRUSTWORTHY: THERE IS NO CLIENT WRITE PATH
--
-- `activities` has a SELECT policy and nothing else. Not a restricted INSERT
-- policy — no INSERT policy at all, and no INSERT grant. The only writers are
-- the three SECURITY DEFINER trigger functions in section 5, which run as the
-- table owner and therefore bypass RLS. A client cannot forge an entry, cannot
-- backdate one, cannot delete one, and cannot omit one by taking a different
-- code path, because the triggers are on the tables themselves rather than in
-- the API layer.
--
-- This is also why membership changes are worth logging here specifically:
-- M7-05 named them "the entries most worth having and the ones a client-written
-- log would never capture honestly".
--
--
-- BLAST RADIUS
--
-- Additive. One new table, three new trigger functions, three new triggers, one
-- maintenance function. No existing table is altered, no policy is replaced, no
-- row is written, read or deleted. `accessible_board_ids()` is CALLED and not
-- redefined.
--
-- The one live risk is the triggers: an exception raised inside an AFTER
-- trigger aborts the statement that fired it. A bug in section 5 does not
-- corrupt the log — it stops people creating cards. Section 5 is written
-- defensively for exactly that reason, and every function there is total: no
-- unhandled cast, no assumed-non-null, no lookup that can raise NO_DATA_FOUND.
--
--
-- BACKUP — NOT TAKEN, and not required. Tier A under Rule 6: this migration
-- creates objects and writes no row. Rollback is section 8's forward-fix SQL.
-- PITR is still not enabled on this project; nothing here needs it.


-- 1. The table ---------------------------------------------------------------------
--
-- `board_id` is the policy key, as it is on every board-scoped child table in
-- this schema (decided at M7-01, applied to columns, todos, board_members and
-- board_invites). It is what lets the read policy be one line and lets the feed
-- be one index scan.
--
-- `actor_id` is `on delete set null`, NOT cascade. A deleted account must not
-- take the board's history with it — "someone moved this card" is still true
-- and still useful after they leave. The payload carries enough to render the
-- sentence without them.
--
-- `entity_id` is a plain uuid with no reference. That is rule 2 above, stated
-- as a schema decision: a foreign key here would either cascade the history
-- away with the card (destroying the log) or block the delete (breaking the
-- board). Neither is acceptable, so the pointer is deliberately weak and the
-- payload is what carries meaning.
--
-- `payload` is `not null default '{}'` so every reader can index into it
-- without a null check. An entry with nothing to add carries an empty object
-- rather than a null.

create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.boards (id)   on delete cascade,
  actor_id    uuid          references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  -- The pair is checked, not the two columns separately. Checking
  -- `entity_type in (...)` and `action in (...)` independently would admit
  -- ('todo', 'renamed') and ('member', 'moved') — combinations no trigger
  -- writes and no reader can render. One constraint over the pair is the
  -- complete statement of what an entry may be.
  constraint activities_event_valid check (
    (entity_type, action) in (
      ('todo',   'created'),
      ('todo',   'moved'),
      ('todo',   'assigned'),
      ('todo',   'retitled'),
      ('todo',   'deleted'),
      ('column', 'created'),
      ('column', 'renamed'),
      ('column', 'deleted'),
      ('member', 'added'),
      ('member', 'role_changed'),
      ('member', 'removed')
    )
  )
);

comment on table public.activities is
  'Board history, written only by triggers. No client write policy and no '
  'insert grant exists — see M18 in docs/IMPLEMENTATION_PLAN.md. entity_id '
  'deliberately carries no foreign key: an entry must still explain itself '
  'after the row it points at is deleted, which is what payload is for.';

comment on column public.activities.actor_id is
  'Who did it, recorded at write time from auth.uid() and never inferred at '
  'read time. Null for a deleted account or a change with no session.';

comment on column public.activities.payload is
  'Enough of a snapshot to render the entry without joining anything that may '
  'since have been deleted — titles, keys and role names, not ids alone.';


-- 2. Indexes ------------------------------------------------------------------------
--
-- M7-05: "Indexes are the whole of 'architecture that can later support
-- filtering.'" Both go in with the table, because adding an index later is a
-- migration against a table whose only direction is bigger.
--
--   · (board_id, created_at desc) is the feed. It is the drawer's only query
--     and it is a range scan under a board — the leading equality plus the
--     ordered second column means no sort node at all.
--
--   · (board_id, entity_id) is one work item's own history, which is what the
--     task detail modal will want when it grows a history tab. Nothing reads it
--     today; it is here because the cost of adding it now is zero and the cost
--     of adding it at a million rows is a maintenance window.

create index if not exists activities_board_created_idx
  on public.activities (board_id, created_at desc);

create index if not exists activities_board_entity_idx
  on public.activities (board_id, entity_id);


-- 3. RLS: read for members, and no write path at all --------------------------------
--
-- One policy. `board_id in (select accessible_board_ids())` is the same
-- predicate every policy on `columns` and `todos` uses — the single swap point
-- M2-08 built and M3-05 widened, so an activity row is visible under exactly
-- the same rule as the card it describes. A board that becomes invisible takes
-- its history with it, with no second rule to keep in step.
--
-- There is deliberately no INSERT, UPDATE or DELETE policy. With RLS enabled
-- and no policy for a command, that command is denied to every non-owner role —
-- which is the whole security model of this table, stated by omission and
-- reinforced by the grants in section 4.

alter table public.activities enable row level security;

drop policy if exists "Members select board activity" on public.activities;
create policy "Members select board activity" on public.activities
  for select to authenticated
  using (board_id in (select public.accessible_board_ids()));


-- 4. Grants -------------------------------------------------------------------------
--
-- The revoke is not redundant: the linked project carries
-- `alter default privileges ... grant all on tables to anon`, so a table
-- created here starts out granted to anon. Revoke first, then grant back
-- exactly the one verb that is wanted. M3-13 and M4-01 both record this.
--
-- `select` only. Even if a policy were added by mistake later, there is no
-- INSERT privilege behind it for the policy to permit.

revoke all on table public.activities from anon;
revoke all on table public.activities from authenticated;

grant select on table public.activities to authenticated;
grant all    on table public.activities to service_role;


-- 5. The writers -------------------------------------------------------------------
--
-- Three trigger functions, all SECURITY DEFINER so they run as the owner and
-- bypass the write-less RLS above, all `set search_path = ''` with everything
-- schema-qualified — the convention every function since M3-02 follows.
--
-- AFTER triggers, so a failed write logs nothing. FOR EACH ROW, so a bulk
-- statement produces one entry per row actually affected.
--
-- ⚠ THE RULE THAT KEEPS THE LOG READABLE: only field changes that MEAN
-- something are recorded. `useTodoDrop` and `reorderTodos` upsert an entire
-- column's worth of cards to renumber them, and `useColumnReorder` does the
-- same for columns — under a naive "log every update" trigger, one drag would
-- write a dozen entries and the feed would be useless within a day. Each
-- function below compares the specific fields its events are about and is
-- silent when only rank or position moved.
--
-- One case is deliberately NOT suppressed, so it is not a surprise later:
-- `delete_column` rehomes a column's cards before removing it, so deleting a
-- column holding thirty cards writes thirty 'moved' entries and one
-- 'column.deleted'. Every one of those cards genuinely did change column, and
-- the alternative — a session flag the RPC sets and the trigger reads — buys
-- a tidier feed by making the log conditional on the code path that wrote it,
-- which is the property this table exists to not have.

create or replace function public.log_todo_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'created',
      jsonb_build_object('title', new.title, 'board_key', new.board_key)
    );

    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      old.board_id, v_actor, 'todo', old.id, 'deleted',
      jsonb_build_object('title', old.title, 'board_key', old.board_key)
    );

    return null;
  end if;

  -- UPDATE. Three independent events, and a row can raise more than one: a
  -- single patch may retitle a card and reassign it, and collapsing that into
  -- one entry would mean the feed could not say which of the two happened.

  -- `is distinct from` rather than `<>` throughout: both sides are nullable
  -- (an unassigned card, a card in no column, an untitled card), and `<>`
  -- against null is null, which is not true, so a genuine change to or from
  -- null would be silently dropped.
  if new.column_id is distinct from old.column_id then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'moved',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        -- Titles, not ids. A column can be deleted (and `deleteColumn` rehomes
        -- its cards, which fires this very trigger), so an entry holding only
        -- `to_column_id` would become unreadable the moment the destination
        -- went away. This is rule 2, applied.
        'from',      (select c.title from public.columns c where c.id = old.column_id),
        'to',        (select c.title from public.columns c where c.id = new.column_id)
      )
    );
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'assigned',
      jsonb_build_object(
        'title',       new.title,
        'board_key',   new.board_key,
        -- Both ids, so "unassigned" and "reassigned from X to Y" are the same
        -- entry shape. Null on either side is meaningful and is stored as JSON
        -- null rather than omitted.
        'from',        old.assignee_id,
        'to',          new.assignee_id
      )
    );
  end if;

  if new.title is distinct from old.title then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'retitled',
      jsonb_build_object('board_key', new.board_key, 'from', old.title, 'to', new.title)
    );
  end if;

  return null;
end;
$$;

comment on function public.log_todo_activity() is
  'Writes activities for work item create / move / assign / retitle / delete. '
  'Silent when only rank, position or another field changed — a drag must not '
  'fill the feed.';


create or replace function public.log_column_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'column', new.id, 'created',
            jsonb_build_object('title', new.title));

    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (old.board_id, v_actor, 'column', old.id, 'deleted',
            jsonb_build_object('title', old.title));

    return null;
  end if;

  -- Rename only. A column's limits and category are settings rather than
  -- history, and its rank moves on every reorder.
  if new.title is distinct from old.title then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'column', new.id, 'renamed',
            jsonb_build_object('from', old.title, 'to', new.title));
  end if;

  return null;
end;
$$;

comment on function public.log_column_activity() is
  'Writes activities for column create / rename / delete. Silent on reorder and '
  'on limit or category changes.';


-- Membership. M7-05: "the entries most worth having and the ones a
-- client-written log would never capture honestly."
--
-- `board_members` has no client write policy — every change goes through a
-- SECURITY DEFINER RPC (M3-14) — so `auth.uid()` inside this trigger is the
-- admin who called the RPC, not the member being changed. That is exactly the
-- actor wanted, and it is why the actor is read here rather than passed in.
create or replace function public.log_member_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'member', new.user_id, 'added',
            jsonb_build_object('role', new.role));

    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (old.board_id, v_actor, 'member', old.user_id, 'removed',
            jsonb_build_object('role', old.role));

    return null;
  end if;

  if new.role is distinct from old.role then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'member', new.user_id, 'role_changed',
            jsonb_build_object('from', old.role, 'to', new.role));
  end if;

  return null;
end;
$$;

comment on function public.log_member_activity() is
  'Writes activities for board membership added / role changed / removed. The '
  'actor is the admin who called the RPC, since board_members has no client '
  'write path.';


-- 6. The triggers -------------------------------------------------------------------
--
-- `drop trigger if exists` before each, the idempotent form every migration in
-- this project uses — `create trigger` has no `or replace` in the Postgres
-- version this project runs on.

drop trigger if exists todos_log_activity on public.todos;
create trigger todos_log_activity
  after insert or update or delete on public.todos
  for each row execute function public.log_todo_activity();

drop trigger if exists columns_log_activity on public.columns;
create trigger columns_log_activity
  after insert or update or delete on public.columns
  for each row execute function public.log_column_activity();

drop trigger if exists board_members_log_activity on public.board_members;
create trigger board_members_log_activity
  after insert or update or delete on public.board_members
  for each row execute function public.log_member_activity();


-- 7. Retention ----------------------------------------------------------------------
--
-- M7-05: "Plan retention from day one." This is the one table in the schema
-- with no natural bound — every other one is proportional to how much work
-- exists, and this one is proportional to how much work has ever been done.
--
-- 180 days, and the number is a product decision rather than a technical one:
-- a board's history is read to answer "what changed recently", and nobody
-- scrolls half a year back. It is a default argument rather than a constant so
-- a one-off deeper prune needs no migration.
--
-- SECURITY DEFINER because it deletes from a table with no delete policy, and
-- `revoke ... from public, anon, authenticated` because no client should be
-- able to invoke it — a prune the client can call is a client that can erase
-- history, which is the property this whole table exists to prevent.

create or replace function public.prune_activities(p_keep_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.activities
   where created_at < now() - make_interval(days => greatest(p_keep_days, 1));

  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

comment on function public.prune_activities(integer) is
  'Drops activity older than p_keep_days (default 180). Service-role only. '
  'Schedule it — see the DO block in this migration, or run it manually.';

revoke all on function public.prune_activities(integer) from public, anon, authenticated;
grant execute on function public.prune_activities(integer) to service_role;

-- Schedule it where the platform can. `pg_cron` is available on Supabase but is
-- not enabled by default, and this migration must apply cleanly either way — so
-- the schedule is attempted only if the extension is already installed, and a
-- failure to schedule is swallowed rather than allowed to abort a migration
-- whose real work is done.
--
-- If this block does nothing, retention is a manual `select
-- public.prune_activities();` until pg_cron is enabled. The function existing
-- is what makes that a one-liner rather than a piece of research.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'prune-activities',
      '17 4 * * 0',                       -- 04:17 every Sunday
      'select public.prune_activities();'
    );
  end if;
exception
  when others then
    raise notice 'activities: pg_cron schedule skipped (%). Prune manually.', sqlerrm;
end;
$$;


-- 8. Rollback -------------------------------------------------------------------------
--
-- Forward-fix, per Rule 4 — migrations here have no `down`. Reversing means a
-- new migration containing:
--
--   drop trigger if exists todos_log_activity         on public.todos;
--   drop trigger if exists columns_log_activity       on public.columns;
--   drop trigger if exists board_members_log_activity on public.board_members;
--   drop function if exists public.log_todo_activity();
--   drop function if exists public.log_column_activity();
--   drop function if exists public.log_member_activity();
--   drop function if exists public.prune_activities(integer);
--   drop table if exists public.activities;
--
-- Dropping the triggers alone stops the log growing and leaves what was written
-- readable, which is the right first move if the problem is volume rather than
-- correctness.
--
--
-- VERIFICATION (run after `npm run db:push`)
--
--   1. Create a card on a board. One 'todo'/'created' row, actor = you.
--   2. Drag it to another column. Exactly ONE new row, action 'moved', with
--      readable `from` and `to` titles in the payload.
--   3. Drag three cards around within one column. NO new rows — this is the
--      check that the reorder upserts are not being logged.
--   4. Rename a column. One 'column'/'renamed' row.
--   5. As a second account with viewer role: `select * from activities` returns
--      that board's rows; `insert into activities ...` fails; `delete from
--      activities ...` fails.
--   6. Delete the card from step 1. The 'created' and 'moved' rows survive and
--      still name it.
