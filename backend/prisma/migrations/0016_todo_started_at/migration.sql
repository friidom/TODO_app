-- 0016 — todos.started_at, the timestamp that makes cycle time knowable.
--
-- M35 D-18. This is M34 D-4's finding one status earlier, and it has the same
-- shape: the board derives "is this in progress" from columns.category and
-- keeps no record of WHEN it became true, so cycle time, WIP aging and a
-- cumulative flow diagram with real bands are all unanswerable.
--
-- IT CANNOT BE RECOVERED FROM activities, for the reason 0012 already set out
-- at length: log_todo_activity's 'moved' branch writes the column TITLES into
-- the payload, not ids and not categories, and a title is user-editable free
-- text. M35's audit found two further holes 0012 did not need: the 'created'
-- branch records no column at all, so a card's FIRST status is unknowable
-- from history; and log_column_activity is silent on category changes, so a
-- whole column crossing the boundary leaves no trail whatsoever.
--
-- THIS IS NOT todos.start_date. That column already exists, is user-set, is
-- freely editable and is bound to due_date by todos_date_range_check. It is a
-- plan. started_at is an observation, and the two must never be read as one.
--
-- NOTHING IS BACKFILLED, and that is the decision rather than an omission.
-- 0013 backfilled completed_at from coalesce(updated_at, created_at) and
-- src/services/admin/backfill.ts exists solely to apologise for it in the UI.
-- updated_at is the date of the last edit of ANY kind; it is not a start
-- date, and there is no worse approximation available. So started_at is null
-- for every row that exists today, flow history begins here, and every
-- duration the dashboard prints carries its measured `n` and its `unmeasured`
-- count beside it -- the discipline `unestimated` already has beside every
-- points figure (M34 D-7).
--
-- The consequence the charts must handle, stated here because it is not
-- obvious: for the pre-migration population `completed_at is not null and
-- started_at is null` is the NORMAL state. A cumulative flow diagram built
-- naively from these three timestamps therefore produces done > started and
-- an inverted band. src/services/admin/flow.ts clamps it upward and says why.
--
-- Forward-only. Reversing means a new migration.

alter table todos
  add column started_at timestamptz;

comment on column todos.started_at is
  'When work observably began: the instant the card first entered a column whose category is not todo. Maintained by trigger, never by the API. Not todos.start_date, which is a user-set plan.';

-- Partial, and on exactly the population the WIP-aging query reads: cards in
-- flight, which is started and not yet finished. The full-column index would
-- be mostly the pre-migration nulls this migration deliberately creates.
create index todos_started_idx
  on todos (started_at)
  where started_at is not null and completed_at is null;
