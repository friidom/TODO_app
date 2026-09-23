-- 0019 — columns.category gains 'in_review', making In Review a real stage.
--
-- THE BUG THIS FIXES. A card's status is not a field: it is the category of the
-- column the card sits in. The seeded board ships FOUR columns but 0004 allowed
-- only THREE categories, so "In Review" was filed as in_progress — a second
-- in-progress column, not a stage. lib/workflow.ts allows a move of one step,
-- so both of these read as legal and neither should be:
--
--   To Do -> In Review   = todo -> in_progress = 1 step
--   In Progress -> Done  = in_progress -> done = 1 step
--
-- Neither is fixable above this line, and "In Progress -> Done is forbidden" is
-- not expressible at all while there are three values. Hence a fourth.
--
-- WHY NOT A statuses TABLE. docs/IMPLEMENTATION_PLAN.md already decided this:
-- "Is a column a status? Today they are the same row... One table is right
-- until a board genuinely needs the split." A fourth category keeps one table.
--
-- NO TRIGGER CHANGES ARE NEEDED, and that is checked rather than assumed:
-- 0013 stamps completed_at on `category = 'done'`, and 0017 stamps started_at
-- on `coalesce(category,'todo') <> 'todo'`. A card in review is therefore
-- started and not done, which is exactly right, with no edit to either.
--
-- THE BACKFILL IS DELIBERATELY NARROW. It matches only the title this
-- application itself seeds (config/constants.ts DEFAULT_COLUMNS, seed-demo.ts,
-- verifyAuth.ts). Titles are user-editable free text and are never translated,
-- so a wider match would be guessing: 0012's header makes the same point in the
-- other direction -- a column called "Done" may be in_progress. A column the
-- user renamed keeps its category and can be re-categorised from the column
-- menu, which is a PATCH that already exists.

alter table columns drop constraint columns_category_check;

alter table columns add constraint columns_category_check
  check (category in ('todo', 'in_progress', 'in_review', 'done'));

update columns
   set category = 'in_review'
 where category = 'in_progress'
   and lower(btrim(title)) in ('in review', 'in-review');
