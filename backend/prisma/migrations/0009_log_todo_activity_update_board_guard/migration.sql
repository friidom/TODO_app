-- 0009 — log_todo_activity's UPDATE branch needs the board-exists guard too.
--
-- Third instance of the same defect as §21.11 and §21.12, and the one those two
-- missed. 0007 guarded log_member_activity's DELETE branch; 0008 guarded
-- log_column_activity's and log_todo_activity's. All three fixes assumed the
-- only way to write an activities row for a vanishing board was to delete a
-- row. It is not.
--
-- todos.assignee_id references profiles ON DELETE SET NULL. Deleting a profile
-- therefore UPDATEs every todo assigned to them, which fires log_todo_activity
-- on the UPDATE path, whose `assignee_id is distinct from` branch inserts an
-- activities row against new.board_id. During a cascade that is also removing
-- that board, the board is already gone and activities_board_id_fkey refuses
-- the insert — failing the entire DELETE.
--
-- Reproduced before writing this, on the real schema:
--
--   owner and assignee both registered; assignee added to owner's board;
--   one todo on owner's board with assignee_id = assignee
--   delete from users  ->  activities_board_id_fkey, 0 rows deleted
--
-- So a user with assigned work could not delete their account, and neither
-- could anyone whose deletion cascaded onto such a board.
--
-- The body below is 0008's, copied programmatically and diffed rather than
-- retyped (§18.1): the only change is the guard added at the top of the UPDATE
-- section. Ordinary updates are unaffected — the board exists, the guard passes,
-- and every branch behaves as before.
--
-- Forward-only. Reversing means re-applying 0008's body in a new migration.

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
