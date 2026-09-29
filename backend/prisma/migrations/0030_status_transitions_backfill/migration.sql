-- 0030 — backfill status_transitions from the category rule that has been
-- enforced in code: forward exactly one stage, backward any distance, sideways
-- freely. Board behaviour is unchanged on deploy.
--
-- The old rule also let a move skip a stage the board could not stop in (no
-- visible In Review status: in_progress -> done was allowed). That is kept: a
-- stage counts only if the board has a visible status in it.
--
-- Forward-only. Reversing means a new migration.

with stage(category, idx) as (
  values ('todo', 0), ('in_progress', 1), ('in_review', 2), ('done', 3)
),
present as (
  select distinct s.board_id, st.idx
    from statuses s
    join stage st on st.category = s.category
   where not s.is_hidden
)
insert into status_transitions (board_id, from_status_id, to_status_id)
select a.board_id, a.id, b.id
  from statuses a
  join statuses b on b.board_id = a.board_id and b.id <> a.id
  join stage sa on sa.category = a.category
  join stage sb on sb.category = b.category
 where sb.idx - sa.idx <= 1
    or not exists (
         select 1
           from present p
          where p.board_id = a.board_id
            and p.idx > sa.idx
            and p.idx < sb.idx
       )
on conflict do nothing;
