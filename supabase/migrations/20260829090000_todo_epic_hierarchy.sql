-- M28-A · Epics: a third level, and a type-aware hierarchy. MEDIUM RISK. Tier A.
--
-- M27 built two levels — Task, and a Subtask that cannot have children — with
-- one trigger that only ever asked "is the parent itself a subtask?" This
-- migration adds a third role, Epic, sitting ABOVE Task rather than below
-- Subtask, and the trigger has to become type-aware to keep telling the three
-- apart:
--
--     Epic → Task → Subtask        (allowed, exactly three levels)
--     Epic → Subtask                (refused — skips a level)
--     Subtask → Subtask             (refused — M27's rule, unchanged)
--     anything → Epic                (refused — an Epic never has a parent)
--
--
-- WHY EPIC IS A `type`, NOT A THIRD COLUMN OR A SECOND TABLE
--
-- An Epic needs a key, a title, a description, an assignee, a status,
-- comments, activity, dates and realtime — the M27 migration made exactly
-- this argument for Subtasks and it applies unchanged here. `todos.type`
-- already has a CHECK constraint and a control; Epic is the fifth value, not
-- a new mechanism.
--
-- A row's ROLE in the hierarchy — Epic, a top-level Task, a Task under an
-- Epic, or a Subtask — is therefore never stored. It is derived from two
-- facts already on the row: its own `type`, and its parent's `type`. Storing
-- a role would be a second source of truth that this migration's own trigger
-- would have to keep in sync with `parent_id` by hand.
--
--
-- THE RULE THIS TRIGGER NOW ENFORCES, IN ONE TABLE
--
-- For a row R being written with a given (type, parent_id):
--
--   R.type = 'Epic'          → R.parent_id must be null. Full stop.
--   R.parent_id is null      → always fine (a root Task, or an Epic).
--   R.parent_id = P          → look up P.
--     P not found                       → error (missing/cross-board parent)
--     P.type = 'Epic'                   → R becomes a Task under that Epic.
--                                          No further restriction — R may
--                                          have its own subtasks; they land
--                                          at the third level, which is where
--                                          they belong.
--     P.type ≠ 'Epic'                   → R becomes a Subtask. P must itself
--                                          be a Task (P.parent_id is null, or
--                                          P's own parent is an Epic) — if P
--                                          is already a Subtask, reject: that
--                                          is the "Subtask → Subtask" rule.
--                                          R must have no children of its
--                                          own — reject otherwise, the same
--                                          "a work item with subtasks cannot
--                                          become a subtask" rule M27 had,
--                                          now phrased for three levels
--                                          instead of two.
--
-- "Epic → Subtask" — an Epic directly parenting a Subtask — needs no separate
-- check: anything directly under an Epic is classified a Task by the rule
-- above, never a Subtask. It is unrepresentable rather than merely refused.
--
--
-- WHY THE TRIGGER NOW ALSO FIRES ON `type`
--
-- M27's version fired only on `parent_id`, because an ordinary field edit —
-- a rename, a priority, a drag — never names `parent_id` in its SET list and
-- so never paid for the check. That argument still holds for `parent_id`
-- alone, but Epic adds a second way to reach an invalid state without
-- touching it: changing a row's `type` to or from `'Epic'` while `parent_id`
-- stays exactly where it was.
--
--   type → 'Epic' while parent_id is already set  → violates "Epic has no
--     parent" the instant the type changes, and a trigger watching only
--     parent_id would never see it.
--   type ← 'Epic' while this row has a Task-with-its-own-subtasks as a
--     child → the child's child would silently become a fourth level the
--     moment its parent-of-a-parent stops being an Epic. See section 4.
--
-- Both are reachable through the ordinary work-type control this migration
-- adds "Epic" to, so both need the same backstop `parent_id` gets.
--
--
-- BLAST RADIUS
--
-- Additive: one CHECK constraint widened, one activities CHECK widened, one
-- trigger function replaced (renamed, since "subtask depth" stopped being
-- the whole of what it checks), one activity-writing function replaced. No
-- table created or dropped, no column added, no row written, no policy
-- touched, no grant changed. Every existing row has `type <> 'Epic'`, so the
-- widened CHECK validates instantly against the current data.
--
-- BACKUP — NOT TAKEN, and not required. Tier A: writes no row.
--
-- ORDERING NOTE. Requires 20260828090000 (parent_id, the M27 trigger) and
-- 20260827090000 (the activities vocabulary this extends) to have been
-- applied.


-- 1. Epic joins the work types ------------------------------------------------------

alter table public.todos drop constraint if exists todos_type_check;

alter table public.todos
  add constraint todos_type_check
  check (type in ('Bug', 'Task', 'Story', 'Feature', 'Epic'));


-- 2. The hierarchy trigger, replaced and renamed --------------------------------------
--
-- Renamed from `enforce_subtask_depth` to `enforce_work_item_hierarchy`: the
-- old name described exactly what the two-level version checked, and this
-- version checks more than depth alone — it checks which ROLE a parent and
-- child may play, which "depth" never quite said even in M27 and definitely
-- does not say now that Epic sits above Task rather than below Subtask.
--
-- `security definer`, `set search_path = ''`, every reference schema-
-- qualified — unchanged from M27, and for the same reason: the lookups are
-- on rows the caller could already read (same board, and writing here
-- requires an editor role on it), so the definer rights widen nothing.

drop trigger if exists todos_enforce_subtask_depth on public.todos;
drop function if exists public.enforce_subtask_depth();

create or replace function public.enforce_work_item_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_type       text;
  v_grandparent_type  text;
begin
  -- Rule 1. An Epic never has a parent. Checked first and unconditionally —
  -- it is the one rule that does not depend on what parent_id resolves to.
  if new.type = 'Epic' and new.parent_id is not null then
    raise exception 'An Epic cannot have a parent'
      using errcode = '23514';
  end if;

  -- Rule 2. Leaving Epic-hood while a child of this row has its own
  -- children would silently create a fourth level: this row would become a
  -- Task (or a Subtask, if it is also gaining a parent), its child would be
  -- reclassified from "Task under an Epic" to "Subtask", and that child's
  -- own child — previously a legal third-level Subtask — would now be a
  -- Subtask's Subtask. Only relevant on UPDATE, and only when `type` is the
  -- column actually changing away from Epic.
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
        'Cannot change an Epic''s type while one of its tasks has subtasks'
        using errcode = '23514';
    end if;
  end if;

  -- Rule 3. A root row — parent_id null — is always fine from here: a root
  -- Task and an Epic (already checked by rule 1) are both legal, and nothing
  -- below this point has anything to look up.
  if new.parent_id is null then
    return new;
  end if;

  select t.type into v_parent_type
    from public.todos t
   where t.id = new.parent_id
     and t.board_id = new.board_id;

  if v_parent_type is null then
    -- The composite FK would also refuse this, but it fires after this
    -- trigger and names a constraint rather than the thing that went wrong.
    raise exception 'Parent work item not found on this board'
      using errcode = '23503';
  end if;

  if v_parent_type = 'Epic' then
    -- R becomes a Task under this Epic. No further restriction: its own
    -- children land at the third level, which is exactly where they belong.
    return new;
  end if;

  -- The parent is not an Epic, so R is becoming a Subtask. The parent must
  -- itself be a Task — top level, or already sitting under an Epic — and
  -- must not itself be a Subtask, which is the "Subtask → Subtask" rule.
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

  return new;
end;
$$;

comment on function public.enforce_work_item_hierarchy() is
  'Keeps the hierarchy at exactly three roles — Epic, Task, Subtask — by '
  'type: an Epic may not have a parent, a row directly under an Epic is a '
  'Task regardless of its own type, and a row under anything else is a '
  'Subtask and may neither have children nor sit under another Subtask.';

drop trigger if exists todos_enforce_work_item_hierarchy on public.todos;

create trigger todos_enforce_work_item_hierarchy
  before insert or update of parent_id, type on public.todos
  for each row execute function public.enforce_work_item_hierarchy();


-- 3. Activity vocabulary --------------------------------------------------------------
--
-- Two new events, from the PARENT's side of an attach/detach — the same
-- shape M27's `subtask_added` / `subtask_removed` already have, because
-- "something was added as my child" is the same event whether the child
-- becomes a Task (parent is an Epic) or a Subtask (parent is a Task). Which
-- pair the writer below chooses is decided by the PARENT's type, not the
-- child's — a Bug or a Story assigned to an Epic is still "a task", in the
-- sense this hierarchy means it, because it occupies the Task position.
--
-- `parent_changed` (M27) is not renamed or duplicated. It already fires on
-- the CHILD for every reparenting, Epic-related or not; this migration only
-- widens what its payload carries (section 4) so the sentence can say which
-- kind of parent it gained or lost, rather than adding a second action for
-- the same field.

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
      ('todo',   'description_changed'),
      ('todo',   'estimate_changed'),
      ('todo',   'parent_changed'),
      ('todo',   'subtask_added'),
      ('todo',   'subtask_removed'),
      -- New in this migration.
      ('todo',   'task_added_to_epic'),
      ('todo',   'task_removed_from_epic'),
      ('column', 'created'),
      ('column', 'renamed'),
      ('column', 'deleted'),
      ('member', 'added'),
      ('member', 'role_changed'),
      ('member', 'removed')
    )
  );


