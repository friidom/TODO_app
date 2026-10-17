-- 0038 — todos.labels: free-text labels on a work item.
--
-- WHY AN ARRAY ON THE ROW AND NOT A labels TABLE. A label here is a word a team
-- types, with no colour, owner or description of its own to manage: the
-- catalogue a picker offers is derived from the labels already on the board's
-- cards. A table pair would buy rename and merge, which nothing asks for, at
-- the cost of a second write path and a second read on every board load.
--
-- WHY THE API NEVER WRITES THE WHOLE ARRAY. Two people adding different labels
-- to one card at the same moment must both win, so the only writes are an
-- atomic append-if-absent and an atomic remove (todos.repo.ts). There is
-- deliberately no PATCH path for this column.
--
-- At most 20 per work item; the API trims and length-checks each label.
--
-- activities_event_valid gains the one new action, and log_todo_activity()
-- below is the function as 0026 left it, copied verbatim,
-- with one block added before its final RETURN: a labels_changed row whose
-- payload carries the arrays before and after, from which History names what
-- was added and removed.
--
-- Forward-only. Reversing means a new migration.

alter table public.todos
  add column labels text[] not null default '{}',
  add constraint todos_labels_max_check check (cardinality(labels) <= 20);

-- The event check (last redefined in 0024_statuses) names every action the
-- trigger may write; it is redefined with labels_changed added.
alter table public.activities drop constraint activities_event_valid;

alter table public.activities add constraint activities_event_valid check (
  (entity_type, action) in (
    ('todo',   'created'),
    ('todo',   'moved'),
    ('todo',   'assigned'),
    ('todo',   'retitled'),
    ('todo',   'deleted'),
    ('todo',   'priority_changed'),
    ('todo',   'due_changed'),
    ('todo',   'type_changed'),
    ('todo',   'description_changed'),
    ('todo',   'estimate_changed'),
    ('todo',   'parent_changed'),
    ('todo',   'subtask_added'),
    ('todo',   'subtask_removed'),
    ('todo',   'task_added_to_epic'),
    ('todo',   'task_removed_from_epic'),
    ('todo',   'labels_changed'),
    ('column', 'created'),
    ('column', 'renamed'),
    ('column', 'deleted'),
    ('status', 'created'),
    ('status', 'renamed'),
    ('status', 'deleted'),
    ('member', 'added'),
    ('member', 'role_changed'),
    ('member', 'removed')
  )
);

create or replace function public.log_todo_activity()
returns trigger
language plpgsql
set search_path = ''
as $function$
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

  if new.labels is distinct from old.labels then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'labels_changed',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      to_jsonb(old.labels),
        'to',        to_jsonb(new.labels)
      )
    );
  end if;

  return null;
end;
$function$;
