-- 0035 — GitLab moves from the board to the space.
--
-- A space now owns its GitLab project: at most one active link per space, and
-- every board filed in the space reads through it. Nothing is created per
-- board, so a board created in the space later inherits the link by being
-- filed there, and a board moved to another space follows its new space.
--
-- board_gitlab_projects keeps its name and its rows. A link is owned by
-- space_id (the new kind) or by board_id (a link made before this migration,
-- which keeps working for its own board until the space's owner resolves it;
-- see 0036). Never both.
--
-- Disconnecting no longer deletes: disconnected_at is set and the token is
-- wiped, and the commits, branches and merge requests the link recorded stay
-- on their tasks. The development tables now reference their link by id
-- alone. They still cascade, because the one hard delete left is a link from
-- before 0035 going with its board, whose rows go with that board's tasks
-- anyway. The rule 0034 enforced with (link_id, board_id) — a link writes only
-- where it may — moves into a trigger, because "where it may" is now "this
-- board, or any board filed in this space". It is checked when a row is
-- written, so history stays put when a board later moves to another space.
--
-- A deleted space leaves its link without an owner rather than deleting it:
-- the space's boards survive as unfiled, and their tasks keep their history.
-- The API accepts no delivery for a link without an owner.
--
-- Expand only. Forward-only: reversing means a new migration.

alter table board_gitlab_projects
  add column space_id uuid references spaces (id) on delete set null,
  add column disconnected_at timestamptz,
  alter column board_id drop not null,
  add constraint board_gitlab_projects_one_owner check (space_id is null or board_id is null);

create unique index board_gitlab_projects_one_active_per_space
  on board_gitlab_projects (space_id)
  where disconnected_at is null;

comment on table board_gitlab_projects is
  'A GitLab project linked to a space (space_id) or, for links made before '
  '0035, to one board (board_id). A space link reaches every board filed in '
  'the space. Disconnected links are kept for the history they recorded.';

comment on column board_gitlab_projects.disconnected_at is
  'Set instead of deleting, with the token wiped. The link accepts no further '
  'delivery; the development rows it recorded stay on their tasks.';

alter table todo_gitlab_commits
  drop constraint todo_gitlab_commits_link_fkey,
  add constraint todo_gitlab_commits_link_fkey
    foreign key (link_id) references board_gitlab_projects (id) on delete cascade;

alter table todo_gitlab_branches
  drop constraint todo_gitlab_branches_link_fkey,
  add constraint todo_gitlab_branches_link_fkey
    foreign key (link_id) references board_gitlab_projects (id) on delete cascade;

alter table todo_gitlab_merge_requests
  drop constraint todo_gitlab_merge_requests_link_fkey,
  add constraint todo_gitlab_merge_requests_link_fkey
    foreign key (link_id) references board_gitlab_projects (id) on delete cascade;

create or replace function public.enforce_gitlab_link_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.board_gitlab_projects l
      join public.boards b on b.id = new.board_id
     where l.id = new.link_id
       and (l.board_id = b.id or l.space_id = b.space_id)
  ) then
    raise exception 'GitLab link % may not write to board %', new.link_id, new.board_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_gitlab_link_scope() is
  'A development row may only be written through a link that reaches its '
  'board: the link''s own board, or any board filed in the link''s space.';

create trigger todo_gitlab_commits_link_scope
  before insert or update of link_id, board_id on todo_gitlab_commits
  for each row execute function public.enforce_gitlab_link_scope();

create trigger todo_gitlab_branches_link_scope
  before insert or update of link_id, board_id on todo_gitlab_branches
  for each row execute function public.enforce_gitlab_link_scope();

create trigger todo_gitlab_merge_requests_link_scope
  before insert or update of link_id, board_id on todo_gitlab_merge_requests
  for each row execute function public.enforce_gitlab_link_scope();
