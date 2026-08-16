-- M18 · Activity, part two: the field changes the log was missing. LOW RISK. Tier A.
--
-- `20260815090000_create_activities.sql` records what M7-05 named: a work item
-- created, moved, assigned, retitled or deleted. That covers where a card is and
-- who owns it, and it says nothing about the three other fields a card actually
-- carries — its priority, its due date and its type.
--
-- Those are not extra. A feed that reports "moved KAN-12 to In Review" but stays
-- silent when the same card is escalated to Highest and pulled forward two days
-- is not a history of the board; it is a history of one column of it.
--
--
-- THE RULE THIS DRAWS, SO THE NEXT PERSON DOES NOT HAVE TO GUESS
--
-- The set of logged fields is exactly the set of fields the UI can write:
--
--     column_id ─ assignee_id ─ title ─ priority ─ due_date ─ type
--
-- One control on the card, one control in the list row, one entry in the feed.
-- That is a boundary rather than an appetite, and it is what keeps the previous
-- migration's central rule intact:
--
--     ⚠ only field changes that MEAN something are recorded.
--
-- `rank` and `position` are still not in that list and must never be. A drag
-- upserts an entire column's worth of cards to renumber them; under a naive
-- "log every update" trigger one drop would write a dozen entries and the feed
-- would be useless within a day. Every branch below compares one specific
-- column, so a reorder still writes nothing at all.
--
--
-- WHY THE PAYLOAD CARRIES VALUES AND NOT JUST IDS
--
-- M7-05 rule 2 — an entry must still explain itself after the row it points at
-- is deleted. `priority`, `due_date` and `type` are plain scalars, so the old
-- and new values ARE the explanation and nothing has to be joined to read the
-- sentence. `title` and `board_key` ride along for the same reason they do on
-- every other todo entry: they are what names the card once the card is gone.
--
--
-- BLAST RADIUS
--
-- Additive. One CHECK constraint replaced with a superset of itself, one trigger
-- function replaced in place. No table is created or dropped, no policy is
-- touched, no grant changes, no index is added, no row is written or deleted.
-- The trigger BINDING is untouched — `create or replace function` keeps
-- `todos_log_activity` pointing at the same name — so there is no window in
-- which the todos table has no logger attached.
--
-- The one live risk is the same one section 5 of the previous migration names:
-- an exception raised inside an AFTER trigger aborts the statement that fired
-- it, so a bug here stops people editing cards rather than corrupting the log.
-- Every branch below is total — `is distinct from` against nullable columns,
-- no cast, no lookup that can raise NO_DATA_FOUND.
--
--
-- ORDERING NOTE. This migration REQUIRES 20260815090000 to have been applied;
-- it alters that migration's constraint and replaces that migration's function.
-- The timestamp ordering guarantees it, and `db push` applies them in that
-- order, which is why neither statement here is guarded by an existence check
-- on the table itself — a missing `activities` at this point is a real failure
-- and should stop the push rather than be swallowed.
--
--
-- BACKUP — NOT TAKEN, and not required. Tier A: this migration writes no row.
-- Rollback is section 4's forward-fix SQL.


-- 1. Widen the event vocabulary -----------------------------------------------------
--
-- The constraint checks the (entity_type, action) PAIR rather than the two
-- columns separately, for the reason the original states: checking them apart
-- would admit ('member', 'due_changed'), a combination no trigger writes and no
-- reader can render. Widening it therefore means restating the whole pair list,
-- not adding to one side of it.
--
-- Drop-then-add rather than `alter constraint`: Postgres has no in-place edit
-- for a CHECK expression. The add revalidates every existing row, which is a
-- full scan of a table that is at most a few days old here — and correct at any
-- size, since the new list is a strict superset of the old one and no existing
-- row can fail it.
--
-- `if exists` on the drop so this migration applies to a database where the
-- constraint was already replaced by a re-run; `add constraint` is not
-- idempotent on its own, which is what the guard block handles.

alter table public.activities
  drop constraint if exists activities_event_valid;

alter table public.activities
  add constraint activities_event_valid check (
    (entity_type, action) in (
      ('todo',   'created'),
      ('todo',   'moved'),
      ('todo',   'assigned'),
      ('todo',   'retitled'),
      ('todo',   'deleted'),
      -- New in this migration. Named `<field>_changed` after the shape
      -- `member.role_changed` already set, rather than inventing a verb per
      -- field ('reprioritised', 'rescheduled') that a reader would have to
      -- learn one at a time.
      ('todo',   'priority_changed'),
      ('todo',   'due_changed'),
      ('todo',   'type_changed'),
      ('column', 'created'),
      ('column', 'renamed'),
      ('column', 'deleted'),
      ('member', 'added'),
      ('member', 'role_changed'),
      ('member', 'removed')
    )
  );


