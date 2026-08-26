-- M27 · Subtasks: one self-referencing parent. MEDIUM RISK. Tier A.
--
-- A normal work item may have many subtasks. A subtask may have none. Two
-- levels, never three:
--
--     Task → Subtask                (allowed)
--     Task → Subtask → Subtask      (refused, by the trigger in section 4)
--
--
-- WHY ONE TABLE AND NOT A `subtasks` TABLE
--
-- Appendix D has recorded the answer since 2026-08-10 and M27's own section in
-- docs/IMPLEMENTATION_PLAN.md restates it: a subtask needs a key, a title, a
-- description, an assignee, a status, comments, activity, dates and realtime.
-- That is `todos`. A second table means a second set of policies, cache
-- functions, realtime handlers, query keys and views — permanently, and in
-- every milestone after this one.
--
--
-- WHAT A SUBTASK IS, PHYSICALLY
--
-- A `todos` row whose `parent_id` is not null. It keeps everything else:
--
--   · `board_key` — the BEFORE INSERT trigger from M2-21 is unconditional, so
--     a subtask gets `KAN-78` exactly as a card does. Deliberate: the
--     reference shows a subtask by its key, and giving one type an exception
--     would be a special case in the one mechanism that must not have any.
--
--   · `column_id` — **a subtask carries a real column**, which is what makes
--     "1 of 3 done" answerable. Doneness in this schema has been the column's
--     `category` since M2-15 and there is no second completion system; a
--     subtask with a null column would have no status to complete. See
--     section 5 for the four places that consequence had to be checked.
--
-- What a subtask does NOT get is a place on the board. `fetchTodos` still
-- returns every row of the board, and `useVisibleTodos` filters
-- `parent_id === null` before the view pipeline — one client-side gate rather
-- than a query predicate, so the same cache entry can answer both "what cards
-- are on this board" and "what are KAN-9's children" without a second query.
--
--
-- BLAST RADIUS
--
-- Additive. One nullable column, one foreign key, one CHECK, one partial
-- index, one new trigger, and a `create or replace` of the activity logger.
-- No existing column is altered, no row is written, no policy is replaced, no
-- grant changes. Every existing row reads `parent_id = null`, which is
-- exactly "a normal top-level task" — so the meaning of every row that
-- already exists is unchanged and no backfill is required.
--
-- BACKUP — NOT TAKEN, and not required. Tier A under Rule 6: this migration
-- creates objects and writes no row. Rollback is section 7's forward-fix SQL.


-- 1. The column ---------------------------------------------------------------------
--
-- Nullable, and the null is load-bearing rather than incidental: `null` means
-- "a normal top-level work item", which is what every row in the table is
-- today. There is no default and no NOT NULL, so this is a catalog-only
-- change — no table rewrite, no lock worth naming.

alter table public.todos add column if not exists parent_id uuid;


-- 2. The foreign key ----------------------------------------------------------------
--
-- **Composite `(parent_id, board_id)`, not a bare `parent_id`.** The pair
-- points at `todos_id_board_id_key`, the unique constraint the comments
-- migration already added, and the reason is M3-18's: a bare FK would let a
-- work item on board A be filed under a parent on board B, and RLS would then
-- show a member of A a subtask whose parent they cannot see. The composite
-- makes that unrepresentable rather than merely unlikely — the same idiom
-- `todos_column_id_fkey` uses for the column/board pair.
--
-- MATCH SIMPLE (the default) means the constraint is satisfied whenever ANY
-- referencing column is null. `parent_id` is nullable and `board_id` is NOT
-- NULL, so a top-level item — the overwhelmingly common row — is permitted
-- without the FK having anything to check.
--
-- **ON DELETE CASCADE.** Deleting a task deletes its subtasks. The argument
-- is `comments_todo_id_fkey`'s, verbatim: RESTRICT is right for a column
-- because its cards are rehomed first and have somewhere to go; a subtask has
-- nowhere to be rehomed to. The alternative — `set null` — silently promotes
-- every child to a top-level card the moment a parent is deleted, which is
-- how you get an orphan that looks like a deliberate task. The UI must say so
-- before the delete, which is what `DeleteColumnModal` already established as
-- the convention for a destructive cascade.

