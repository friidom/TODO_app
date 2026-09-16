-- Fixes: deleting a board was impossible.
--
-- log_member_activity logs a 'removed' activity for every board_members
-- deletion. A board deletion cascades into board_members, so that AFTER DELETE
-- trigger fired while the board itself was already gone -- and the activity row
-- it inserted references OLD.board_id, which no longer satisfied
-- activities_board_id_fkey. The insert failed and took the whole DELETE with it.
--
-- Every board has an owner membership (boards_add_owner_membership), so this
-- hit EVERY board, not an edge case. The defect came over verbatim from the
-- Supabase migrations, where deleteBoard (src/services/boards/boardsApi.ts)
-- would fail the same way; it had simply never been exercised.
--
-- The fix is to skip the log when the parent board is already gone. The entry
-- was never useful in that case: activities.board_id is ON DELETE CASCADE, so
-- the row would be deleted along with the board microseconds later. What is
-- being dropped is an entry that could not survive the statement that wrote it.
--
-- Ordinary member removal -- a real "remove this person from the board"
-- action, where the board stays -- is unchanged and still logged, as are the
-- INSERT and UPDATE branches.

create or replace function public.log_member_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'member', new.user_id, 'added',
            jsonb_build_object('role', new.role));
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- False only when the board is mid-cascade. Same shape as the two cascade
    -- escape hatches in enforce_owner_membership_immutable, which likewise ask
    -- whether the parent still exists rather than trusting cascade ordering.
    if exists (select 1 from public.boards b where b.id = old.board_id) then
      insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
      values (old.board_id, v_actor, 'member', old.user_id, 'removed',
              jsonb_build_object('role', old.role));
    end if;

    return null;
  end if;

  if new.role is distinct from old.role then
    insert into public.activities (board_id, actor_id, entity_type, entity_id, action, payload)
    values (new.board_id, v_actor, 'member', new.user_id, 'role_changed',
            jsonb_build_object('from', old.role, 'to', new.role));
  end if;

  return null;
end;
$$;