-- 4. The activity writer, replaced ----------------------------------------------------
--
-- Everything through `estimate_changed` is carried forward byte-for-byte
-- from `20260827090000_todo_history_fields.sql`. Three things are new:
--
--   a. INSERT: which pair (`subtask_added`/`task_added_to_epic`) is written
--      against the new parent now depends on the new parent's type, decided
--      by a lookup instead of assumed.
--   b. DELETE: the symmetric lookup, best-effort. When a Task-under-Epic is
--      deleted on its own, its Epic parent still exists and the lookup
--      correctly names `task_removed_from_epic`. When an EPIC is deleted and
--      the delete cascades to its Tasks, each Task's own AFTER DELETE fires
--      after the Epic row is already gone from the table (Postgres performs
--      the referencing DELETE, of which this row is one, as part of
--      satisfying the FK on the Epic's own delete) — the lookup then finds
--      nothing and this falls back to `subtask_removed`, the same generic
--      wording M27 always used. That fallback is accepted rather than
--      chased: `activities.entity_id` carries no foreign key specifically so
--      an entry survives the thing it points at being gone (M7-05 rule 2),
--      and the entry against the vanishing Epic is written either way — only
--      its exact wording is occasionally generic instead of specific.
--   c. UPDATE: `parent_changed`'s payload gains `from_type`/`from_key`/
--      `to_type`/`to_key`, resolved the same way `moved` resolves column
--      titles — at write time, so the entry still explains itself after the
--      old or new parent is gone. And reparenting via UPDATE (as against
--      creation or deletion) now ALSO writes the parent-side event: "assign
--      an existing Task to an Epic" is a reparent, not an insert, and
--      without this the Epic's own history would stay silent about it.

create or replace function public.log_todo_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
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
      -- Best-effort: see section 4b for why this can legitimately find
      -- nothing when the parent is being deleted in the same cascade.
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

  -- UPDATE. Independent events, and a row can raise more than one.

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

    -- The child's own entry — M27's action, M28-A's richer payload. Both
    -- ends carry their key and type where resolvable, snapshotted now so the
    -- sentence still explains itself after either parent is renamed, or
    -- gone (M7-05 rule 2).
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'parent_changed',
      jsonb_build_object(
        'title',      new.title,
        'board_key',  new.board_key,
        'from',       old.parent_id,
        'to',         new.parent_id,
        'from_type',  v_old_parent_type,
        'from_key',   (select t.board_key from public.todos t where t.id = old.parent_id),
        'to_type',    v_new_parent_type,
        'to_key',     (select t.board_key from public.todos t where t.id = new.parent_id)
      )
    );

    -- The parent-side entries. Written here too, not only at INSERT/DELETE
    -- time — "assign an existing Task to an Epic" is a reparent, and without
    -- this the Epic's own history would never mention it.
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

