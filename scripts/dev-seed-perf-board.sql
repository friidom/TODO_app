-- DEV ONLY · M9-05 profiling fixture. Not a migration. Never run against data you care about.
--
-- Tops up the board that ALREADY has the most work items until it holds ~200,
-- so the profiler has a realistic board rather than a synthetic one. It picks
-- the board itself — nothing to look up by hand.
--
-- Every row it writes is titled '[perf] …', which is the whole reversal story:
--
--   RUN:     psql "$DATABASE_URL" -f scripts/dev-seed-perf-board.sql
--   REMOVE:  psql "$DATABASE_URL" -c "delete from public.todos where title like '[perf] %';"
--
-- (Or paste either into the Supabase SQL editor. CLAUDE.md bans the editor for
-- SCHEMA changes; this touches no schema, so the ban does not apply.)
--
-- Deliberately NOT set: board_key, which the BEFORE INSERT trigger allocates
-- from boards.next_key. Seeding 200 rows therefore burns 200 keys permanently —
-- keys are never reused by design, so this board's next real card will be a few
-- hundred higher than it would have been. That is the cost of the fixture and
-- it is why this belongs on a scratch board, not your daily one.

do $$
declare
  target_board  uuid;
  board_owner   uuid;
  existing      int;
  needed        int;
begin
  -- The board with the most work items, ties broken arbitrarily.
  select t.board_id, count(*)
    into target_board, existing
    from public.todos t
   group by t.board_id
   order by count(*) desc
   limit 1;

  if target_board is null then
    raise exception 'No todos exist — nothing to top up. Create one board with a few cards first.';
  end if;

  select b.owner_id into board_owner
    from public.boards b
   where b.id = target_board;

  needed := 200 - existing;

  raise notice 'board % holds % work items; adding %', target_board, existing, greatest(needed, 0);

  if needed <= 0 then
    raise notice 'Already at or above 200 — nothing to do.';
    return;
  end if;

  -- Spread across the board's real columns, round-robin, so every column gets a
  -- realistic depth instead of one column holding all 200.
  --
  -- rank continues past each column's current maximum in steps of 1000, well
  -- clear of RANK_GAP, so no seeded card can collide with a real one or land
  -- between two of them. position mirrors it loosely; nothing orders by it.
  insert into public.todos (id, board_id, column_id, creator_id, title, type, rank, position)
  select
    gen_random_uuid(),
    target_board,
    c.id,
    board_owner,
    '[perf] card ' || g.n,
    'task',
    coalesce(m.max_rank, 0) + (g.n * 1000),
    coalesce(m.max_pos, 0) + g.n
  from generate_series(1, needed) as g(n)
  cross join lateral (
    -- round-robin: column (n mod column_count)
    select col.id
      from (
        select id, row_number() over (order by position, id) - 1 as idx
          from public.columns
         where board_id = target_board
      ) col
     where col.idx = g.n % (select count(*) from public.columns where board_id = target_board)
  ) c
  left join lateral (
    select max(rank) as max_rank, max(position) as max_pos
      from public.todos
     where column_id = c.id
  ) m on true;

  raise notice 'done — % seeded rows now titled ''[perf] %%''', needed;
end $$;
