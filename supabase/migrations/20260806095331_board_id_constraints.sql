-- M2-07 · Contract: board_id NOT NULL + foreign keys. HIGH RISK. BREAKING.
--
-- ============================================================================
-- DO NOT APPLY THIS YET.
-- ============================================================================
--
-- Two preconditions, and neither is met at the time this file was written.
--
--   1. M2-06 must be applied AND verified. This migration's NOT NULL is the
--      backstop the plan describes: it fails loudly if any row was missed. The
--      preflight block below turns that into a legible error instead of a bare
--      "column contains null values".
--
--   2. The application must already send board_id on insert — M2-11. It does
--      not. `grep -rn board_id src/` returns nothing at the time of writing.
--      The moment board_id is NOT NULL, every insert that omits it fails:
--
--        addTodo        -> creating a card fails
--        createColumn   -> creating a column fails
--        signUp         -> seeds four default columns, so REGISTRATION FAILS
--                          and the new account is left half-created
--
--      That third one is why this is not a "the board looks broken" bug. A
--      user who signs up during the window between this migration and M2-11
--      gets an auth record and a profile with no columns, and no code path
--      repairs it.
--
-- The Migration Strategy says the same thing in general terms: "Deploy the
-- application code that reads the new shape BETWEEN Backfill and Contract."
-- This is the contract. M2-11 is the code. M2-11 ships first, or they ship
-- together.
--
--
-- BACKUP
--
--   supabase db dump --db-url "$PROD_URL" \
--     -f backups/pre-m2-07-$(date +%Y%m%d-%H%M).sql
--
--   This task only adds constraints, so there is no data-loss path — but a
--   failed ALTER on a live table can hold an ACCESS EXCLUSIVE lock, and the
--   dump is what makes that recoverable rather than merely inconvenient.
--
--
-- ROLLBACK
--
--   Forward-fix dropping what this adds. No data is at risk:
--
--     alter table public.columns alter column board_id drop not null;
--     alter table public.todos   alter column board_id drop not null;
--     alter table public.columns drop constraint if exists columns_board_id_fkey;
--     alter table public.todos   drop constraint if exists todos_board_id_fkey;
--
--     -- restore the baseline's implicit NO ACTION rule
--     alter table public.todos drop constraint if exists todos_column_id_fkey;
--     alter table public.todos
--       add constraint todos_column_id_fkey
--       foreign key (column_id) references public.columns(id);
--
--   Reverting the migration does NOT repair accounts created while it was
--   live and M2-11 was not. Those need finding and fixing by hand.


-- 0. Preflight ---------------------------------------------------------------
--
-- The plan says to "verify count(*) where board_id is null = 0 on production
-- immediately before applying". This does it inside the transaction, so the
-- check cannot drift between running it by hand and running the migration.
--
-- If this raises, do not force it. It means M2-06 left rows behind — almost
-- certainly the orphan rows M2-06 warned about, owned by a user_id with no
-- profile. Decide whether to delete or reassign them, in their own migration,
-- and then come back here.

do $$
declare
  v_columns_null bigint;
  v_todos_null   bigint;
begin
  select count(*) into v_columns_null from public.columns where board_id is null;
  select count(*) into v_todos_null   from public.todos   where board_id is null;

  if v_columns_null > 0 or v_todos_null > 0 then
    raise exception
      'M2-07 preflight: % columns and % todos still have a NULL board_id. '
      'These are the rows M2-06 could not place — they belong to a user_id '
      'with no profile row. Resolve them in their own migration (delete or '
      'reassign) before contracting. Forcing this constraint is not an option: '
      'it cannot succeed while they exist.',
      v_columns_null, v_todos_null;
  end if;
end $$;


-- 1. board_id NOT NULL -------------------------------------------------------
--
-- The contract. From here, ownership is structural rather than conventional:
-- a column or todo cannot exist without belonging to a board.
--
-- SET NOT NULL scans the table to verify. It takes an ACCESS EXCLUSIVE lock
-- for the duration, which on these table sizes is brief.

alter table public.columns alter column board_id set not null;
alter table public.todos   alter column board_id set not null;


-- 2. board_id foreign keys — ON DELETE CASCADE -------------------------------
--
-- DATABASE.md: "Deleting a Board deletes: Members, Columns, Todos, Comments,
-- Attachments, Activities." Cascade is the documented rule, and it is the
-- right one — a column or todo whose board is gone has no route back into any
-- interface and no policy that can reach it.
--
-- Named explicitly so the generated TypeScript relationships stay stable.
-- M2-05 already created the indexes these need; without them each cascade is a
-- sequential scan to find the referencing rows.

alter table public.columns drop constraint if exists columns_board_id_fkey;
alter table public.columns
  add constraint columns_board_id_fkey
  foreign key (board_id) references public.boards(id) on delete cascade;

alter table public.todos drop constraint if exists todos_board_id_fkey;
alter table public.todos
  add constraint todos_board_id_fkey
  foreign key (board_id) references public.boards(id) on delete cascade;