-- 2. The writer ---------------------------------------------------------------------
--
-- Replaced whole rather than patched, because a plpgsql function has no partial
-- form — and restating it keeps the whole of what a todo change logs readable in
-- one place instead of spread across two migrations.
--
-- Everything from the original is carried forward unchanged: SECURITY DEFINER so
-- it bypasses the write-less RLS, `set search_path = ''` with everything
-- schema-qualified, `return null` throughout because it is an AFTER trigger and
-- the return value is discarded.

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

  -- UPDATE. Independent events, and a row can raise more than one: a single
  -- patch may retitle a card, reassign it and pull its due date forward, and
  -- collapsing that into one entry would mean the feed could not say which of
  -- the three happened.

  -- `is distinct from` rather than `<>` throughout: every column compared below
  -- is nullable (an unassigned card, a card in no column, a card with no
  -- priority or no due date), and `<>` against null is null — which is not true
  -- — so a genuine change to or from null would be silently dropped. Setting a
  -- due date and clearing one are exactly the changes most worth logging.
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

  -- The three added by this migration. Each stores the raw stored value on both
  -- sides — 'highest', '2026-08-20', 'Bug' — and never a label. The database
  -- does not own the product's wording: `src/constants/priorities.ts` does, and
  -- a label frozen into a row written today would still read the old way after
  -- someone renames it.
  if new.priority is distinct from old.priority then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'priority_changed',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      old.priority,
        'to',        new.priority
      )
    );
  end if;

  -- `due_date` is a `timestamptz`, not a `date` (M2-04). The product has never
  -- asked for a time: `src/utils/dueDate.ts` writes midnight UTC and reads the
  -- day back by slicing the leading YYYY-MM-DD, deliberately, because
  -- converting to the viewer's zone would move a card due the 13th to the 12th
  -- for everyone west of Greenwich.
  --
  -- `at time zone 'UTC'` is what makes this payload agree with that. Bare
  -- `to_char(timestamptz, …)` renders in the SESSION's TimeZone, so the entry
  -- would name a different day than the card's own chip whenever the connection
  -- is not on UTC — a database setting deciding what the history says.
  --
  -- Stored as the calendar day rather than the instant because that is the
  -- value the product means, and `toCalendarDay` accepts both shapes, so
  -- `formatDue()` renders it with no second code path.
  if new.due_date is distinct from old.due_date then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'due_changed',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      to_char(old.due_date at time zone 'UTC', 'YYYY-MM-DD'),
        'to',        to_char(new.due_date at time zone 'UTC', 'YYYY-MM-DD')
      )
    );
  end if;

  if new.type is distinct from old.type then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'type_changed',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      old.type,
        'to',        new.type
      )
    );
  end if;

  return null;
end;
$$;

comment on function public.log_todo_activity() is
  'Writes activities for work item create / move / assign / retitle / priority / '
  'due date / type / delete — one entry per field that actually changed. Silent '
  'when only rank or position moved, which is what stops a drag filling the feed.';


-- 3. No trigger, policy, grant or index change --------------------------------------
--
-- Stated rather than left to be inferred:
--
--   · `todos_log_activity` still points at `public.log_todo_activity()` — a
--     `create or replace function` does not detach it, so there is no window
--     where todos are unlogged and no `create trigger` is needed here.
--   · The read policy is unchanged: a new action is still an activity row on a
--     board, visible under `board_id in (select accessible_board_ids())`.
--   · There is still no INSERT policy and no INSERT grant. Widening what the
--     trigger writes does not widen what a client can write, which is the whole
--     property this table exists to have.
--   · `(board_id, created_at desc)` already serves the feed. A new action value
--     does not want an index of its own; nothing filters by action.


-- 4. Rollback -------------------------------------------------------------------------
--
-- Forward-fix, per Rule 4. Reversing means a new migration that restores the
-- eleven-pair constraint and the previous function body from
-- `20260815090000_create_activities.sql`, in that order — the constraint first,
-- because narrowing it while the wider function is still installed would make
-- the next priority change abort the update that caused it.
--
-- Rows already written with the three new actions would then violate the
-- narrowed constraint, so a real reversal deletes them first:
--
--   delete from public.activities
--    where (entity_type, action) in
--          (('todo','priority_changed'), ('todo','due_changed'), ('todo','type_changed'));
--
--
-- VERIFICATION (run after `npm run db:push`)
--
--   1. Change a card's priority. ONE new row, action 'priority_changed', with
--      readable `from` and `to` in the payload (null on `from` for a card that
--      had none).
--   2. Set a due date, then clear it. TWO rows, both 'due_changed', the second
--      with `to` null — this is the check that `is distinct from` is doing its
--      job against nulls.
--   3. Change a card's type. ONE 'type_changed' row.
--   4. Drag three cards around within one column. STILL no new rows.
--   5. Rename a card and change its priority in the same patch. TWO rows, one
--      'retitled' and one 'priority_changed', not one merged entry.
