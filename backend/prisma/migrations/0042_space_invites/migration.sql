-- 0042 — Space invitations: one credential for several boards of one space.
-- space_id marks a row as one, and board_invite_boards lists the boards it
-- grants. board_id stays the first of them, so everything that reaches an
-- invitation through its board (boardAccess on revoke, the cascade, the
-- notification) works unchanged. A row with space_id null is a board
-- invitation exactly as before; no existing row is rewritten.
alter table board_invites
  add column space_id uuid references spaces (id) on delete cascade;

create table board_invite_boards (
  invite_id uuid not null references board_invites (id) on delete cascade,
  board_id  uuid not null references boards (id) on delete cascade,
  primary key (invite_id, board_id)
);

create index board_invite_boards_board_id_idx on board_invite_boards (board_id);

comment on table board_invite_boards is
  'The boards a space invitation grants, fixed when it is sent: a board added '
  'to the space later is not included.';

-- 0006's body, plus the space's title on a space invitation, so the inbox can
-- say what it is for. A board invitation's payload is unchanged.
create or replace function public.notify_on_invite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_board   text;
  v_actor   text;
  v_space   text;
begin
  if new.email is null then
    return new;
  end if;

  select p.id into v_user_id
    from public.profiles p
   where lower(p.email) = lower(new.email)
   limit 1;

  if v_user_id is null then
    return new;
  end if;

  if v_user_id = new.created_by then
    return new;
  end if;

  select b.title into v_board from public.boards b where b.id = new.board_id;

  select coalesce(p.full_name, p.username) into v_actor
    from public.profiles p where p.id = new.created_by;

  if new.space_id is not null then
    select s.title into v_space from public.spaces s where s.id = new.space_id;
  end if;

  insert into public.notifications
    (user_id, type, board_id, entity_type, entity_id, actor_id, payload)
  values (
    v_user_id, 'invite', new.board_id, 'invite', new.id, new.created_by,
    jsonb_build_object(
      'board_title', coalesce(v_board, 'a board'),
      'actor_name',  v_actor,
      'role',        new.role
    ) || case
      when v_space is null then '{}'::jsonb
      else jsonb_build_object('space_title', v_space)
    end
  );

  return new;
end;
$$;