comment on function public.log_todo_activity() is
  'Writes activities for work item create / move / assign / retitle / '
  'priority / due date / type / description / estimate / parent / delete, '
  'one entry per field that actually changed, plus subtask_added/removed or '
  'task_added_to_epic/removed against whichever parent gained or lost a '
  'child — at insert, delete, or reparent via update alike.';


-- 5. What is deliberately NOT changed --------------------------------------------------
--
--   · RLS and grants. `type`'s widened CHECK is covered by the existing
--     whole-row policies exactly as every other column is — M3-05 gates
--     INSERT/UPDATE/DELETE on `board_role(board_id)`, and policies are not
--     per-column.
--   · `todos_parent_id_fkey`, `todos_parent_not_self`, `todos_parent_idx` —
--     M27's, and still exactly right: the composite FK still stops a
--     cross-board parent, the CHECK still stops self-parenting, and the
--     partial index still serves "who are this row's children" regardless
--     of whether that row is a Task or an Epic.
--   · `assign_todo_board_key`. Still unconditional — an Epic gets a key like
--     any other row.
--   · `delete_column` / `rebalance_column_ranks`. Both still key on
--     `column_id` alone, and that is still correct: a Task under an Epic
--     sits in a real column exactly like a top-level Task, and a Subtask's
--     `column_id` is what M27 already established gives it a status.


