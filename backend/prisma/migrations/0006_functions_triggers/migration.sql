-- The 12 trigger functions and their 17 triggers.
--
-- Three things changed in the port from Supabase, and nothing else:
--
-- 1. auth.uid() -> nullif(current_setting('app.actor_id', true), '')::uuid, in
--    the five functions that record who did something. The backend opens every
--    mutating transaction with:
--
--        select set_config('app.actor_id', $1, true)
--
--    The third argument makes it transaction-local, so it cannot leak to
--    another request on a pooled connection. SET LOCAL cannot be used here: it
--    is a utility statement and takes no bind parameter, so it would force the
--    actor id -- a value derived from a token -- to be interpolated into SQL.
--    current_setting(..., true) returns NULL when unset, which matches
--    Supabase's behaviour for a write with no session; actor_id is nullable
--    for exactly that case. The nullif guards the empty string, which would
--    otherwise fail the ::uuid cast.
--
-- 2. SECURITY DEFINER is dropped. It existed only so these functions could
--    bypass RLS, and there is no RLS here (S5/S6: one application role).
--
-- 3. owns_space() is inlined into boards_space_ownership(). It was an RLS
--    helper, not a trigger function; inlining keeps the behaviour and avoids
--    carrying a function whose only other caller was a policy.
--
-- set search_path = '' is kept on every function, so every name is qualified.
-- These triggers stay in the database rather than moving to the service layer
-- because a trigger also fires for cascades and set-based updates -- rehoming
-- a column's items, a sprint bulk-assigning columns -- which service code has
-- to remember, and the day it forgets, the feed silently lies.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.assign_todo_board_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.board_key is not null then
    return new;
  end if;

  -- The client upserts rather than inserts, so this fires again on every
  -- update to an existing row. Without this guard a drag would burn a key.
  if exists (select 1 from public.todos t where t.id = new.id) then
    return new;
  end if;

  update public.boards
  set next_key = next_key + 1
  where id = new.board_id
  returning next_key - 1 into new.board_key;

  return new;
end;
$$;

comment on function public.assign_todo_board_key() is
  'Allocates todos.board_key from boards.next_key. Forward-only: keys are '
  'never reused, so a deleted card does not free its number.';

create or replace function public.add_owner_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.board_members (board_id, user_id, role, joined_at)
  values (new.id, new.owner_id, 'owner', new.created_at)
  on conflict (board_id, user_id) do nothing;

  return null;
end;
$$;

-- Without this, a new board has no membership row and its own owner is locked
-- out: the row cannot be authorized by membership, because there is none yet.
comment on function public.add_owner_membership() is
  'The only writer that mints a board first membership. Do not remove.';

create or replace function public.enforce_board_owner_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception
      'boards.owner_id is immutable; ownership transfer does not exist (board %)',
      old.id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_board_owner_immutable() is
  'Freezes boards.owner_id. Half of the ownership invariant -- the other half '
  'is enforce_owner_membership_immutable. Ownership transfer, when built, '
  'lifts this explicitly rather than exempting a caller from it.';

create or replace function public.enforce_owner_membership_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role <> 'owner' then
      return old;
    end if;

    -- The two cascade escape hatches: check that the parent is already gone
    -- rather than trusting the order cascades happen to fire in.
    if not exists (select 1 from public.boards b where b.id = old.board_id) then
      return old;
    end if;

    if not exists (select 1 from public.profiles p where p.id = old.user_id) then
      return old;
    end if;

    raise exception
      'the board owner membership cannot be deleted (board %, user %)',
      old.board_id, old.user_id
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner'
       and (new.role     is distinct from old.role
         or new.user_id  is distinct from old.user_id
         or new.board_id is distinct from old.board_id) then
      raise exception
        'the board owner membership cannot be changed (board %, user %)',
        old.board_id, old.user_id
        using errcode = '42501';
    end if;

    if new.role = 'owner' and old.role <> 'owner' then
      raise exception
        'ownership cannot be granted by updating a membership row'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      if not exists (
        select 1 from public.boards b
        where b.id = new.board_id and b.owner_id = new.user_id
      ) then
        raise exception
          'an owner membership must match boards.owner_id (board %)',
          new.board_id
          using errcode = '42501';
      end if;

      if exists (
        select 1 from public.board_members m
        where m.board_id = new.board_id and m.role = 'owner'
      ) then
        raise exception
          'board % already has an owner', new.board_id
          using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  return null;
end;
$$;

comment on function public.enforce_owner_membership_immutable() is
  'Owner invariants on board_members, for every writer. Allows a delete only '
  'when the parent board or profile is already gone, which is the cascade case.';

create or replace function public.boards_space_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if tg_op = 'UPDATE' and new.space_id is not distinct from old.space_id then
    return new;
  end if;

  if new.space_id is null then
    return new;
  end if;

  -- No actor means provisioning, a migration or a seed: nothing to escalate
  -- from, so pass through rather than refuse.
  if v_actor is null then
    return new;
  end if;

  if new.owner_id is distinct from v_actor then
    raise exception 'Only a board owner may file it into a space'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.spaces s
     where s.id = new.space_id
       and s.owner_id = v_actor
  ) then
    raise exception 'A board can only be filed into a space you own'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.boards_space_ownership() is
  'Filing guard for boards.space_id. Fires only when space_id actually '
  'changes, so an admin updating other board settings is unaffected.';

create or replace function public.enforce_work_item_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_type      text;
  v_grandparent_type text;
