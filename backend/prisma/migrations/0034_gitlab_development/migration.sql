-- 0034 — GitLab development integration.
--
-- board_gitlab_projects links ONE board to one GitLab project. The same
-- project may be linked to any number of boards, each through its own row,
-- its own webhook url and its own signing token, so the boards stay
-- independent of each other.
--
-- The three development tables hold what GitLab reported about a work item:
-- commits, branches and merge requests. Every row is composite-keyed to its
-- link by (link_id, board_id) AND to its work item by (todo_id, board_id), so
-- a link can only ever write to its own board's work items. That is the rule
-- the whole feature depends on, enforced here and not only in the service.
--
-- signing_token_sealed is the token GitLab generated, sealed with AES-256-GCM
-- under INTEGRATION_SECRET_KEY, which lives outside the database: a leaked
-- database alone cannot sign a delivery. The API never returns it.
--
-- Unlinking deletes the link's development rows (cascade), as decided for
-- Phase 3. Deleting a work item or a board removes them the same way.
--
-- Expand only: four new tables, nothing existing is touched.
--
-- Forward-only. Reversing means a new migration.

create table board_gitlab_projects (
  id                   uuid primary key default gen_random_uuid(),
  board_id             uuid not null references boards (id) on delete cascade,
  instance_url         text not null,
  project_path         citext not null,
  gitlab_project_id    bigint,
  project_web_url      text,
  signing_token_sealed text,
  signing_token_set_at timestamptz,
  last_delivery_at     timestamptz,
  last_failure_at      timestamptz,
  last_failure_reason  text,
  created_by           uuid references profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint board_gitlab_projects_id_board_id_key unique (id, board_id),
  constraint board_gitlab_projects_board_path_key unique (board_id, instance_url, project_path),
  constraint board_gitlab_projects_board_project_key unique (board_id, instance_url, gitlab_project_id),
  constraint board_gitlab_projects_instance_url_format
    check (instance_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?$'),
  constraint board_gitlab_projects_project_path_format
    check (project_path ~ '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+$' and length(project_path) <= 255),
  constraint board_gitlab_projects_project_id_positive check (gitlab_project_id > 0),
  constraint board_gitlab_projects_web_url_https check (project_web_url like 'https://%'),
  constraint board_gitlab_projects_token_pair
    check ((signing_token_sealed is null) = (signing_token_set_at is null)),
  constraint board_gitlab_projects_failure_pair
    check ((last_failure_at is null) = (last_failure_reason is null)),
  constraint board_gitlab_projects_failure_reason
    check (last_failure_reason in ('headers', 'signature', 'timestamp', 'token', 'project', 'payload'))
);

comment on table board_gitlab_projects is
  'One board linked to one GitLab project. A project may be linked to many '
  'boards; each link is its own webhook and writes only to its own board.';

comment on column board_gitlab_projects.project_path is
  'What the admin connected, e.g. group/project. The first verified delivery '
  'must come from this path; after that gitlab_project_id is what is checked, '
  'so a later rename or transfer in GitLab does not break the link.';

comment on column board_gitlab_projects.gitlab_project_id is
  'Pinned by the first verified delivery. Every later delivery must carry it.';

comment on column board_gitlab_projects.signing_token_sealed is
  'GitLab''s webhook signing token, AES-256-GCM sealed under '
  'INTEGRATION_SECRET_KEY and bound to this row''s id. Never returned.';

create table todo_gitlab_commits (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null,
  todo_id      uuid not null,
  link_id      uuid not null,
  sha          text not null,
  title        text not null,
  message      text not null,
  author_name  text not null,
  committed_at timestamptz not null,
  matched_ref  text not null,
  created_at   timestamptz not null default now(),
  constraint todo_gitlab_commits_todo_fkey
    foreign key (todo_id, board_id) references todos (id, board_id) on delete cascade,
  constraint todo_gitlab_commits_link_fkey
    foreign key (link_id, board_id) references board_gitlab_projects (id, board_id) on delete cascade,
  constraint todo_gitlab_commits_sha_format check (sha ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  constraint todo_gitlab_commits_key unique (todo_id, link_id, sha)
);

create index todo_gitlab_commits_todo_committed_idx on todo_gitlab_commits (todo_id, committed_at desc);
create index todo_gitlab_commits_link_idx on todo_gitlab_commits (link_id);

comment on table todo_gitlab_commits is
  'A commit whose message names a work item. One row per (work item, link, '
  'sha), so a redelivered push changes nothing. matched_ref is the reference '
  'as written, e.g. mnh-23 after the board''s key became HOB.';

create table todo_gitlab_branches (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null,
  todo_id     uuid not null,
  link_id     uuid not null,
  name        text not null,
  matched_ref text not null,
  head_sha    text not null,
  pushed_at   timestamptz not null,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint todo_gitlab_branches_todo_fkey
    foreign key (todo_id, board_id) references todos (id, board_id) on delete cascade,
  constraint todo_gitlab_branches_link_fkey
    foreign key (link_id, board_id) references board_gitlab_projects (id, board_id) on delete cascade,
  constraint todo_gitlab_branches_name_not_blank check (length(name) > 0),
  constraint todo_gitlab_branches_head_sha_format check (head_sha ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  constraint todo_gitlab_branches_key unique (todo_id, link_id, name)
);

create index todo_gitlab_branches_link_name_idx on todo_gitlab_branches (link_id, name);

comment on column todo_gitlab_branches.pushed_at is
  'When GitLab sent the last push applied to this row (webhook-timestamp). An '
  'older delivery arriving late is not allowed to overwrite a newer one.';

comment on column todo_gitlab_branches.deleted_at is
  'Set when the branch is deleted in GitLab. Kept rather than removed so a '
  'late, older push cannot bring a deleted branch back.';

create table todo_gitlab_merge_requests (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null,
  todo_id           uuid not null,
  link_id           uuid not null,
  iid               integer not null,
  title             text not null,
  state             text not null,
  source_branch     text not null,
  target_branch     text not null,
  matched_ref       text not null,
  gitlab_updated_at timestamptz not null,
  created_at        timestamptz not null default now(),
  constraint todo_gitlab_merge_requests_todo_fkey
    foreign key (todo_id, board_id) references todos (id, board_id) on delete cascade,
  constraint todo_gitlab_merge_requests_link_fkey
    foreign key (link_id, board_id) references board_gitlab_projects (id, board_id) on delete cascade,
  constraint todo_gitlab_merge_requests_iid_positive check (iid > 0),
  constraint todo_gitlab_merge_requests_state check (state in ('opened', 'closed', 'merged', 'locked')),
  constraint todo_gitlab_merge_requests_key unique (todo_id, link_id, iid)
);

create index todo_gitlab_merge_requests_link_iid_idx on todo_gitlab_merge_requests (link_id, iid);

comment on column todo_gitlab_merge_requests.gitlab_updated_at is
  'The merge request''s own updated_at from GitLab. A delivery older than the '
  'stored one is ignored, so a late "update" cannot reopen a merged request.';
