-- M3-11 · Transactional delete_column RPC. MEDIUM RISK. Tier A.
--
-- deleteColumn (columnsApi.ts) is four sequential round-trips: read the todos
-- to move, read the destination's last position, upsert them across, delete the
-- column. A failure between the upsert and the delete leaves an empty column the
-- user has already been told is gone, and nothing repairs it.
--
-- A function body is a single transaction, so the rehome and the delete either
-- both happen or neither does. That is the whole point of this task.
--
-- Unlike M3-10 this does not go away at M6: rehome-then-delete is inherently
-- multi-statement, however positions are represented.


-- 1. SECURITY INVOKER, deliberately -----------------------------------------------
--
-- Every other function M3 has added is SECURITY DEFINER, so the exception needs
-- its reason stated.
--
-- DEFINER exists to escape RLS — to read board_members without recursing, or to
-- expose a narrowed column list. This function wants the opposite. It performs
-- exactly the writes the caller could already perform by hand; it just performs
-- them atomically. Running it as INVOKER means M3-05's policies are evaluated
-- against the caller for the UPDATE and the DELETE, so the editor+ gate is
-- inherited for free and there is no second copy of the authorization rule to
-- drift from the first.
--
-- Permission Model rule 5 requires a DEFINER function to carry its own
-- board_role check. This one is INVOKER precisely so that rule does not apply.
-- If it is ever changed to DEFINER, it takes on that check in the same commit.


-- 2. Why the row counts are checked ------------------------------------------------
--
-- An RLS denial on UPDATE or DELETE is not an error. It is zero rows affected,
-- silently. A viewer calling this would sail through the UPDATE and the DELETE,
-- change nothing, and be told it worked — the exact failure mode this task
-- exists to remove, reintroduced one layer up.
--
-- So the DELETE's row count is asserted, and a zero raises 42501. That is the
-- authorization check: not "what role is the caller" but "did the write the
-- caller asked for actually happen".

create or replace function public.delete_column(
  p_column_id         uuid,
  p_move_to_column_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_board_id      uuid;
  v_dest_board_id uuid;
  v_start         bigint;
  v_deleted       bigint;
begin
  if p_column_id is null or p_move_to_column_id is null then
    raise exception 'delete_column: both column ids are required'
      using errcode = '22023';
  end if;

  if p_column_id = p_move_to_column_id then
    raise exception 'delete_column: the destination must differ from the column being deleted'
      using errcode = '22023';
  end if;

  -- RLS-filtered reads, because this is INVOKER. A caller with no access to the
  -- board sees no row, so a column they may not touch is indistinguishable from
  -- one that does not exist — no existence oracle, and no separate branch to
  -- write for it.
  select c.board_id into v_board_id
    from public.columns c
   where c.id = p_column_id;

  select c.board_id into v_dest_board_id
    from public.columns c
   where c.id = p_move_to_column_id;

  if v_board_id is null or v_dest_board_id is null then
    raise exception 'delete_column: column not found or not accessible'
      using errcode = '42501';
  end if;

  -- The same class of gap M3-18 closes for work items. Without this, rehoming
  -- into another board's column would be refused by M3-18's composite foreign
  -- key — but as a 23503 after the fact, not as a legible refusal here.
  if v_board_id <> v_dest_board_id then
    raise exception 'delete_column: the destination column belongs to a different board'
      using errcode = '42501';
  end if;

  -- Append after the destination's last card, preserving the source order.
  -- Matches what columnsApi.ts computed client-side, so the visible result of
  -- swapping the client over to this RPC is nothing at all.
  select coalesce(max(t.position), -1) + 1
    into v_start
    from public.todos t
   where t.column_id = p_move_to_column_id;

  update public.todos t
     set column_id = p_move_to_column_id,
         position  = v_start + r.rn
    from (
      select id,
             row_number() over (order by position, id) - 1 as rn
        from public.todos
       where column_id = p_column_id
    ) r
   where t.id = r.id;

  delete from public.columns c where c.id = p_column_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'delete_column: not permitted'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.delete_column(uuid, uuid) is
  'Rehomes a column''s work items into a destination column on the same board '
  'and deletes it, in one transaction. SECURITY INVOKER so M3-05''s editor+ '
  'policies authorize it — the zero-row DELETE check is what turns a silent '
  'RLS denial into a 42501.';


-- 3. Grants ---------------------------------------------------------------------------
--
-- EXECUTE is granted to PUBLIC by default, so the revoke does the work. anon is
-- kept out at the privilege layer as well as by RLS: two independent mistakes
-- deep, the same shape as every other function in M3.

revoke all on function public.delete_column(uuid, uuid) from public, anon;
grant execute on function public.delete_column(uuid, uuid) to authenticated;
grant execute on function public.delete_column(uuid, uuid) to service_role;


-- 4. What this does NOT do --------------------------------------------------------------
--
-- It does not renumber the destination column from zero. Cards are appended, so
-- the destination keeps its existing positions and the moved cards continue
-- from the end — dense, ordered, and identical to today's behaviour.
--
-- It does not delete a column's work items. M2-07 chose ON DELETE RESTRICT and
-- that stands: if rehoming somehow moved nothing, the DELETE raises 23503
-- rather than emptying someone's board. The row-count check above should fire
-- first; the foreign key is the backstop behind it.
--
-- It does not offer a "delete the last column" path. The client hides the
-- option when only one column remains, and there is no destination to rehome
-- into. Nothing here needs to know that.
--
-- ⚠ FRONTEND, NOT DONE HERE — belongs to the Lead:
--   deleteColumn in src/services/columns/columnsApi.ts still performs the four
--   round-trips. Swapping it to
--     supabase.rpc('delete_column', { p_column_id: id, p_move_to_column_id: moveToColumnId })
--   is the other half of this task. The RPC is inert until that lands; the old
--   path keeps working unchanged in the meantime, because nothing was removed.


-- Rollback ------------------------------------------------------------------------------
--
-- Forward-fix in a NEW migration:
--
--   drop function if exists public.delete_column(uuid, uuid);
--
-- Clean while the client still uses the four-round-trip path. Once the frontend
-- swaps over, dropping this without reverting the client breaks column deletion.


-- Verification ----------------------------------------------------------------------------
--
-- scripts/verify-m3-16-role-matrix.sql §10. In summary:
--
--   editor deletes a column with cards      → succeeds, cards arrive in order
--   viewer calls it                         → raises 42501, column still there
--   non-member calls it                     → raises 42501
--   destination on another board            → raises 42501
--   destination = source                    → raises 22023
--   unknown column id                       → raises 42501
--   nothing is half-applied on a refusal    → the column and its cards are unchanged