-- 3. todos.column_id — the decision the task asks to be recorded -------------
--
-- CHOSEN: on delete restrict.
--
-- DATABASE.md is unambiguous: "Deleting a Column should NOT delete Todos.
-- Todos should be moved into another Column." The task allows restrict or set
-- null.
--
-- `set null` is rejected. It permits deleting a column and orphaning its
-- todos, and an orphaned todo is worse than a deleted one: useTodosByColumns
-- groups by column_id, so a row with a NULL column_id renders in no column at
-- all. It still exists, still counts, still occupies a position — and is
-- invisible. That is data loss that does not look like data loss.
--
-- `restrict` enforces the documented rule instead of trusting callers to
-- follow it. deleteColumn (columnsApi.ts) already rehomes a column's todos
-- into the destination before deleting it, so in the happy path this
-- constraint never fires. Its value is the unhappy path: a future code path
-- that forgets to rehome fails loudly at the database instead of silently
-- emptying someone's board.
--
-- The baseline declared this FK with no ON DELETE clause at all, which means
-- NO ACTION. Making the rule explicit is most of the point of this statement.
--
--
-- Why not `no action` --------------------------------------------------------
--
-- Worth stating precisely, because the obvious reading of the difference is
-- wrong. Postgres defines restrict as "the same as NO ACTION except that the
-- check is not deferrable". The difference is DEFERRABILITY, not the point at
-- which a non-deferred check runs. Neither constraint here is declared
-- DEFERRABLE, so both fire as AFTER ROW triggers at the same point in the
-- same statement, and they would behave identically.
--
-- So `no action` is not a safer alternative to `restrict` for this table. It
-- is the same behaviour with a weaker name, and it would not change the
-- scenario described below by one instruction.
--
--
-- ⚠ UNVERIFIED — the board-delete path is not proven. Test it.
--
-- boards cascades to BOTH columns and todos, while todos also references
-- columns. Deleting a board fires both cascades, and the constraint below is
-- checked against whatever state exists when its trigger runs. If the columns
-- cascade is processed and its check fires before the todos cascade has
-- removed the referencing rows, the delete fails.
--
-- Whether that happens depends on after-trigger queue ordering across a
-- nested cascade — an implementation detail, not a documented guarantee. It
-- could not be tested here: there is no local Postgres and no Docker on this
-- machine, and settling it requires running the delete end to end against a
-- real database with a board, a column and a todo in it.
--
-- Both of the task's tests have to hold together — "delete a board → its
-- columns and todos cascade" AND "delete a column → todos are not destroyed"
-- — and this is the one interaction that can satisfy either alone but not
-- both.
--
-- If `delete from boards where id = ...` raises a todos_column_id_fkey
-- violation, that is this interaction and not bad data. The fix is NOT to
-- switch to `no action`, for the reason above. It is to make the check
-- deferrable, which moves it to COMMIT — after every cascade has run — by
-- documented semantics rather than by trigger ordering:
--
--   alter table public.todos drop constraint if exists todos_column_id_fkey;
--   alter table public.todos
--     add constraint todos_column_id_fkey
--     foreign key (column_id) references public.columns(id)
--     on delete no action
--     deferrable initially deferred;
--
-- That keeps the documented rule intact — deleting a column out from under
-- its todos still fails — and only changes when the failure is reported. It
-- is deliberately not applied pre-emptively: deferring moves the error from
-- the statement to the commit, which is harder to attribute, and that cost is
-- not worth paying for a problem that may not exist.

alter table public.todos drop constraint if exists todos_column_id_fkey;
alter table public.todos
  add constraint todos_column_id_fkey
  foreign key (column_id) references public.columns(id) on delete restrict;


-- RLS ------------------------------------------------------------------------
--
-- Untouched. The policies still filter on user_id; M2-08 rewrites them in
-- terms of board ownership. Adding a constraint does not change who can see a
-- row.


-- AFTER APPLYING -------------------------------------------------------------
--
-- The task's tests, all three of which need a live database:
--
--   -- insert without board_id is rejected
--   insert into public.todos (title, user_id) values ('x', auth.uid());
--   -- expect: null value in column "board_id" violates not-null constraint
--
--   -- deleting a board takes its columns and todos with it
--   -- (this is the one that exercises the interaction flagged above)
--   delete from public.boards where id = '<scratch board>';
--   select count(*) from public.columns where board_id = '<scratch board>';
--   select count(*) from public.todos   where board_id = '<scratch board>';
--   -- expect: 0 and 0, with no error raised
--
--   -- deleting a column does NOT destroy its todos
--   delete from public.columns where id = '<column holding todos>';
--   -- expect: violates foreign key constraint "todos_column_id_fkey"
--   -- then confirm via the app that deleteColumn still succeeds, because it
--   -- rehomes first
--
-- Run these on a branch database restored from a production dump, not on
-- production. Then watch the browser network tab for 15 minutes after the
-- production apply: a constraint that is too tight surfaces as failed writes,
-- and M1-07's toasts are what make them visible.