-- 6. Rollback -------------------------------------------------------------------------
--
-- Forward-fix, per Rule 4. Reversing means a new migration that, in order:
--
--   1. deletes the rows the two new actions wrote:
--
--      delete from public.activities
--       where (entity_type, action) in
--             (('todo','task_added_to_epic'), ('todo','task_removed_from_epic'));
--
--   2. restores the sixteen-pair constraint and `log_todo_activity()`'s
--      previous body from `20260827090000_todo_history_fields.sql`;
--
--   3. drops this migration's trigger and function, and recreates M27's
--      `enforce_subtask_depth()` / `todos_enforce_subtask_depth`;
--
--   4. narrows `todos_type_check` back to the original four values — only
--      safe once no row has `type = 'Epic'`:
--
--      update public.todos set type = 'Task' where type = 'Epic';
--      alter table public.todos drop constraint if exists todos_type_check;
--      alter table public.todos
--        add constraint todos_type_check
--        check (type in ('Bug', 'Task', 'Story', 'Feature'));
--
-- Step 4 is the only lossy one — it discards which rows were Epics, not
-- structure. Reverse only while Epics are still unused.
--
--
-- VERIFICATION (run after `npm run db:push`)
--
--   1. Create an Epic: insert a todo with type='Epic', parent_id=null.
--      Expect: succeeds, one 'created' activity row, no 'subtask_added'
--      (nothing to notify — it has no parent).
--
--   2. Assign an existing top-level Task to it:
--        update todos set parent_id = '<epic>' where id = '<task>';
--      Expect: succeeds. THREE new activity rows — 'parent_changed' on the
--      task (payload.to_type = 'Epic'), 'task_added_to_epic' on the epic,
--      and nothing removed-side (old.parent_id was null).
--
--   3. Add a subtask to that task: insert with parent_id = '<task>'.
--      Expect: succeeds — Epic → Task → Subtask, three levels.
--
--   4. Try to nest a second level of subtask under the one from #3:
--        update todos set parent_id = '<subtask from #3>' where id = '<x>';
--      Expect: 'A subtask cannot have subtasks of its own' (23514).
--
--   5. Try to make the Epic itself a child of the Task:
--        update todos set parent_id = '<task>' where id = '<epic>';
--      Expect: 'An Epic cannot have a parent' (23514).
--
--   6. Try to convert the Task (which now has a subtask) back to Epic while
--      IT still has a parent:
--        update todos set type = 'Epic' where id = '<task>';
--      Expect: 'An Epic cannot have a parent' (23514) — it still belongs to
--      the epic from step 2.
--
--   7. Remove the task from the epic, then retry #6:
--        update todos set parent_id = null where id = '<task>';
--        update todos set type = 'Epic' where id = '<task>';
--      Expect: step 1 succeeds and writes 'parent_changed' (to_type null) +
--      'task_removed_from_epic' on the original epic. Step 2 is refused —
--      'Cannot change an Epic''s type while one of its tasks has subtasks' —
--      because the task still has the subtask from #3.
--
--   8. Delete the original epic (now with no children, after step 7).
--      Expect: succeeds, one 'deleted' row, no parent-side row (parent_id
--      was already null).
--
-- AFTER APPLYING: run `npm run db:types`. `type`'s generated column stays
-- `string` either way (it is `text` with a CHECK, not an enum), so no type
-- changes are expected from this migration beyond confirming that.
