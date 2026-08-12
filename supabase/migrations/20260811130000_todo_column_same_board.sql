-- M3-18 · A work item's column must belong to its board. MEDIUM RISK. Tier A.
--
-- todos.board_id and todos.column_id are independent foreign keys. Nothing
-- requires the column to belong to the same board as the work item.
--
-- The reachable attack, by any editor, through the API and nothing else:
--
--   PATCH /rest/v1/todos?id=eq.<a todo on board A>
--   { "column_id": "<a column on board B>" }
--
-- USING evaluates board_role(board_id) on A — the caller is an editor there, so
-- it passes. WITH CHECK evaluates board_role(board_id) on A — board_id is
-- unchanged, so it passes too. Neither clause ever looks at the column. The
-- result is a row that belongs to board A and points into board B: it renders
-- in no column on A (useTodosByColumns groups by column_id and finds no match)
-- and is invisible on B (every board query filters board_id). It still exists,
-- still holds a position, and no interface can reach it.
--
-- Fixed with a composite foreign key: one constraint, enforced for every
-- writer, with no function to maintain and nothing to keep in step.


-- 0. Preflight -----------------------------------------------------------------
--
-- The constraint cannot be added while a violating row exists, and the failure
-- would otherwise be a bare "violates foreign key constraint" with no row
-- count and no way to tell a schema problem from a data problem.
--
-- If this raises, do NOT weaken the constraint. Those rows are the bug this
-- migration exists to prevent, they are already invisible in the UI, and
-- deciding where each one belongs is a judgement call — it gets its own fix-up
-- migration first.

do $$
declare
  v_bad bigint;
begin
  select count(*)
    into v_bad
    from public.todos t
    join public.columns c on c.id = t.column_id
   where c.board_id is distinct from t.board_id;

  if v_bad > 0 then
    raise exception
      'M3-18 preflight: % work items point at a column on a different board. '
      'These are invisible in every interface. Place them in their own fix-up '
      'migration before adding this constraint.',
      v_bad;
  end if;
end $$;


-- 1. The referenced key ----------------------------------------------------------
--
-- A foreign key must reference a unique constraint, so columns needs one on
-- (id, board_id). It adds no uniqueness — id is already the primary key, so
-- (id, board_id) is unique for free — and that is exactly why it is safe. Its
-- job is to give the composite FK below something to point at.
--
-- The cost is one redundant index. It is the standard idiom for this problem
-- and it is cheaper than a trigger, which would have to fire on both tables and
-- be maintained by hand.

alter table public.columns
  drop constraint if exists columns_id_board_id_key;

alter table public.columns
  add constraint columns_id_board_id_key unique (id, board_id);


-- 2. The composite foreign key ----------------------------------------------------
--
-- Replaces the single-column todos_column_id_fkey rather than joining it. The
-- composite subsumes it — a matching (id, board_id) implies a matching id — so
-- keeping both would be redundant, and worse: PostgREST resolves embedding by
-- foreign key, and two FKs between the same pair of tables makes every
-- `columns?select=*,todos(*)` an ambiguous-embedding error. One FK, not two.
--
-- ON DELETE RESTRICT is carried over verbatim from M2-07, where the choice was
-- made and argued: DATABASE.md says deleting a column must not delete its work
-- items, they are rehomed first. The happy path never fires this; its value is
-- a future code path that forgets to rehome failing loudly instead of silently
-- emptying a board.
--
-- MATCH SIMPLE (the default) means the constraint is satisfied whenever ANY
-- referencing column is NULL. todos.column_id is nullable and board_id is NOT
-- NULL (M2-07), so a work item with no column is still permitted, exactly as
-- before. Nothing here narrows the nullability contract.
--
-- No new index is needed on the referencing side: todos_column_id_position_idx
-- from M2-05 leads with column_id, which is what the RESTRICT check probes.

alter table public.todos
  drop constraint if exists todos_column_id_fkey;

alter table public.todos
  add constraint todos_column_id_fkey
  foreign key (column_id, board_id)
  references public.columns (id, board_id)
  on delete restrict;


-- 3. Why the constraint name is reused ---------------------------------------------
--
-- `todos_column_id_fkey` is kept even though the key is now composite, because
-- the name is not private to the database. `npm run db:types` writes it into
-- src/types/database.ts as a `foreignKeyName` in the Relationships block, and
-- PostgREST accepts it as an explicit embedding hint. Renaming it to something
-- more accurate would be a generated-types diff and a potential runtime break
-- in exchange for a tidier label. Not worth it.


-- 4. What this does NOT change ------------------------------------------------------
--
-- RLS — untouched. M3-05's policies still decide who may write; this decides
-- what a written row may say. A constraint is not an authorization rule, and
-- this one denies the editor on board A exactly the same operation whether they
-- are an editor, an admin or the owner.
--
-- The board-delete cascade — unchanged in shape. boards cascades to both columns
-- and todos while todos also references columns under RESTRICT, which is the
-- interaction M2-07 flagged as unverified. This migration adds board_id to that
-- FK but does not change when its trigger fires, so it neither fixes nor
-- worsens it. Section 6 tests the board delete explicitly for that reason.
--
-- deleteColumn's rehoming upsert — unaffected. It reads board_id off each row it
-- is moving and writes the destination column_id; both belong to the same board,
-- so the composite matches. The M3-11 RPC that replaces it derives board_id
-- server-side and is likewise unaffected.


-- Rollback ------------------------------------------------------------------------
--
-- Forward-fix in a NEW migration, restoring M2-07's single-column FK verbatim:
--
--   alter table public.todos drop constraint if exists todos_column_id_fkey;
--   alter table public.todos
--     add constraint todos_column_id_fkey
--     foreign key (column_id) references public.columns(id) on delete restrict;
--   alter table public.columns drop constraint if exists columns_id_board_id_key;
--
-- Drop order matters: the unique constraint cannot go while the FK depends on
-- it. Reversal reopens the cross-board write, so it is a step backwards rather
-- than a neutral one.


-- Verification ----------------------------------------------------------------------
--
-- scripts/verify-m3-16-role-matrix.sql §7 covers this. In summary:
--
--   preflight count                                  → 0
--   move a card between columns on the same board    → succeeds
--   set column_id to a column on another board       → raises 23503
--   set board_id so it diverges from its column      → raises 23503
--   insert a card with a foreign column_id           → raises 23503
--   set column_id to null                            → succeeds (MATCH SIMPLE)
--   rehome-then-delete a column with cards           → succeeds
--   delete a board holding columns and cards         → succeeds, cascades
