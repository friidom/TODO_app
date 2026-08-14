-- M6-06 · Rebalance ranks on precision exhaustion. MEDIUM RISK. Tier A.
--
-- A fractional rank is a midpoint between two neighbours. Repeatedly dropping a
-- card into the *same* gap halves the interval each time, and a
-- `double precision` mantissa runs out after roughly 50 of them: the midpoint
-- comes back equal to one of the neighbours, and the next write would put two
-- cards at the same rank — an undefined order, which is the defect M6-A exists
-- to remove.
--
-- The client detects this **before writing** (`rankBetween` returns null when
-- the midpoint is not strictly between the neighbours), calls one of these, and
-- retries the move. So exhaustion costs a round trip and is invisible, rather
-- than corrupting an order and being discovered later.
--
--
-- THIS IS ALSO WHERE M3-10 LANDS.
--
-- M3-10 (`reorder_todos` RPC) was deferred to this milestone with the trigger:
-- *"M6-04 ships and a bulk renumber path still exists (rebalancing, or an
-- import). If it is built at any point, it must take the board id and derive
-- everything else server-side."*
--
-- M6-04 removes the per-drag bulk upsert — a move is one row now — so the only
-- bulk renumber left is this rebalance, and it is built with exactly the
-- property M3-10 asked for: **it takes an id and derives every new value
-- server-side.** No client-supplied array of row ids and positions reaches the
-- database through it, which was the whole of M3-10's security concern.
-- M3-10 is therefore closed as unnecessary rather than carried forward.
--
--
-- SECURITY INVOKER, like `delete_column` (M3-11): the caller's own RLS applies,
-- so M3-05's editor-and-above write gate is inherited rather than re-derived.
-- The explicit `board_role` check on top of it is not redundant — an RLS denial
-- on UPDATE is *zero rows, silently*, and a rebalance that changed nothing is
-- indistinguishable from a rebalance that was refused. Raising 42501 is what
-- turns that into an error the client can act on.


-- 1. Todos within a column ----------------------------------------------------------

create or replace function public.rebalance_column_ranks(p_column_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_board_id uuid;
  v_count    integer;
begin
  -- Under RLS this returns nothing for a column on a board the caller cannot
  -- read, so "not found" and "not yours" are one answer — deliberately, for the
  -- same reason M2-10 answers 404 rather than 403: a stranger's id must not be
  -- confirmable by probing.
  select board_id into v_board_id
    from public.columns
   where id = p_column_id;

  if v_board_id is null then
    raise exception 'Column not found' using errcode = 'P0002';
  end if;

  if public.board_role(v_board_id) not in ('owner', 'admin', 'editor') then
    raise exception 'Reordering requires editor access'
      using errcode = '42501';
  end if;

  -- Order preserved exactly: the new ranks are assigned in the sequence the
  -- current ranks already put the rows in. `position` and then (created_at, id)
  -- break ties, which is the same deterministic refinement M6-02 used — a tie
  -- is what a rebalance is called to fix, so it must not be left to chance.
  with ordered as (
    select
      id,
      row_number() over (
        order by rank nulls last, position nulls last, created_at, id
      ) * 1024::double precision as new_rank
    from public.todos
    where column_id = p_column_id
  )
  update public.todos t
     set rank = ordered.new_rank
    from ordered
   where ordered.id = t.id
     and t.rank is distinct from ordered.new_rank;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

comment on function public.rebalance_column_ranks(uuid) is
  'Respace one column''s todo ranks to whole multiples of 1024, preserving '
  'order. Called when the client cannot find a midpoint (M6-06). Absorbs M3-10: '
  'takes an id, derives every value server-side.';

revoke all on function public.rebalance_column_ranks(uuid) from public;
revoke all on function public.rebalance_column_ranks(uuid) from anon;
grant execute on function public.rebalance_column_ranks(uuid) to authenticated;


-- 2. Columns within a board -----------------------------------------------------------
--
-- Far less likely to be needed — a board has a handful of columns and they are
-- reordered rarely — but the client's column drag uses the same midpoint
-- arithmetic, so it has the same exhaustion path and would otherwise have no
-- recovery from it. A code path that can fail with no way back is worse than
-- fifteen lines.

create or replace function public.rebalance_board_column_ranks(p_board_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if public.board_role(p_board_id) not in ('owner', 'admin', 'editor') then
    raise exception 'Reordering requires editor access'
      using errcode = '42501';
  end if;

  with ordered as (
    select
      id,
      row_number() over (
        order by rank nulls last, position nulls last, created_at, id
      ) * 1024::double precision as new_rank
    from public.columns
    where board_id = p_board_id
  )
  update public.columns c
     set rank = ordered.new_rank
    from ordered
   where ordered.id = c.id
     and c.rank is distinct from ordered.new_rank;

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

comment on function public.rebalance_board_column_ranks(uuid) is
  'Respace one board''s column ranks, preserving order (M6-06).';

revoke all on function public.rebalance_board_column_ranks(uuid) from public;
revoke all on function public.rebalance_board_column_ranks(uuid) from anon;
grant execute on function public.rebalance_board_column_ranks(uuid) to authenticated;


-- 3. Rollback -------------------------------------------------------------------------
--
--   drop function if exists public.rebalance_column_ranks(uuid);
--   drop function if exists public.rebalance_board_column_ranks(uuid);
--
-- Neither holds state. Dropping them removes the recovery path from exhaustion,
-- not any data — but the client calls them, so drop the client first.


-- 4. Verification ------------------------------------------------------------------------
--
-- The arithmetic half is a Vitest test (`src/utils/rank.test.ts`), which is what
-- M6-06 asks for: exhaustion is the failure nobody reproduces by hand.
--
-- The database half needs two accounts and is not run from here — the CLI has no
-- arbitrary-SQL path, the same limitation M3-16 records:
--
--   * as a viewer, rebalance_column_ranks(<any column>)      → 42501
--   * as an editor, on a column of their board               → returns >= 0
--   * as any role, on a column of a board they are not on    → P0002
--   * after a rebalance, the column's card order is unchanged