alter table public.todos drop constraint if exists todos_parent_id_fkey;

alter table public.todos
  add constraint todos_parent_id_fkey
  foreign key (parent_id, board_id)
  references public.todos (id, board_id)
  on delete cascade;


-- 3. No self-parenting ---------------------------------------------------------------
--
-- A CHECK rather than a trigger branch, because this is the one depth rule
-- expressible without a subquery. `is distinct from` rather than `<>` so the
-- null case is true rather than null — the same care every other nullable
-- comparison in this schema takes.

alter table public.todos drop constraint if exists todos_parent_not_self;

alter table public.todos
  add constraint todos_parent_not_self
  check (parent_id is null or parent_id is distinct from id);


-- 4. The depth rule ------------------------------------------------------------------
--
-- **A trigger, and only because neither of the cheaper tools can express it.**
-- This schema's stated order of preference is foreign key, then CHECK, then
-- trigger — `20260811130000` and `20260818100000` both say a redundant unique
-- plus a composite FK "is cheaper than a trigger, which would have to fire on
-- both tables and be maintained by hand". A CHECK may not contain a subquery,
-- and "the row named as my parent must itself have no parent" is a subquery by
-- construction. So this is the residue: the exact rule the other two cannot
-- state, and nothing else.
--
-- Two symmetrical halves, and both are needed:
--
--   a. The parent must exist on this board AND must itself be top level.
--      Refusing this is what stops Task → Subtask → Subtask.
--   b. This row must not already be somebody's parent. Refusing this is what
--      stops the same illegal shape being reached from the other end — by
--      demoting a task that already has children rather than by nesting under
--      a child.
--
-- Without (b), `update todos set parent_id = X where id = A` on a task A that
-- has children would produce exactly the three-level tree (a) forbids, and no
-- amount of checking the child's write would catch it.
--
-- `security definer` matching `log_todo_activity`, with `set search_path = ''`
-- and every reference schema-qualified. The lookup it performs is on a row the
-- caller can already read — the parent is on the same board, and inserting
-- here at all requires an editor role on that board — so the definer rights
-- widen nothing.
--
-- **BEFORE INSERT OR UPDATE OF parent_id**, not a bare `before update`: an
-- ordinary field edit (a rename, a priority, a drag) does not name `parent_id`
-- in its SET list, so the trigger does not fire for it and the common write
-- path pays nothing. PostgREST's upserts do list every column they send, and
-- `updateTodo` sends only the patched keys, so this holds in practice and not
-- merely in theory.

create or replace function public.enforce_subtask_depth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Three-valued on purpose: true = the parent exists and is top level,
  -- false = it exists and is itself a subtask, null = no such row on this
  -- board. Each is a different error below.
  v_parent_is_top_level boolean;
begin
  if new.parent_id is null then
    -- A top-level write, or a promotion back to top level. Neither can create
    -- a third level, and a row losing its parent is always allowed.
    return new;
  end if;

  select (t.parent_id is null)
    into v_parent_is_top_level
    from public.todos t
   where t.id = new.parent_id
     and t.board_id = new.board_id;

  if v_parent_is_top_level is null then
    -- The composite FK in section 2 would also refuse this, but it fires
    -- after this trigger and its message names a constraint rather than the
    -- thing that went wrong. Raising here is what turns a missing or
    -- cross-board parent into a sentence.
    raise exception 'Parent work item not found on this board'
      using errcode = '23503';
  end if;

  if not v_parent_is_top_level then
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

comment on function public.enforce_subtask_depth() is
  'Keeps the work item hierarchy exactly two levels deep: a parent must be '
  'top level and on the same board, and a row that already has children may '
  'not itself become a child. The one rule a CHECK cannot express.';

drop trigger if exists todos_enforce_subtask_depth on public.todos;

