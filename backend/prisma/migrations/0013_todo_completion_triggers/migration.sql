-- 0013 — the triggers that maintain todos.completed_at, and the backfill of
-- what already finished.
--
-- Completion has TWO doors, and the second is the one that is easy to miss
-- (M34 D-5).
--
--   1. A card moves into or out of a done-category column. Ordinary, and a
--      trigger on todos sees it.
--
--   2. A COLUMN's category is flipped. columns.schema.ts accepts `category`
--      on update, so any editor can turn an in_progress column into a done
--      one -- which completes every card in it at once, without a single row
--      of todos being written. A trigger on todos never fires. This needs its
--      own trigger on columns.
--
-- Column DELETION needs nothing extra: deleteColumn rehomes the column's
-- todos server-side first, so it arrives here as ordinary todos updates.
--
-- BEFORE on todos, AFTER on columns, and the asymmetry is deliberate.
-- todos_set_updated_at is already a BEFORE UPDATE trigger on every column of
-- todos. An AFTER trigger here would have to issue a second `update todos` to
-- write the stamp, re-entering all five todos triggers and stamping
-- updated_at twice for one logical change. A BEFORE trigger assigns
-- new.completed_at in place: one write, no re-entry. The columns trigger has
-- no such option -- it necessarily writes rows other than its own -- so it is
-- AFTER, and its price is that a category flip bumps updated_at on every card
-- in the column. That is recorded rather than hidden: flipping a column's
-- category really does change every one of those cards.
--
-- INSERT is covered as well as UPDATE, which D-5 did not say and the
-- invariant requires: a card created directly into a done column would
-- otherwise sit there done with no completed_at, and Phase C's acceptance is
-- that completed_at agrees with the column's category for EVERY row.
--
-- done -> done does nothing. A reshuffle inside the done column must not
-- re-date the work and inflate today's figure.
--
-- The rows the columns trigger writes re-enter the todos trigger, and that is
-- safe: by the time an AFTER UPDATE on columns runs, the column's new
-- category is already visible, so the todos trigger reads the same value for
-- old.column_id and new.column_id, finds no crossing, and leaves the explicit
-- SET alone.
--
-- THE BACKFILL IS AN APPROXIMATION, AND EVERY NUMBER DATED BEFORE THIS
-- MIGRATION IS BEST-AVAILABLE RATHER THAN OBSERVED. Cards already sitting in
-- a done column get completed_at = coalesce(updated_at, created_at), which is
-- the date of their last edit of any kind, not the date they were finished. A
-- card completed in March and retitled in August backfills as August.
-- updated_at is coalesced because it is nullable. The dashboard labels this
-- date so an operator reading a long period knows which part of the line is
-- observed.
--
-- The backfill runs with todos' triggers disabled, and must. set_updated_at
-- is BEFORE UPDATE and would overwrite new.updated_at with now() on every row
-- it touches -- destroying the very column the backfill is reading, and
-- redating every historical card to the migration.
--
-- Forward-only. Reversing means a new migration dropping the triggers.

-- 1. Backfill first, before the triggers exist, with the existing ones off.

alter table todos disable trigger user;

update todos t
   set completed_at = coalesce(t.updated_at, t.created_at),
       completed_by = t.assignee_id
  from columns c
 where c.id = t.column_id
   and c.category = 'done'
   and t.completed_at is null;

alter table todos enable trigger user;

-- 2. The todos-side trigger: a card crossing the done boundary.

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
    select c.category = 'done'
      into v_was_done
      from public.columns c
     where c.id = old.column_id;
  end if;

  select c.category = 'done'
    into v_is_done
    from public.columns c
   where c.id = new.column_id;

  -- No column, or a column with no category, is not done. A card in the
  -- backlog has no column_id at all.
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
  'Stamps todos.completed_at when a card enters a done-category column and clears it when it leaves. done -> done is left alone, so reordering inside the done column does not re-date the work.';

create trigger todos_stamp_completion
  before insert or update of column_id on public.todos
  for each row execute function public.stamp_todo_completion();

-- 3. The columns-side trigger: the whole column crossing the done boundary.

create or replace function public.stamp_column_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.category, 'todo') is not distinct from coalesce(old.category, 'todo') then
    return null;
  end if;

  if new.category = 'done' then
    update public.todos
       set completed_at = now(),
           completed_by = assignee_id
     where column_id = new.id
       and completed_at is null;

  elsif old.category = 'done' then
    update public.todos
       set completed_at = null,
           completed_by = null
     where column_id = new.id
       and completed_at is not null;
  end if;

  return null;
end;
$$;

comment on function public.stamp_column_completion() is
  'The second door: columns.category is PATCH-able, so flipping a column to done completes every card in it without any todos row being written.';

create trigger columns_stamp_completion
  after update of category on public.columns
  for each row execute function public.stamp_column_completion();
