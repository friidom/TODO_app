-- 0017 — the triggers that maintain todos.started_at.
--
-- Deliberately the same two doors as 0013, because it is the same boundary
-- one category earlier, and the asymmetry between them has the same cause:
--
--   BEFORE on todos, because todos_set_updated_at is already BEFORE UPDATE on
--   every column; an AFTER trigger would need a second `update todos` and
--   would stamp updated_at twice for one logical change. A BEFORE trigger
--   assigns new.started_at in place.
--
--   AFTER on columns, because that one necessarily writes rows other than its
--   own. columns.category is PATCH-able (columns.schema.ts accepts it on
--   update), so flipping a column from todo to in_progress starts every card
--   in it without a single row of todos being written, and a trigger on todos
--   never fires. M34 found this door the hard way; it is not rediscovered
--   here, it is applied.
--
-- WHAT COUNTS AS STARTED: any column whose category is not 'todo'. Three
-- values exist, so "started" is in_progress or done. A null category counts
-- as todo -- the same fallback categoryOf() makes on the client -- and a card
-- with no column at all is in the backlog and has not started.
--
-- STAMPED ON FIRST ENTRY, CLEARED ONLY ON RETURN TO todo. A reshuffle inside
-- In Progress, and a move from In Progress to In Review, leave the clock
-- alone: the question is when work began, not when it last moved. Moving a
-- card back to To Do clears it, which is both the undo for an accidental drag
-- and the honest reading -- work that went back to the queue has not started.
-- That also keeps started_at and completed_at consistent, since 0013 clears
-- completed_at on exactly the same move.
--
-- Backlog -> Done in one drag sets both stamps to the same now(), so cycle
-- time is zero. That is the truthful answer: the board never saw the work in
-- progress, and a null would claim we do not know when there is nothing to
-- know.
--
-- INSERT is covered as well as UPDATE, matching todos_stamp_completion: a
-- card created directly into In Progress has started, and the invariant this
-- migration is accepted against is that started_at agrees with the column's
-- category for EVERY row.
--
-- ORDER AGAINST 0013's TRIGGERS DOES NOT MATTER. PostgreSQL fires same-timing
-- triggers in name order, so columns_stamp_completion runs before
-- columns_stamp_start; the two touch different columns on disjoint
-- predicates, and neither reads what the other writes.
--
-- NO ACTIVITY ROWS ARE PRODUCED. log_todo_activity emits only for the fields
-- it explicitly compares and started_at is not one of them, so this adds
-- nothing to the feed -- the same finding 0012 recorded for completed_at.
--
-- There is NO BACKFILL here, deliberately. See 0016.
--
-- Forward-only. Reversing means a new migration dropping the triggers.

-- 1. The todos-side trigger: a card crossing the started boundary.

create or replace function public.stamp_todo_start()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_started boolean := false;
begin
  select coalesce(c.category, 'todo') <> 'todo'
    into v_is_started
    from public.columns c
   where c.id = new.column_id;

  -- No column, or a column with no category, has not started. A card in the
  -- backlog has no column_id at all.
  v_is_started := coalesce(v_is_started, false);

  if v_is_started then
    -- Only when null, so a move between two non-todo columns -- In Progress
    -- to In Review, or a reorder inside one -- does not restart the clock.
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
  'Stamps todos.started_at the first time a card enters a column whose category is not todo, and clears it when the card returns to one that is. Movement between two started columns leaves it alone.';

create trigger todos_stamp_start
  before insert or update of column_id on public.todos
  for each row execute function public.stamp_todo_start();

-- 2. The columns-side trigger: the whole column crossing the started boundary.

create or replace function public.stamp_column_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.category, 'todo') is not distinct from coalesce(old.category, 'todo') then
    return null;
  end if;

  -- in_progress -> done is not a crossing: both sides are started, and the
  -- guard above has already let it through as a category change. Testing the
  -- new side first and the old side only in the else branch is what keeps it
  -- a no-op for started_at while 0013's sibling stamps completed_at.
  if coalesce(new.category, 'todo') <> 'todo' then
    update public.todos
       set started_at = now()
     where column_id = new.id
       and started_at is null;

  elsif coalesce(old.category, 'todo') <> 'todo' then
    update public.todos
       set started_at = null
     where column_id = new.id
       and started_at is not null;
  end if;

  return null;
end;
$$;

comment on function public.stamp_column_start() is
  'The second door: flipping a column out of the todo category starts every card in it without any todos row being written.';

create trigger columns_stamp_start
  after update of category on public.columns
  for each row execute function public.stamp_column_start();
