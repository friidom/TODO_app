-- Fixes the rest of the defect 0007 fixed: deleting a board was still
-- impossible, and so was deleting a user.
--
-- 0007 guarded log_member_activity's DELETE branch, and its probe created a
-- board with a membership and nothing else -- which passed. Every real board
-- also has columns: provisioning creates four. log_column_activity and
-- log_todo_activity have the same unguarded DELETE branch, so the moment a
-- board carried a single column or work item, the cascade hit
-- activities_board_id_fkey again and the DELETE failed.
--
-- It follows up the chain. boards.owner_id references profiles ON DELETE
-- CASCADE and profiles.id references users ON DELETE CASCADE, so an
-- undeletable board makes its owner's account undeletable too -- which is how
-- this surfaced: the B5 authentication probe could not clean up after itself.
--
-- Measured before the fix:
--
--   board with no columns  -> delete succeeds        (what 0007 tested)
--   board with a column    -> activities_board_id_fkey, delete fails
--   board with a work item -> activities_board_id_fkey, delete fails
--   the owning user        -> fails with the same constraint, by cascade
--
-- The fix is 0007's, applied to the two functions it missed: skip the log when
-- the parent board is already gone. Nothing is lost by skipping it --
-- activities.board_id is ON DELETE CASCADE, so the row would be deleted along
-- with the board microseconds later. What is dropped is an entry that could
-- not have survived the statement that wrote it.
--
-- Deleting a column or a work item on its own -- the real action, where the
-- board stays -- is unchanged and still logged, as are the INSERT and UPDATE
-- branches of both functions.
--
-- The guard is `exists (select 1 from public.boards ...)` rather than an
-- assumption about cascade ordering, matching enforce_owner_membership_immutable
-- and 0007: PostgreSQL does not promise the order in which a row's cascades
-- fire, so the only reliable question is whether the parent is still there.

create or replace function public.log_column_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'column', new.id, 'created',
            jsonb_build_object('title', new.title));
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- False only when the board is already mid-cascade. Same shape as 0007's
    -- guard on log_member_activity, and as the cascade escape hatches in
    -- enforce_owner_membership_immutable.
    if exists (select 1 from public.boards b where b.id = old.board_id) then
      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (old.board_id, v_actor, 'column', old.id, 'deleted',
              jsonb_build_object('title', old.title));
    end if;

    return null;
  end if;

  if new.title is distinct from old.title then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'column', new.id, 'renamed',
            jsonb_build_object('from', old.title, 'to', new.title));
  end if;

  return null;
end;
$$;

comment on function public.log_column_activity() is
  'Column create / rename / delete. Silent on reorder and on limit or category '
  'changes.';

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

-- Deliberately silent when only rank, backlog_rank or position changed: that
-- is what stops a drag flooding the feed.
comment on function public.log_todo_activity() is
  'One activity entry per field that actually changed, plus subtask_added / '
  'removed or task_added_to_epic / removed against whichever parent gained or '
  'lost a child. Silent on reorder.';


-- Rollback -------------------------------------------------------------------
--
-- Forward-only. To reverse, restore both function bodies from 0006 in a NEW
-- migration -- which reinstates the defect.
--
--
-- Verification ---------------------------------------------------------------
--
--   npm run auth:verify --prefix backend
--
-- registers accounts whose boards carry four columns and deletes them again.
-- Before this migration its clean-up failed with activities_board_id_fkey.
