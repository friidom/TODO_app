-- 0012 — todos.completed_at / completed_by: when work finished, and whose it
-- was. The columns only; 0013 adds the triggers that maintain them.
--
-- M2 removed todos.completed and made doneness derived: a card is done when
-- the column it sits in has category 'done'. That is still the right model --
-- there is one source of truth for "is this done" and it is the board itself.
-- What it does not record is WHEN, and every number M34 reports is a count
-- per unit of time.
--
-- It cannot be recovered from activities (M34 D-4). log_todo_activity's
-- 'moved' branch writes the column TITLES into the payload, not ids and not
-- categories:
--
--   'from', (select c.title from public.columns c where c.id = old.column_id)
--
-- Titles are user-editable free text and are never translated. A column called
-- "Done" may be in_progress; a done column may be called "Shipped" or
-- "Готово"; and renaming one does not rewrite the history that already used
-- the old name. So a title is not a category and never was.
--
-- completed_by is stamped at completion rather than read live from
-- assignee_id (D-6). Reading it live would mean reassigning a finished card
-- silently moved last week's points from one person's record to another's --
-- a history that changes when someone tidies a board is not a history. If the
-- work is unassigned when it completes, completed_by stays null: it counts
-- toward the board and system totals and toward nobody's KPI.
--
-- on delete set null, not cascade: deleting a person should not delete the
-- record that the work finished.
--
-- The covering (completed_by, completed_at) index belongs to Phase E, with
-- the other four, so that its EXPLAIN has an honest before.
--
-- The index here is partial because the overwhelming majority of rows on a healthy
-- board are not done, and every query that reads this column is asking for the
-- ones that are.
--
-- Forward-only. Reversing means a new migration dropping both columns.

alter table todos
  add column completed_at timestamptz,
  add column completed_by uuid references profiles (id) on delete set null;

create index todos_completed_idx
  on todos (completed_at desc)
  where completed_at is not null;

comment on column todos.completed_at is
  'When this card entered a done-category column. Maintained by triggers on todos and on columns (0013) -- never written by the API.';

comment on column todos.completed_by is
  'Who the card was assigned to at the moment it completed. Stamped once, so reassigning finished work does not move historical credit.';