create trigger todos_enforce_subtask_depth
  before insert or update of parent_id on public.todos
  for each row execute function public.enforce_subtask_depth();


-- 5. The index -----------------------------------------------------------------------
--
-- Partial, on `parent_id is not null`. The overwhelming majority of rows are
-- top-level and would be a null entry taking space in a full index for a
-- query nobody issues — "find every row with no parent" is answered by the
-- board fetch, which is already `(board_id)`-scoped and returns them anyway.
--
-- What this serves is the parent panel's own question, "which rows are
-- children of KAN-9", and the depth trigger's half-(b) existence check, which
-- runs `where c.parent_id = new.id` on every parent change.

drop index if exists public.todos_parent_idx;

create index todos_parent_idx
  on public.todos (parent_id)
  where parent_id is not null;


-- 6. Activity ------------------------------------------------------------------------
--
-- Three new events, and one thing deliberately NOT new.
--
-- **Not new: a subtask's own create, delete and status change.** The trigger
-- has logged `('todo','created')`, `('todo','deleted')` and `('todo','moved')`
-- for every row since M18, and a subtask is a row — so "subtask created",
-- "subtask deleted" and "subtask status changed" already produce entries in
-- that subtask's own History tab with no change at all. Adding a parallel
-- vocabulary for them would be two names for one event.
--
-- **New: the same three facts as seen from the PARENT.** An entry on the
-- child says nothing in the parent's History, and "somebody added a subtask
-- to this task" is exactly the kind of thing the parent's reader wants. So
-- `subtask_added` / `subtask_removed` are written against `entity_id =
-- parent_id`, carrying the CHILD's title and key in the payload — the row is
-- about the parent, the sentence is about the child.
--
-- **New: `parent_changed`**, on the child, for the one field this milestone
-- adds that the M18 vocabulary has no word for. No UI writes it yet — M27
-- ships no re-parenting control, per its own scope — but `TodoPatch` admits
-- the field, so the write path exists and must be logged the moment anything
-- uses it. A field that can change and does not appear in history is the gap
-- M25 spent a milestone closing.
--
-- One consequence worth stating: deleting a parent cascades, so each child's
-- own DELETE fires this trigger and writes a `subtask_removed` naming a
-- parent row that is being deleted in the same statement. That is safe and
-- intended — `activities.entity_id` carries no foreign key precisely so an
-- entry can outlive the thing it points at (M7-05 rule 2).

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
      -- New in this migration.
      ('todo',   'parent_changed'),
      ('todo',   'subtask_added'),
      ('todo',   'subtask_removed'),
      ('column', 'created'),
      ('column', 'renamed'),
      ('column', 'deleted'),
      ('member', 'added'),
      ('member', 'role_changed'),
      ('member', 'removed')
    )
  );

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

    -- The parent's view of the same event (M27). `entity_id` is the parent,
    -- the payload describes the child.
    if new.parent_id is not null then
      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (
        new.board_id, v_actor, 'todo', new.parent_id, 'subtask_added',
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
      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (
        old.board_id, v_actor, 'todo', old.parent_id, 'subtask_removed',
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

  -- Added by this migration. Both ids stored raw, like `assigned` — the
  -- reader resolves them, and a null on either side is a real state
  -- (promoted to top level, or adopted from none).
  if new.parent_id is distinct from old.parent_id then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (
      new.board_id, v_actor, 'todo', new.id, 'parent_changed',
      jsonb_build_object(
        'title',     new.title,
        'board_key', new.board_key,
        'from',      old.parent_id,
        'to',        new.parent_id
      )
    );
  end if;

  return null;
end;
$$;

comment on function public.log_todo_activity() is
  'Writes activities for work item create / move / assign / retitle / priority / '
  'due date / type / description / estimate / parent / delete, one entry per '
  'field that actually changed, plus subtask_added / subtask_removed against '
  'the parent. Silent when only rank or position moved, which is what stops a '
  'drag filling the feed.';


-- 7. What is deliberately NOT changed ------------------------------------------------
--
--   · RLS and grants. `parent_id` is covered by the existing whole-row
--     policies exactly like `priority`, `type` and `estimate` — M3-05 gates
--     INSERT/UPDATE/DELETE on `board_role(board_id)`, and policies are not
--     per-column. An editor may file a subtask because an editor may edit the
--     card. The composite FK is what stops them naming a parent on a board
--     they cannot reach.
--
--   · `assign_todo_board_key`. Unconditional, so a subtask is allocated a key
--     like any other row. See the header.
--
--   · `delete_column`. Its rehome is `where column_id = p_column_id` with no
--     parent predicate, and that is correct: a subtask sitting in a deleted
--     column has a status that must go somewhere, exactly as a card's does.
--     Rehoming it alongside the cards is the behaviour we want, not a leak.
--
--   · `rebalance_column_ranks`. Same shape, same answer. A subtask's rank is
--     meaningless (nothing orders subtasks by it) but harmless, and excluding
--     it would be a special case earning nothing.


-- 8. Rollback -------------------------------------------------------------------------
--
-- Forward-fix, per Rule 4. Reversing means a new migration that, in order:
--
--   1. deletes the rows the new actions wrote, since the narrowed constraint
--      would otherwise refuse to validate:
--
--      delete from public.activities
--       where (entity_type, action) in
--             (('todo','parent_changed'), ('todo','subtask_added'),
--              ('todo','subtask_removed'));
--
--   2. restores the ten-pair-plus-columns-plus-members constraint and the
--      previous `log_todo_activity()` body from
--      `20260827090000_todo_history_fields.sql`;
--
--   3. drops this migration's own objects:
--
--      drop trigger if exists todos_enforce_subtask_depth on public.todos;
--      drop function if exists public.enforce_subtask_depth();
--      drop index if exists public.todos_parent_idx;
--      alter table public.todos drop constraint if exists todos_parent_not_self;
--      alter table public.todos drop constraint if exists todos_parent_id_fkey;
--      alter table public.todos drop column if exists parent_id;
--
-- Step 3's last statement is the only destructive one: dropping the column
-- discards every parent link ever made, which is data rather than structure.
-- Reverse only while subtasks are still unused.
--
--
-- VERIFICATION (run after `npm run db:push`)
--
--   1. Create a subtask:
--        insert into public.todos (id, board_id, column_id, title, parent_id)
--        values (gen_random_uuid(), '<board>', '<col>', 'child', '<task>');
--      Expect: one row. Then check it got a `board_key`, and that TWO activity
--      rows appeared — a 'created' on the child and a 'subtask_added' whose
--      `entity_id` is the parent.
--
--   2. Try to nest one level deeper:
--        insert into public.todos (id, board_id, column_id, title, parent_id)
--        values (gen_random_uuid(), '<board>', '<col>', 'grandchild', '<the subtask>');
--      Expect: `A subtask cannot have subtasks of its own` (23514).
--
--   3. Try to demote a parent:
--        update public.todos set parent_id = '<some other task>' where id = '<task>';
--      Expect: `A work item with subtasks cannot itself become a subtask` (23514).
--
--   4. Try to self-parent:
--        update public.todos set parent_id = id where id = '<task>';
--      Expect: violates check constraint "todos_parent_not_self".
--
--   5. Try a cross-board parent:
--        update public.todos set parent_id = '<a todo on another board>' where id = '<task>';
--      Expect: `Parent work item not found on this board` (23503).
--
--   6. Delete the parent:
--        delete from public.todos where id = '<task>';
--      Expect: the subtask is gone too (cascade), and a 'subtask_removed' row
--      exists naming the now-deleted parent.
--
--   7. Rename a card (an ordinary edit that does not name `parent_id`).
--      Expect: one 'retitled' row and NO 'parent_changed' row — the proof
--      that `before update of parent_id` is not firing on the common path.
--
-- AFTER APPLYING: run `npm run db:types`. `parent_id` is declared in
-- `src/types/database.ts` by this milestone's client changes so the UI
-- compiles; regenerating is what makes that declaration authoritative.
