-- M2-21 · Per-board human-readable task key. MEDIUM RISK.
--
-- The card label was `KAN-{todos.id}`. That id is a uuid as of M2-14, which is
-- unreadable, and when it was an integer it was globally sequential and leaked
-- the total row count. A per-board counter fixes both: the first card on any
-- board is KAN-1.
--
-- Allocated by a BEFORE INSERT trigger, not by an insert RPC. The plan suggests
-- the RPC, but there is no todo-insert RPC to extend — `addTodo` is a direct
-- PostgREST insert — so an RPC would mean rewriting the whole create path.
-- A trigger fires for every writer (the client today, an RPC or a restore
-- later) and is where the counter's row lock belongs anyway.
--
-- Keys are never reused. Deleting KAN-2 and creating another card gives KAN-4,
-- not KAN-2: the counter only moves forward, which is what makes a key a stable
-- reference to one piece of work.


-- 1. The counter and the key --------------------------------------------------
--
-- next_key on boards rather than a sequence per board. A sequence would be a
-- schema object created and dropped per row of another table, and it would not
-- roll back with the transaction that allocated from it.

alter table public.boards add column next_key integer not null default 1;
alter table public.todos  add column board_key integer;


-- 2. Backfill existing cards ---------------------------------------------------
--
-- Ordered by created_at so the numbering matches the order the work was
-- actually made in; id breaks ties, since created_at has a default of now()
-- and rows written in one statement share it.

with numbered as (
  select
    id,
    row_number() over (
      partition by board_id
      order by created_at, id
    ) as key
  from public.todos
)
update public.todos t
set board_key = n.key
from numbered n
where t.id = n.id;

-- Each board resumes past its highest existing key. Boards with no cards keep
-- the default of 1.
update public.boards b
set next_key = coalesce(
  (select max(t.board_key) + 1 from public.todos t where t.board_id = b.id),
  1
);


-- 3. The invariant -------------------------------------------------------------
--
-- What makes the label meaningful: within one board, a key names one card.
-- Nulls are permitted and do not collide — a row whose board_id matched no
-- board would keep a null key rather than fail the insert.

create unique index todos_board_key_unique
  on public.todos (board_id, board_key);


-- 4. Allocation ----------------------------------------------------------------

create or replace function public.assign_todo_board_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Supplied explicitly — a restore, or a future RPC that allocates its own.
  if new.board_key is not null then
    return new;
  end if;

  -- An upsert that is really an update. PostgREST turns upsert into
  -- INSERT ... ON CONFLICT DO UPDATE, and a BEFORE INSERT trigger fires before
  -- the conflict is detected — so without this, reorderTodos (which upserts a
  -- whole column on every drag) would burn a key per card per drag. The
  -- conflicting row keeps the key it already has.
  if exists (select 1 from public.todos t where t.id = new.id) then
    return new;
  end if;

  -- The UPDATE takes a row lock on the board, so concurrent creates serialise
  -- and cannot be handed the same key. RETURNING gives the post-increment
  -- value; the key allocated is the one before it.
  update public.boards
  set next_key = next_key + 1
  where id = new.board_id
  returning next_key - 1 into new.board_key;

  return new;
end;
$$;

-- SECURITY DEFINER because the counter lives on `boards`, and from M3 an
-- editor who is not the board's owner will be able to create a card without
-- being able to update the board row.

comment on function public.assign_todo_board_key() is
  'Allocates todos.board_key from boards.next_key. Forward-only: keys are '
  'never reused, so a deleted card does not free its number.';

create trigger todos_assign_board_key
  before insert on public.todos
  for each row
  execute function public.assign_todo_board_key();


-- Rollback ---------------------------------------------------------------------
--
--   drop trigger if exists todos_assign_board_key on public.todos;
--   drop function if exists public.assign_todo_board_key();
--   drop index if exists public.todos_board_key_unique;
--   alter table public.todos  drop column board_key;
--   alter table public.boards drop column next_key;
--
-- Clean: nothing else reads either column, and the label falls back to whatever
-- the frontend of the day renders.


-- Verification ------------------------------------------------------------------
--
--   -- every existing card numbered, densely, per board
--   select board_id, count(*), min(board_key), max(board_key)
--   from public.todos group by board_id;
--   -- expect: min 1 and max = count on each board
--
-- Then in the browser, per the plan's test: three new cards on board A get 1,
-- 2, 3 (continuing past the backfill); the first card on a second board gets 1;
-- deleting a card and creating another does not reissue its number.
