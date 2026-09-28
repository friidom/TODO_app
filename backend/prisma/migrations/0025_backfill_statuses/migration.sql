-- 0025 — one status per existing column, and every card pointed at it
-- (Flexible Workflow, Phase A: backfill).
--
-- Each column becomes a column holding exactly one status that carries the
-- column's own title and category, so every board reads exactly as it did the
-- moment before: same columns, same order, same "done", same workflow stages.
--
-- Status names must be unique per board (case-insensitive) where column titles
-- never were, so a second "To Do" on one board becomes "To Do (2)". A null or
-- blank title becomes "Untitled". Names are cut to the 60 characters the
-- column-title API has always enforced; older rows may predate that limit.
--
-- The card update runs with todos' user triggers disabled, as 0013's backfill
-- did: set_updated_at would re-date every card to this migration, and nothing
-- about the card has changed. Foreign keys are system triggers and still check.

do $$
declare
  v_column record;
  v_base   text;
  v_name   text;
  v_suffix text;
  v_n      integer;
begin
  for v_column in
    select c.id, c.board_id, c.title, c.category, c.created_at, c.updated_at
      from columns c
     order by c.board_id, c.rank nulls last, c.position nulls last, c.created_at, c.id
  loop
    v_base := btrim(left(coalesce(nullif(btrim(v_column.title), ''), 'Untitled'), 60));
    v_name := v_base;
    v_n := 1;

    while exists (
      select 1 from statuses s
       where s.board_id = v_column.board_id
         and s.name = v_name::citext
    ) loop
      v_n := v_n + 1;
      v_suffix := ' (' || v_n || ')';
      v_name := btrim(left(v_base, 60 - length(v_suffix))) || v_suffix;
    end loop;

    insert into statuses (board_id, column_id, name, category, rank, created_at, updated_at)
    values (
      v_column.board_id,
      v_column.id,
      v_name,
      coalesce(v_column.category, 'todo'),
      1024,
      v_column.created_at,
      v_column.updated_at
    );
  end loop;
end;
$$;

alter table todos disable trigger user;

update todos t
   set status_id = s.id
  from statuses s
 where s.column_id = t.column_id
   and s.board_id = t.board_id;

alter table todos enable trigger user;
