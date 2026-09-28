-- 0026 — the status model takes over, and the column one is dropped
-- (Flexible Workflow, Phase A: contract).
--
-- Every trigger that read a card's status off its column now reads it off its
-- status, with the same rules:
--
--   * completed_at is stamped when a card enters a done-category STATUS and
--     cleared when it leaves one (0013's rule). started_at is stamped the first
--     time it enters a status whose category is not todo, and cleared when it
--     returns to one (0017's rule).
--   * The "second door" moves with them. A column no longer has a category to
--     flip; a status does, and a workflow publish may change it, which starts
--     or completes every card in that status without one todos row being
--     written. The AFTER UPDATE triggers that covered columns.category now
--     cover statuses.category, AFTER for the reason 0013 gives.
--   * Moving a status to another column changes no category, so it stamps
--     nothing, which is correct: the card's status did not change.
--   * log_todo_activity's 'moved' entry names statuses rather than columns.
--     The payload keeps its shape (from/to as display names), so every
--     historical entry and every reader of it still agree. The body is 0009's,
--     copied programmatically with only that branch changed.
--   * log_status_activity is new and mirrors log_column_activity: created,
--     renamed and deleted, silent on reorder, category, visibility and column
--     moves. It is created here rather than in 0024 so that 0025's backfill did
--     not log one "status created" per existing column.
--
-- Then todos.column_id and columns.category are dropped. Nothing reads them
-- after this migration: the API, both seeds and every trigger were moved over
-- in the same change.
--
-- Forward-only. Reversing means a new migration.

drop trigger todos_stamp_completion on public.todos;
drop trigger todos_stamp_start on public.todos;
drop trigger columns_stamp_completion on public.columns;
drop trigger columns_stamp_start on public.columns;

drop function public.stamp_column_completion();
drop function public.stamp_column_start();

create or replace function public.stamp_todo_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_was_done boolean := false;
  v_is_done  boolean := false;
begin
  if tg_op = 'UPDATE' then
    select s.category = 'done'
      into v_was_done
      from public.statuses s
     where s.id = old.status_id;
  end if;

  select s.category = 'done'
    into v_is_done
    from public.statuses s
   where s.id = new.status_id;

  -- A card in the backlog has no status at all, and is not done.
  v_was_done := coalesce(v_was_done, false);
  v_is_done  := coalesce(v_is_done, false);

  if v_is_done and not v_was_done then
    new.completed_at := now();
    new.completed_by := new.assignee_id;
  elsif v_was_done and not v_is_done then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

comment on function public.stamp_todo_completion() is
  'Stamps todos.completed_at when a card enters a done-category status and clears it when it leaves. done -> done is left alone, so a move between two done statuses or a reorder does not re-date the work.';

create trigger todos_stamp_completion
  before insert or update of status_id on public.todos
  for each row execute function public.stamp_todo_completion();

create or replace function public.stamp_todo_start()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_started boolean := false;
begin
  select s.category <> 'todo'
    into v_is_started
    from public.statuses s
   where s.id = new.status_id;

  -- A card in the backlog has no status at all, and has not started.
  v_is_started := coalesce(v_is_started, false);

  if v_is_started then
    -- Only when null, so a move between two started statuses does not restart
    -- the clock.
    if new.started_at is null then
      new.started_at := now();
    end if;
  else
    new.started_at := null;
  end if;

  return new;
end;
$$;

comment on function public.stamp_todo_start() is
  'Stamps todos.started_at the first time a card enters a status whose category is not todo, and clears it when the card returns to one that is. Movement between two started statuses leaves it alone.';

create trigger todos_stamp_start
  before insert or update of status_id on public.todos
  for each row execute function public.stamp_todo_start();

create or replace function public.stamp_status_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category is not distinct from old.category then
    return null;
  end if;

  if new.category = 'done' then
    update public.todos
       set completed_at = now(),
           completed_by = assignee_id
     where status_id = new.id
       and completed_at is null;

  elsif old.category = 'done' then
    update public.todos
       set completed_at = null,
           completed_by = null
     where status_id = new.id
       and completed_at is not null;
  end if;

  return null;
end;
$$;

comment on function public.stamp_status_completion() is
  'The second door: a workflow publish may change a status category, which completes or reopens every card in it without any todos row being written.';

create trigger statuses_stamp_completion
  after update of category on public.statuses
  for each row execute function public.stamp_status_completion();

create or replace function public.stamp_status_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category is not distinct from old.category then
    return null;
  end if;

  -- in_progress -> done is not a crossing: both sides are started. Testing the
  -- new side first and the old side only in the else branch keeps it a no-op
  -- for started_at while stamp_status_completion stamps completed_at.
  if new.category <> 'todo' then
    update public.todos
       set started_at = now()
     where status_id = new.id
       and started_at is null;

  elsif old.category <> 'todo' then
    update public.todos
       set started_at = null
     where status_id = new.id
       and started_at is not null;
  end if;

  return null;
end;
$$;

comment on function public.stamp_status_start() is
  'The second door: moving a status out of the todo category starts every card in it without any todos row being written.';

create trigger statuses_stamp_start
  after update of category on public.statuses
  for each row execute function public.stamp_status_start();

create or replace function public.log_todo_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  v_new_parent_type text;
  v_old_parent_type text;
begin
  if tg_op = 'INSERT' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'created',
      jsonb_build_object('title', new.title, 'board_key', new.board_key)
    );

    if new.parent_id is not null then
      select t.type into v_new_parent_type
        from public.todos t
       where t.id = new.parent_id;

      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (
        new.board_id, v_actor, 'todo', new.parent_id,
        case when v_new_parent_type = 'Epic'
             then 'task_added_to_epic' else 'subtask_added' end,
        jsonb_build_object('title', new.title, 'board_key', new.board_key)
      );
    end if;

    return null;
  end if;

  if tg_op = 'DELETE' then
    -- Guards both inserts: the second names the same board_id, and a board
    -- cascade removes parent and child work items in the one statement.
    if exists (select 1 from public.boards b where b.id = old.board_id) then
      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (
        old.board_id, v_actor, 'todo', old.id, 'deleted',
        jsonb_build_object('title', old.title, 'board_key', old.board_key)
      );

      if old.parent_id is not null then
        select t.type into v_old_parent_type
          from public.todos t
         where t.id = old.parent_id;

        insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
        values (
          old.board_id, v_actor, 'todo', old.parent_id,
          case when v_old_parent_type = 'Epic'
               then 'task_removed_from_epic' else 'subtask_removed' end,
          jsonb_build_object('title', old.title, 'board_key', old.board_key)
        );
      end if;
    end if;

    return null;
  end if;

  -- tg_op = 'UPDATE' from here, and it needs the same guard the DELETE branch
  -- above already has. todos.assignee_id is ON DELETE SET NULL, so deleting a
  -- profile UPDATEs every todo assigned to them; when that profile is being
  -- removed as part of a cascade that is also deleting the board, this branch
  -- would insert an activities row referencing a board that is already gone,
  -- and activities_board_id_fkey refuses it. The whole DELETE then fails, so an
  -- account with assigned work could not be deleted at all.
  if not exists (select 1 from public.boards b where b.id = new.board_id) then
    return null;
  end if;

  if new.status_id is distinct from old.status_id then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'moved',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      (select s.name::text from public.statuses s where s.id = old.status_id),
        'to',        (select s.name::text from public.statuses s where s.id = new.status_id)
      )
    );
  end if;

  if new.assignee_id is distinct from old.assignee_id then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'assigned',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      old.assignee_id,
        'to',        new.assignee_id
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

  if new.description is distinct from old.description then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'description_changed',
      jsonb_build_object('title', new.title, 'board_key', new.board_key)
    );
  end if;

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

  if new.parent_id is distinct from old.parent_id then
    if old.parent_id is not null then
      select t.type into v_old_parent_type
        from public.todos t
       where t.id = old.parent_id;
    else
      v_old_parent_type := null;
    end if;

    if new.parent_id is not null then
      select t.type into v_new_parent_type
        from public.todos t
       where t.id = new.parent_id;
    else
      v_new_parent_type := null;
    end if;

    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'parent_changed',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      old.parent_id,
        'to',        new.parent_id,
        'from_type', v_old_parent_type,
        'from_key',  (select t.board_key from public.todos t where t.id = old.parent_id),
        'to_type',   v_new_parent_type,
        'to_key',    (select t.board_key from public.todos t where t.id = new.parent_id)
      )
    );

    if old.parent_id is not null then
      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (
        new.board_id, v_actor, 'todo', old.parent_id,
        case when v_old_parent_type = 'Epic'
             then 'task_removed_from_epic' else 'subtask_removed' end,
        jsonb_build_object('title', new.title, 'board_key', new.board_key)
      );
    end if;

    if new.parent_id is not null then
      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (
        new.board_id, v_actor, 'todo', new.parent_id,
        case when v_new_parent_type = 'Epic'
             then 'task_added_to_epic' else 'subtask_added' end,
        jsonb_build_object('title', new.title, 'board_key', new.board_key)
      );
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.log_status_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'status', new.id, 'created',
            jsonb_build_object('title', new.name::text));
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- False only when the board is already mid-cascade (0008).
    if exists (select 1 from public.boards b where b.id = old.board_id) then
      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (old.board_id, v_actor, 'status', old.id, 'deleted',
              jsonb_build_object('title', old.name::text));
    end if;

    return null;
  end if;

  -- citext compares case-insensitively, so a case-only rename is compared as
  -- text: "done" -> "Done" is a rename a person asked for.
  if new.name::text is distinct from old.name::text then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'status', new.id, 'renamed',
            jsonb_build_object('from', old.name::text, 'to', new.name::text));
  end if;

  return null;
end;
$$;

comment on function public.log_status_activity() is
  'Status create / rename / delete, mirroring log_column_activity. Silent on reorder, category, visibility and column changes.';

create trigger statuses_log_activity
  after insert or update or delete on public.statuses
  for each row execute function public.log_status_activity();

comment on function public.log_column_activity() is
  'Column create / rename / delete. Silent on reorder and on limit changes.';

alter table todos drop column column_id;

alter table columns drop column category;

create index todos_backlog_idx on todos (board_id) where status_id is null;

comment on column todos.completed_at is
  'When this card entered a done-category status. Maintained by triggers on todos and on statuses (0026) -- never written by the API.';

comment on column todos.started_at is
  'When work observably began: the instant the card first entered a status whose category is not todo. Maintained by trigger, never by the API. Not todos.start_date, which is a user-set plan.';

comment on column boards.workflow_enabled is
  'Enforce the sequential status-category workflow (todo -> in_progress -> in_review -> done) on this board. Read by todos.service.ts; the rule itself is lib/workflow.ts.';
