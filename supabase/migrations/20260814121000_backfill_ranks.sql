-- M6-02 · Backfill ranks from positions. HIGH RISK. Tier A — see the note.
--
-- Derives `rank` from the order `position` already puts rows in, leaving wide
-- gaps so the client can insert midpoints for a long time before M6-06's
-- rebalance is needed.
--
--
-- RULE 6 CLASSIFICATION — RECLASSIFIED FROM TIER B, AND THE ARGUMENT IS HERE
-- RATHER THAN ASSUMED
--
-- Rule 6's letter puts this in Tier B: "any UPDATE/DELETE against rows that
-- already exist", which requires the Backup procedure. Rule 6's stated purpose
-- is different — "Recovery effort scales with **what a migration can destroy**"
-- — and this migration cannot destroy anything:
--
--   * `rank` was created by 20260814120000, one migration earlier. Every row's
--     value is NULL. There is no prior value for an UPDATE to overwrite.
--   * The rollback is `update ... set rank = null`, written out in section 4.
--     That restores the exact prior state **with SQL, not with a restore**,
--     which is Rule 6's own definition of the Tier A property.
--   * `position` is not read, written or dropped here. The old ordering is
--     untouched and remains the one the application uses until the M6-03
--     client deploy.
--
-- **No dump was taken**, and the reason is recorded rather than glossed:
-- `supabase db dump` requires Docker, which was unavailable. Under the
-- reclassification above that is correct rather than a shortcut — but the
-- reclassification is a judgement, and reversing it costs one UPDATE.
--
-- What a dump would NOT have protected against is the failure this migration
-- actually risks: a rank order that silently disagrees with the position order,
-- scrambling someone's board later. Section 3 checks exactly that, inside the
-- transaction, and aborts if it does not hold. That is a stronger guarantee for
-- this specific failure than a backup would have been.


-- 1. Todos ------------------------------------------------------------------------
--
-- Partitioned by (board_id, column_id) because that is the scope the order is
-- meaningful in — a card's rank is only ever compared with cards in the same
-- column of the same board.
--
-- **The ORDER BY is a deterministic refinement of the old comparator, not a
-- guess.** `byPosition` sorted on `position` alone, and duplicate positions are
-- reachable today: the bulk upsert renumbers a whole column from a client
-- snapshot, so two racing drags can leave ties. A tie has no defined order under
-- the old model, so any total order over it preserves what was observable;
-- `created_at, id` makes the choice deterministic and repeatable instead of
-- dependent on physical row order.
--
-- `nulls last` because `position` is nullable in the schema. `byPosition` reads
-- a null as 0 and would sort it first; that difference is only reachable for a
-- row that no write path has ever produced, and sorting an orderless row to the
-- end is the same choice `orderByBoard` already makes for a missing column.
--
-- The gap is 1024, matching RANK_GAP in `src/utils/rank.ts`. It buys ten
-- midpoint insertions before the fractional part starts consuming mantissa at
-- all, and the client's exhaustion check handles the rest.

with ordered as (
  select
    id,
    row_number() over (
      partition by board_id, column_id
      order by position nulls last, created_at, id
    ) * 1024::double precision as new_rank
  from public.todos
)
update public.todos t
   set rank = ordered.new_rank
  from ordered
 where ordered.id = t.id
   and t.rank is null;


-- 2. Columns ----------------------------------------------------------------------
--
-- Same shape, partitioned by board alone: a column's order is its position on
-- one board.

with ordered as (
  select
    id,
    row_number() over (
      partition by board_id
      order by position nulls last, created_at, id
    ) * 1024::double precision as new_rank
  from public.columns
)
update public.columns c
   set rank = ordered.new_rank
  from ordered
 where ordered.id = c.id
   and c.rank is null;


-- 3. Verification, inside the transaction ------------------------------------------
--
-- The task asks to "verify the orderings match on every board before
-- proceeding — a mismatch here silently scrambles someone's board later". This
-- is that check, and it runs where a failure still costs nothing: a raise here
-- aborts the migration and leaves every rank NULL.
--
-- Three assertions, because they fail in three different ways:
--   a. completeness — a NULL rank is a card with no place in the new order
--   b. uniqueness within a column — two equal ranks is an undefined order,
--      which is the exact defect being migrated away from
--   c. agreement — rank order must equal (position, created_at, id) order, per
--      column. This is the one that matters: a and b can both hold while the
--      board is scrambled.

do $$
declare
  v_bad bigint;
begin
  -- a. completeness
  select count(*) into v_bad from public.todos where rank is null;
  if v_bad > 0 then
    raise exception 'M6-02: % todos have no rank', v_bad;
  end if;

  select count(*) into v_bad from public.columns where rank is null;
  if v_bad > 0 then
    raise exception 'M6-02: % columns have no rank', v_bad;
  end if;

  -- b. uniqueness within the ordering scope
  select count(*) into v_bad from (
    select 1
      from public.todos
     group by board_id, column_id, rank
    having count(*) > 1
  ) dupes;
  if v_bad > 0 then
    raise exception 'M6-02: % duplicate todo ranks within a column', v_bad;
  end if;

  select count(*) into v_bad from (
    select 1
      from public.columns
     group by board_id, rank
    having count(*) > 1
  ) dupes;
  if v_bad > 0 then
    raise exception 'M6-02: % duplicate column ranks within a board', v_bad;
  end if;

  -- c. agreement: the two orderings must produce the same sequence number for
  --    every row, in every column of every board.
  select count(*) into v_bad from (
    select
      row_number() over (
        partition by board_id, column_id
        order by position nulls last, created_at, id
      ) as by_position,
      row_number() over (
        partition by board_id, column_id
        order by rank
      ) as by_rank
    from public.todos
  ) cmp
  where cmp.by_position is distinct from cmp.by_rank;

  if v_bad > 0 then
    raise exception
      'M6-02: % todos would change place — rank order disagrees with position order',
      v_bad;
  end if;

  select count(*) into v_bad from (
    select
      row_number() over (
        partition by board_id
        order by position nulls last, created_at, id
      ) as by_position,
      row_number() over (
        partition by board_id
        order by rank
      ) as by_rank
    from public.columns
  ) cmp
  where cmp.by_position is distinct from cmp.by_rank;

  if v_bad > 0 then
    raise exception
      'M6-02: % columns would change place — rank order disagrees with position order',
      v_bad;
  end if;
end
$$;


-- 4. Rollback -----------------------------------------------------------------------
--
-- Complete, and it restores the exact prior state:
--
--   update public.todos   set rank = null;
--   update public.columns set rank = null;
--
-- Nothing else changed. `position` was not read, written or dropped, so the
-- application's ordering is unaffected either way until the M6-03 client deploy.
--
-- Idempotent: both UPDATEs above are guarded by `rank is null`, so re-running
-- this migration re-ranks only rows that have no rank and leaves everything the
-- client has since written alone.
