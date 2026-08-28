-- M29+M30 · Backlog and Sprints. MEDIUM RISK. Tier A.
--
-- Answers M11's three long-open backlog questions and adds the sprint
-- container the plan puts directly above it, in one migration because the
-- two share a single decision this file states once rather than twice: a
-- work item's presence *on the board* and its membership *in a sprint* are
-- independent facts, not two names for one column.
--
--
-- THE TWO AXES, AND WHY THEY DO NOT SHARE A COLUMN
--
--   column_id  — is this on the Board?          (existing column, already
--                                                 nullable — see below)
--   sprint_id  — is this planned into a Sprint?  (new column, this migration)
--
-- Conflating them — "in a sprint" meaning "on the board" — was considered and
-- rejected. It would mean every pre-existing work item on every board (none
-- of which has ever had a sprint, because the column did not exist before
-- this migration) drops off the Board the instant this ships, and it would
-- make "plan an item into a sprint that has not started yet" impossible
-- without also, incorrectly, putting it on the Board early. Keeping the axes
-- independent is what the plan calls "a sprint holds whatever carries the
-- column" — nothing here says a sprint's items are on the Board; it says a
-- work item may be in a sprint, full stop.
--
-- What ties them together is a *lifecycle event*, not a query: starting a
-- sprint bulk-assigns column_id to whatever it holds that has none yet (this
-- migration's start_sprint()). Nothing about the Board's own query changes —
-- `useTodosByColumns` already groups by `column_id` and already skips a null
-- one (that defensive line predates this migration; the shape was already
-- there for exactly this day). Zero rows change meaning, because column_id's
-- meaning does not change.
--
--
-- "WHAT IS IN THE BACKLOG?" — column_id IS NULL
--
-- The column has been nullable since the baseline schema (`"column_id" "uuid"`,
-- no NOT NULL was ever added — confirmed by reading every migration that
-- touches it). The composite FK (`todos_column_id_fkey`, M3-18) is `MATCH
-- SIMPLE`, Postgres's default, so a null column_id trivially satisfies it —
-- no FK change either. The shape M11 asked about already exists; this
-- migration is the first thing that deliberately produces the null rather
-- than treating it as an anomaly.
--
-- An explicit `is_backlog` flag was rejected for the reason `null column_id`
-- always is: a second place to store one fact is a second place for it to
-- disagree with the first.
--
--
-- "DOES THE BACKLOG HAVE ITS OWN ORDERING?" — todos.backlog_rank
--
-- Yes, and it is a second *value*, not a second *scheme*: the same fractional
-- ranking `rank` already uses (`src/utils/rank.ts`), applied to a column with
-- no legacy dense-integer predecessor to fall back to, which is why it is
-- simply nullable rather than mirroring `rank`'s null-means-"read position
-- instead" fallback. A card's spot in a Sprint's planning list and its spot
-- in a Kanban column are different questions with different answers, and
-- `rank` already answers the second one.
--
--
-- SPRINTS ARE A TABLE, NOT A `todos.type`
--
-- A sprint has no key, no assignee, no column, no comments — it has a
-- *lifecycle* (future → active → completed) and two dates of its own.
-- Modelling it as a work item would put a state machine inside `todos` and
-- make every existing board, list, calendar and timeline query filter it out
-- forever. `board_id` is policed by `board_role()`, the same helper every
-- other board-scoped table uses (`columns`, `todos`) — Appendix D says not to
-- re-litigate this per table.
--
--
-- THE DEPTH RULE, EXTENDED RATHER THAN DUPLICATED
--
-- `enforce_work_item_hierarchy` (M27/M28) already answers "what may this
-- row's parent be" from its own type and its parent's. Section 3 below adds
-- one more fact to the same function rather than writing a second trigger:
-- a genuine Subtask carries no `sprint_id` of its own. If it could, a
-- subtask could sit in a different sprint from its parent Task, and every
-- rollup — committed points, completed points, a future burndown — would
-- have two defensible answers for the same Task. Inheriting is the one
-- answer that stays true when the parent moves, so a Subtask's sprint is
-- always read off its parent, never stored.
--
-- An Epic, and any Task/Bug/Story/Feature whether top-level or already
-- under an Epic, may carry any `sprint_id` — the two hierarchies are
-- independent, which is the whole point of the sentence "Epic → Task and
-- Epic ──→ Sprint, Task ──→ Sprint are kept separate".
--
--
-- WHAT IS DELIBERATELY NOT HERE
--
--   · Activity/history logging for sprint_id changes. `log_todo_activity`
--     (M25/M27/M28) is not touched — sprint history is a rollup feature
--     this milestone's own "not yet" list defers alongside velocity and
--     burndown, and adding a write to a trigger already carrying nine
--     branches is not a one-line change to make speculatively.
--   · Any change to the Board's read query. It reads exactly the same
--     `todos` rows it always did; a backlog item simply is not one of them,
--     for the reason `useTodosByColumns` has stated in its own comment since
--     before this migration existed.
--   · Ranking by drag across the backlog/board boundary in one gesture, and
--     bulk move — the plan's own words, both explicitly deferred.
--
--
-- BACKUP — NOT TAKEN, and not required. Tier A: two new tables' worth of
-- columns, no existing row rewritten, no data touched.


-- 1. sprints ------------------------------------------------------------------

create table public.sprints (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  name text not null,
  goal text,
  start_date timestamptz,
  end_date timestamptz,
  -- 'future' | 'active' | 'completed' — a fixed set the user picks from and
  -- never defines, the same shape as `columns.category` and `todos.type`.
  state text not null default 'future',
  -- The order Sprints list in a board's backlog view. Same rank scheme as
  -- everything else M6-A introduced; `RANK_GAP` (1024) is the client's own
  -- constant, not repeated here — the default only has to be *a* valid rank,
  -- and appending after it is ordinary `rankForAppend` arithmetic.
  rank double precision not null default 1024,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sprints
  add constraint sprints_state_check
  check (state in ('future', 'active', 'completed'));

-- Same shape as `todos_date_range_check` (M20): either end may be unset, but
-- a stored pair may not be inverted.
alter table public.sprints
  add constraint sprints_date_range_check
  check (start_date is null or end_date is null or start_date <= end_date);

alter table public.sprints
  add constraint sprints_name_check
  check (length(btrim(name)) between 1 and 120);

-- At most one active sprint per board. Two active sprints is a question
-- every rollup (committed points, "which sprint is this Task really in
-- right now" from the Board) would have to answer twice, with no rule for
-- which answer wins.
create unique index sprints_one_active_per_board
  on public.sprints (board_id)
  where state = 'active';

create index sprints_board_id_idx on public.sprints (board_id);

comment on table public.sprints is
  'A time-boxed container with its own lifecycle (M30). Not a work item — '
  'see the migration header for why. todos.sprint_id points into this table; '
  'this table never points into todos.';

drop trigger if exists sprints_set_updated_at on public.sprints;
create trigger sprints_set_updated_at
  before update on public.sprints
  for each row execute function public.set_updated_at();


-- 2. todos.sprint_id and todos.backlog_rank ------------------------------------

alter table public.todos
  add column sprint_id uuid references public.sprints (id) on delete set null;

-- `on delete set null`, never cascade — the same reasoning `boards.space_id`
-- already established: the sprint is filing, the work item is content.
-- Deleting a sprint must not delete the work planned into it.

alter table public.todos
  add column backlog_rank double precision;

create index todos_sprint_id_idx on public.todos (sprint_id)
  where sprint_id is not null;

-- The backlog's own scan: every work item with no column, per board. A
-- partial index, because "in the backlog" is the minority of rows on any
-- board that uses one, and the predicate matches the query exactly.
create index todos_backlog_idx on public.todos (board_id)
  where column_id is null;

comment on column public.todos.sprint_id is
  'Which Sprint this work item is planned into, or null (M30). Independent '
  'of parent_id and of column_id — see 20260830090000''s header. A genuine '
  'Subtask must have this null; it inherits its parent''s sprint, enforced '
  'by enforce_work_item_hierarchy.';

comment on column public.todos.backlog_rank is
  'This work item''s order in the backlog planning view (M29) — a second '
  'rank, independent of the Board''s own `rank`, because a card''s spot in a '
  'Sprint''s list and its spot in a Kanban column are different questions.';


-- 3. The hierarchy trigger, extended for sprint_id -----------------------------
--
-- `enforce_work_item_hierarchy` already computes, for the row being written,
-- which of the three roles it occupies. The one new fact this migration adds
-- to it: if the row is settling into the Subtask role, `sprint_id` must be
-- null. Everything else about the function — its rules for Epic/Task/Subtask
-- parentage — is unchanged, reproduced here only because `create or replace`
-- needs the whole body.

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
  -- children would silently create a fourth level. Only relevant on UPDATE,
  -- and only when `type` is the column actually changing away from Epic.
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
  -- Task and an Epic (already checked by rule 1) may carry any sprint_id at
  -- all, so there is nothing below this point to check for either of them.
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

  if v_parent_type = 'Epic' then
    -- R becomes a Task under this Epic. It may carry any sprint_id of its
    -- own, independent of the Epic's — Epic ──→ Sprint and Task ──→ Sprint
    -- are two separate relationships, by design.
    return new;
  end if;

  -- The parent is not an Epic, so R is becoming a Subtask.
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

  -- New in this migration. A Subtask's sprint is whatever sprint its parent
  -- Task is in — read off the parent at display time, never stored here —
  -- so a Subtask must not carry a sprint_id of its own.
  if new.sprint_id is not null then
    raise exception
      'A subtask cannot belong to a sprint on its own — it inherits its parent''s'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_work_item_hierarchy() is
  'Keeps the hierarchy at exactly three roles — Epic, Task, Subtask — by '
  'type, and keeps sprint_id off a Subtask, which inherits its parent''s. '
  'An Epic never has a parent; a row directly under an Epic is a Task '
  'regardless of its own type; a row under anything else is a Subtask, may '
  'neither have children nor sit under another Subtask, and may not carry '
  'its own sprint_id.';

drop trigger if exists todos_enforce_work_item_hierarchy on public.todos;

create trigger todos_enforce_work_item_hierarchy
  before insert or update of parent_id, type, sprint_id on public.todos
  for each row execute function public.enforce_work_item_hierarchy();


-- 4. sprints RLS ----------------------------------------------------------------
--
-- Identical shape to `columns`/`todos` (M3-05): SELECT is membership-wide via
-- accessible_board_ids(), the three writes are editor-and-above via
-- board_role(). Appendix D says not to re-litigate this per table, so this
-- section is deliberately a copy of the established pattern rather than a
-- new one.

alter table public.sprints enable row level security;

create policy "Members select sprints" on public.sprints
  for select
  using (board_id in (select public.accessible_board_ids()));

create policy "Editors and above insert sprints" on public.sprints
  for insert
  with check (public.board_role(board_id) in ('owner', 'admin', 'editor'));

create policy "Editors and above update sprints" on public.sprints
  for update
  using      (public.board_role(board_id) in ('owner', 'admin', 'editor'))
  with check (public.board_role(board_id) in ('owner', 'admin', 'editor'));

create policy "Editors and above delete sprints" on public.sprints
  for delete
  using (public.board_role(board_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on public.sprints to authenticated;


-- 5. start_sprint() — future → active, and the board catches up ----------------
--
-- SECURITY INVOKER, matching delete_column's own reasoning exactly: this
-- performs only the writes the caller could already perform by hand (an
-- UPDATE on sprints, an UPDATE on todos), atomically. RLS is evaluated
-- against the caller for both, so the editor+ gate is inherited rather than
-- re-stated, and Permission Model rule 5 (a DEFINER function must carry its
-- own board_role check) does not apply for the same reason it does not for
-- delete_column.
--
-- "Starting a sprint moves its items onto the Board" (the plan's own
-- recommendation) means exactly this bulk write: every work item already
-- planned into this sprint that has no column yet gets the board's first
-- todo-category column, ordered by rank. A row that already has a column
-- (assigned to this sprint after already being worked on the board) is left
-- exactly where it is — starting a sprint must not move a card sideways.

create or replace function public.start_sprint(p_sprint_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_board_id  uuid;
  v_state     text;
  v_column_id uuid;
  v_moved     bigint;
begin
  if p_sprint_id is null then
    raise exception 'start_sprint: sprint id is required'
      using errcode = '22023';
  end if;

  select s.board_id, s.state into v_board_id, v_state
    from public.sprints s
   where s.id = p_sprint_id;

  if v_board_id is null then
    raise exception 'start_sprint: sprint not found or not accessible'
      using errcode = '42501';
  end if;

  if v_state <> 'future' then
    raise exception 'start_sprint: only a future sprint may be started (this one is %)', v_state
      using errcode = '22023';
  end if;

  select c.id into v_column_id
    from public.columns c
   where c.board_id = v_board_id
     and c.category = 'todo'
   order by c.rank nulls last, c.position
   limit 1;

  if v_column_id is null then
    raise exception 'start_sprint: this board has no ''todo'' column to receive its items'
      using errcode = '22023';
  end if;

  update public.todos
     set column_id = v_column_id
   where sprint_id = p_sprint_id
     and column_id is null;

  get diagnostics v_moved = row_count;

  update public.sprints
     set state = 'active'
   where id = p_sprint_id;

  if not found then
    raise exception 'start_sprint: sprint update affected no row'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.start_sprint(uuid) is
  'Moves a future sprint to active and bulk-assigns the board''s first '
  'todo-category column to every one of its items that has none yet. Items '
  'already on the Board are left where they are.';

grant execute on function public.start_sprint(uuid) to authenticated;


-- 6. complete_sprint() — active → completed, unfinished work rehomed ------------
--
-- "Completed work remains completed; unfinished work moves to another sprint
-- or the backlog; the sprint becomes Completed; no work is silently lost."
--
-- Finished is "sits in a done-category column" — the one definition of
-- doneness this schema has ever had (M2-15). Everything else in the sprint —
-- including a card that never made it onto the Board at all, column_id
-- still null — is unfinished and is rehomed to p_move_to_sprint_id (another
-- sprint on the same board) or, when that argument is null, to the backlog.
--
-- column_id is deliberately left untouched here, for both outcomes. Moving
-- unfinished work to the backlog does not retroactively take a card off the
-- Board it may already be sitting on; that reconciliation is real product
-- behaviour this milestone's own scope defers, alongside bulk move, rather
-- than inventing a third bulk column-write to go with the two above.

create or replace function public.complete_sprint(
  p_sprint_id         uuid,
  p_move_to_sprint_id uuid default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_board_id      uuid;
  v_state         text;
  v_dest_board_id uuid;
begin
  if p_sprint_id is null then
    raise exception 'complete_sprint: sprint id is required'
      using errcode = '22023';
  end if;

  select s.board_id, s.state into v_board_id, v_state
    from public.sprints s
   where s.id = p_sprint_id;

  if v_board_id is null then
    raise exception 'complete_sprint: sprint not found or not accessible'
      using errcode = '42501';
  end if;

  if v_state <> 'active' then
    raise exception 'complete_sprint: only an active sprint may be completed (this one is %)', v_state
      using errcode = '22023';
  end if;

  if p_move_to_sprint_id is not null then
    if p_move_to_sprint_id = p_sprint_id then
      raise exception
        'complete_sprint: the destination sprint must differ from the one being completed'
        using errcode = '22023';
    end if;

    select s.board_id into v_dest_board_id
      from public.sprints s
     where s.id = p_move_to_sprint_id;

    if v_dest_board_id is null then
      raise exception 'complete_sprint: destination sprint not found or not accessible'
        using errcode = '42501';
    end if;

    if v_dest_board_id <> v_board_id then
      raise exception 'complete_sprint: the destination sprint belongs to a different board'
        using errcode = '42501';
    end if;
  end if;

  update public.todos t
     set sprint_id = p_move_to_sprint_id
   where t.sprint_id = p_sprint_id
     and not exists (
           select 1
             from public.columns c
            where c.id = t.column_id
              and c.category = 'done'
         );

  update public.sprints
     set state = 'completed'
   where id = p_sprint_id;

  if not found then
    raise exception 'complete_sprint: sprint update affected no row'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.complete_sprint(uuid, uuid) is
  'Moves an active sprint to completed. Every one of its items NOT sitting '
  'in a done-category column is rehomed to p_move_to_sprint_id, or to the '
  'backlog when that argument is null; finished items keep their sprint_id '
  'unchanged, as a record of what shipped in it.';

grant execute on function public.complete_sprint(uuid, uuid) to authenticated;


-- 7. What is deliberately NOT changed --------------------------------------------------
--
--   · todos_column_id_fkey and the composite (column_id, board_id) FK from
--     M3-18. Both already tolerate a null column_id by ordinary FK semantics
--     (MATCH SIMPLE) — nothing to alter.
--   · TODO_FIELDS / TODO_LIST_FIELDS. Widening those to read sprint_id and
--     backlog_rank is a client-side edit (types/data.ts, todoApi.ts), not a
--     schema concern.
--   · useTodosByColumns, orderByBoard. Both already treat a null column_id
--     as "not in this column" / "sorts last" — read, not written, by this
--     migration.


-- 8. Rollback -------------------------------------------------------------------------
--
-- Forward-fix, per Rule 4. Reversing means a new migration that, in order:
--
--   1. drops the two functions and their grants:
--        drop function if exists public.complete_sprint(uuid, uuid);
--        drop function if exists public.start_sprint(uuid);
--
--   2. restores enforce_work_item_hierarchy() to its pre-M30 body
--      (20260829090000_todo_epic_hierarchy.sql) and narrows the trigger back
--      to `before insert or update of parent_id, type`;
--
--   3. drops todos.sprint_id and todos.backlog_rank and their indexes;
--
--   4. drops the sprints table (cascades its own policies, trigger, indexes).
--
-- Step 3 is lossy — it discards which sprint each item was planned into and
-- its backlog order. Reverse only while sprints are still unused.
--
--
-- VERIFICATION (run after `npm run db:push`)
--
--   1. Create a sprint: insert into sprints(board_id, name) values (...).
--      Expect: state defaults to 'future', rank defaults to 1024.
--
--   2. Plan a top-level Task into it: update todos set sprint_id = '<sprint>'
--      where id = '<task>'. Expect: succeeds regardless of column_id.
--
--   3. Plan an Epic into a DIFFERENT sprint from one of its own Tasks.
--      Expect: succeeds — Epic ──→ Sprint and Task ──→ Sprint are
--      independent.
--
--   4. Try to set sprint_id on a genuine Subtask:
--        update todos set sprint_id = '<sprint>' where id = '<subtask>';
--      Expect: 'A subtask cannot belong to a sprint on its own...' (23514).
--
--   5. Move a Task to the backlog: update todos set column_id = null where
--      id = '<task>'. Expect: succeeds, no error — the column already
--      tolerated null.
--
--   6. select start_sprint('<the future sprint from step 1>').
--      Expect: every todo with that sprint_id and a null column_id now has
--      the board's first todo-category column; sprints.state = 'active'.
--
--   7. Try starting a second sprint on the same board while the first is
--      still active. Expect: 'sprints_one_active_per_board' unique
--      violation (23505) from the UPDATE inside start_sprint.
--
--   8. select complete_sprint('<the active sprint>', null).
--      Expect: every one of its items not in a done-category column now has
--      sprint_id = null; a finished item keeps its old sprint_id; state =
--      'completed'.
--
-- AFTER APPLYING: run `npm run db:types`. `sprints` becomes a new table in
-- the generated types; `todos.sprint_id` and `todos.backlog_rank` become new
-- nullable columns on the existing one.