begin
  if new.type = 'Epic' and new.parent_id is not null then
    raise exception 'An Epic cannot have a parent'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.type = 'Epic' and new.type <> 'Epic' then
    if exists (
      select 1
        from public.todos child
       where child.parent_id = new.id
         and exists (
               select 1 from public.todos grandchild
                where grandchild.parent_id = child.id
             )
    ) then
      raise exception
        'Cannot change an Epic type while one of its tasks has subtasks'
        using errcode = '23514';
    end if;
  end if;

  if new.parent_id is null then
    return new;
  end if;

  select t.type into v_parent_type
    from public.todos t
   where t.id = new.parent_id
     and t.board_id = new.board_id;

  if v_parent_type is null then
    raise exception 'Parent work item not found on this board'
      using errcode = '23503';
  end if;

  -- Directly under an Epic is a Task, whatever its own type says, and a Task
  -- may have children and its own sprint.
  if v_parent_type = 'Epic' then
    return new;
  end if;

  select t.type into v_grandparent_type
    from public.todos t
   where t.id = (select parent_id from public.todos where id = new.parent_id)
     and t.board_id = new.board_id;

  if v_grandparent_type is not null and v_grandparent_type <> 'Epic' then
    raise exception 'A subtask cannot have subtasks of its own'
      using errcode = '23514';
  end if;

  if exists (select 1 from public.todos c where c.parent_id = new.id) then
    raise exception 'A work item with subtasks cannot itself become a subtask'
      using errcode = '23514';
  end if;

  if new.sprint_id is not null then
    raise exception
      'A subtask cannot belong to a sprint on its own -- it inherits its parent'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_work_item_hierarchy() is
  'The single enforcement point for Epic / Task / Subtask. Nothing in React '
  're-checks it. An Epic never has a parent; a row directly under an Epic is a '
  'Task regardless of its own type; a row under anything else is a Subtask, '
  'may neither have children nor sit under another Subtask, and may not carry '
  'its own sprint_id.';

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
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (old.board_id, v_actor, 'column', old.id, 'deleted',
            jsonb_build_object('title', old.title));
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

create or replace function public.log_member_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
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

create or replace function public.notify_on_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_board   text;
  v_actor   text;
begin
  if new.email is null then
    return new;
  end if;

  select p.id into v_user_id
    from public.profiles p
   where lower(p.email) = lower(new.email)
   limit 1;

  if v_user_id is null then
    return new;
  end if;

  if v_user_id = new.created_by then
    return new;
  end if;

  select b.title into v_board from public.boards b where b.id = new.board_id;

  select coalesce(p.full_name, p.username) into v_actor
    from public.profiles p where p.id = new.created_by;

  insert into public.notifications
    (user_id, type, board_id, entity_type, entity_id, actor_id, payload)
  values (
    v_user_id, 'invite', new.board_id, 'invite', new.id, new.created_by,
    jsonb_build_object(
      'board_title', coalesce(v_board, 'a board'),
      'actor_name',  v_actor,
      'role',        new.role
    )
  );

  return new;
end;
$$;

-- The actor is read from new.created_by rather than the session variable: the
-- invite row already records who issued it.
comment on function public.notify_on_invite() is
  'Notifies a registered invitee. Silent for an address with no profile.';

create or replace function public.notify_on_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
  v_board text;
  v_name  text;
begin
  if new.assignee_id is null or new.assignee_id = v_actor then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;

  select b.title into v_board from public.boards b where b.id = new.board_id;

  select coalesce(p.full_name, p.username) into v_name
    from public.profiles p where p.id = v_actor;

  insert into public.notifications
    (user_id, type, board_id, entity_type, entity_id, actor_id, payload)
  values (
    new.assignee_id, 'assigned', new.board_id, 'todo', new.id, v_actor,
    jsonb_build_object(
      'board_title', coalesce(v_board, 'a board'),
      'todo_title',  coalesce(new.title, 'Untitled'),
      'actor_name',  v_name
    )
  );

  return new;
end;
$$;

comment on function public.notify_on_assignment() is
  'Notifies an assignee, never the person who assigned themselves.';

create trigger boards_set_updated_at
  before update on public.boards
  for each row execute function public.set_updated_at();

create trigger boards_add_owner_membership
  after insert on public.boards
  for each row execute function public.add_owner_membership();

create trigger boards_owner_immutable
  before update on public.boards
  for each row execute function public.enforce_board_owner_immutable();

create trigger boards_space_ownership
  before insert or update on public.boards
  for each row execute function public.boards_space_ownership();

create trigger spaces_set_updated_at
  before update on public.spaces
  for each row execute function public.set_updated_at();

create trigger board_members_owner_immutable
  before insert or update or delete on public.board_members
  for each row execute function public.enforce_owner_membership_immutable();

create trigger board_members_log_activity
  after insert or update or delete on public.board_members
  for each row execute function public.log_member_activity();

create trigger board_invites_notify
  after insert on public.board_invites
  for each row execute function public.notify_on_invite();

create trigger columns_set_updated_at
  before update on public.columns
  for each row execute function public.set_updated_at();

create trigger columns_log_activity
  after insert or update or delete on public.columns
  for each row execute function public.log_column_activity();

create trigger sprints_set_updated_at
  before update on public.sprints
  for each row execute function public.set_updated_at();

create trigger todos_assign_board_key
  before insert on public.todos
  for each row execute function public.assign_todo_board_key();

create trigger todos_enforce_work_item_hierarchy
  before insert or update of parent_id, type, sprint_id on public.todos
  for each row execute function public.enforce_work_item_hierarchy();

create trigger todos_set_updated_at
  before update on public.todos
  for each row execute function public.set_updated_at();

create trigger todos_log_activity
  after insert or update or delete on public.todos
  for each row execute function public.log_todo_activity();

create trigger todos_notify_assignment
  after insert or update of assignee_id on public.todos
  for each row execute function public.notify_on_assignment();

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();
