-- M25 · Activity, part three: description and story point estimate. LOW RISK. Tier A.
--
-- `20260816090000_activity_field_events.sql` widened the log to
-- column_id/assignee_id/title/priority/due_date/type — everything the UI could
-- write at the time. Two fields have gained a writer since and neither is
-- logged: `description` (M5-06's detail panel) and `estimate` (M24, story
-- points). This migration closes both gaps for the same reason the previous
-- one drew its rule: the set of logged fields is the set of fields the UI can
-- write, and both of these now are.
--
-- It is also what M25's per-item History tab is built on. `description` and
-- `estimate` are the last two entries in "at minimum track: title, description,
-- status, priority, assignee, due date, story point estimate" — the other five
-- were already covered by the previous two migrations (status is `moved`,
-- there is no live `status` column; see docs/DATABASE.md).
--
--
-- WHY `description_changed` CARRIES NO OLD/NEW VALUE
--
-- Every other field logged here is a short scalar — a column title, a
-- priority word, a calendar day — and the payload is genuinely the whole
-- explanation a reader needs, per M7-05 rule 2. `description` is free text
-- with no length cap. Storing both copies in a table that is never edited and
-- never pruned by size would mean a single large edit permanently doubling
-- its own row's size in an append-only log, for a value with no compact chip
-- to render it in anyway — unlike "To Do → In Progress", a description diff
-- is not a UI Jira itself puts in a two-word pill. The entry records that a
-- description changed and by whom and when; the current text is already one
-- click away, in the field it changed.
--
-- `estimate` gets the ordinary from/to treatment: it is a short scalar
-- (`numeric`), exactly like `priority`/`type`, so the same reasoning that put
-- values in those two payloads puts one here.
--
--
-- BLAST RADIUS
--
-- Additive. One CHECK constraint replaced with a superset of itself, one
-- trigger function replaced in place. No table created or dropped, no policy
-- touched, no grant changed, no index added, no row written or deleted. The
-- trigger BINDING is untouched, exactly as the previous migration's section 3
-- states and for the same reason.
--
-- BACKUP — NOT TAKEN, and not required. Tier A: writes no row.
--
-- ORDERING NOTE. Requires 20260816090000 to have been applied; it alters that
-- migration's constraint and replaces that migration's function, in the same
-- relationship that migration has to 20260815090000.


-- 1. Widen the event vocabulary -----------------------------------------------------
--
-- Same reasoning as before: the pair is checked together because checking the
-- two columns apart would admit combinations no trigger writes, so widening
-- restates the whole list rather than appending to one side of it.

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
      ('todo',   'priority_changed'),
      ('todo',   'due_changed'),
      ('todo',   'type_changed'),
      -- New in this migration.
      ('todo',   'description_changed'),
      ('todo',   'estimate_changed'),
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
-- Replaced whole, as `create or replace function` requires — a plpgsql body
-- has no partial form. Everything through `type_changed` is carried forward
-- byte-for-byte from `20260816090000_activity_field_events.sql`; the two new
-- blocks are appended after it.

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

  -- UPDATE. Independent events, and a row can raise more than one — see the
  -- previous migration's header for why that is deliberate.

  if new.column_id is distinct from old.column_id then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'moved',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
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

  -- The two added by this migration.

  -- No `from`/`to` here — see the header. `title`/`board_key` still ride
  -- along, for the same reason every todo entry carries them: they are what
  -- names the card once the card is gone.
  if new.description is distinct from old.description then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'description_changed',
      jsonb_build_object('title', new.title, 'board_key', new.board_key)
    );
  end if;

  -- `estimate` is `numeric`, and `jsonb_build_object` converts it through
  -- `to_jsonb(numeric)` — a JSON number, not a string, which is what lets the
  -- client read it with the same `num()` helper `activityText.ts` already
  -- uses for `board_key`. Null on either side is a real state (unestimated)
  -- and is stored as JSON null rather than omitted, exactly as `assigned`
  -- already does for `assignee_id`.
  if new.estimate is distinct from old.estimate then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'estimate_changed',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      old.estimate,
        'to',        new.estimate
      )
    );
  end if;

  return null;
end;
$$;

comment on function public.log_todo_activity() is
  'Writes activities for work item create / move / assign / retitle / priority / '
  'due date / type / description / estimate / delete — one entry per field that '
  'actually changed. Silent when only rank or position moved, which is what stops '
  'a drag filling the feed.';


-- 3. No trigger, policy, grant or index change --------------------------------------
--
--   · `todos_log_activity` still points at `public.log_todo_activity()` —
--     unchanged by `create or replace function`.
--   · No new INSERT policy or grant. Widening what the trigger writes does not
--     widen what a client can write.
--   · `(board_id, entity_id)` — added speculatively by
--     `20260815090000_create_activities.sql` for "the task detail modal...
--     when it grows a history tab" — is what M25's per-item query now uses.
--     Still no index on `action`; nothing filters by it alone.


-- 4. Rollback -------------------------------------------------------------------------
--
-- Forward-fix, per Rule 4. Reversing means a new migration that restores the
-- fourteen-pair constraint and the previous function body from
-- `20260816090000_activity_field_events.sql`, constraint first — narrowing it
-- while the wider function is still installed would make the next
-- description or estimate edit abort the update that caused it.
--
-- Rows already written with the two new actions would then violate the
-- narrowed constraint, so a real reversal deletes them first:
--
--   delete from public.activities
--    where (entity_type, action) in
--          (('todo','description_changed'), ('todo','estimate_changed'));
--
--
-- VERIFICATION (run after `npm run db:push`)
--
--   1. Edit a card's description. ONE new row, action 'description_changed',
--      payload has `title`/`board_key` and no `from`/`to` keys.
--   2. Set a story point estimate, then change it, then clear it. THREE rows,
--      all 'estimate_changed' — `from` null → 3, `from` 3 → 5, `from` 5 →
--      `to` null. Confirm `payload->>'to'` for the middle row reads as the
--      JSON number `5`, not the string `"5"`.
--   3. Rename a card and edit its description in the same patch. TWO rows,
--      one 'retitled' and one 'description_changed'.
--   4. Query `select * from activities where board_id = <b> and entity_type =
--      'todo' and entity_id = <a todo id> order by created_at desc` and
--      confirm it returns only that item's rows — this is the exact shape
--      `fetchTodoActivities` issues, and it should use
--      `activities_board_entity_idx` (verify with `explain`).
