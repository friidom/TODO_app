import { api } from "../api/client";

export type GitLabLinkStatus =
  "awaiting_token" | "awaiting_delivery" | "active" | "failing";

export type GitLabLink = {
  id: string;
  instance_url: string;
  project_path: string;
  project_url: string;
  webhook_url: string;
  status: GitLabLinkStatus;
  signing_token_set_at: string | null;
  last_delivery_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  created_at: string;
};

export type BoardGitLabLink = GitLabLink & {
  board: { id: string; title: string | null; key_prefix: string };
};

export type SpaceGitLab = {
  configured: boolean;
  link: GitLabLink | null;
  // Links boards in this space made before GitLab moved to spaces.
  board_links: BoardGitLabLink[];
};

export type SpaceLinkSummary = Pick<
  GitLabLink,
  "project_path" | "project_url" | "status" | "last_delivery_at"
>;

export type BoardGitLab = {
  configured: boolean;
  space_link: SpaceLinkSummary | null;
  board_links: GitLabLink[];
};

// Who a link belongs to: a space, or a board that linked a project before
// projects were connected per space.
export type GitLabOwner = { spaceId: string } | { boardId: string };

function ownerPath(owner: GitLabOwner): string {
  return "spaceId" in owner
    ? `/spaces/${owner.spaceId}/integrations/gitlab`
    : `/boards/${owner.boardId}/integrations/gitlab`;
}

export function fetchSpaceGitLab(spaceId: string): Promise<SpaceGitLab> {
  return api.get<SpaceGitLab>(ownerPath({ spaceId }));
}

export function fetchBoardGitLab(boardId: string): Promise<BoardGitLab> {
  return api.get<BoardGitLab>(ownerPath({ boardId }));
}

export function connectSpaceGitLab({
  spaceId,
  projectUrl,
}: {
  spaceId: string;
  projectUrl: string;
}): Promise<{ link: GitLabLink; webhook_url: string }> {
  return api.post(ownerPath({ spaceId }), { project_url: projectUrl });
}

// Write-only: the token goes up once and nothing the API answers carries it
// back, so the link it returns is all there is to show.
export function saveGitLabSigningToken({
  owner,
  linkId,
  token,
}: {
  owner: GitLabOwner;
  linkId: string;
  token: string;
}): Promise<GitLabLink> {
  return api.put<GitLabLink>(`${ownerPath(owner)}/${linkId}/signing-token`, {
    token,
  });
}

export async function disconnectGitLabLink({
  owner,
  linkId,
}: {
  owner: GitLabOwner;
  linkId: string;
}): Promise<void> {
  await api.del<void>(`${ownerPath(owner)}/${linkId}`);
}

export type DevelopmentCommit = {
  sha: string;
  title: string;
  message: string;
  author_name: string;
  committed_at: string;
  url: string;
  project_path: string;
};

export type DevelopmentBranch = {
  name: string;
  head_sha: string;
  url: string;
  project_path: string;
  updated_at: string;
};

export type MergeRequestState = "opened" | "merged" | "closed" | "locked";

export type DevelopmentMergeRequest = {
  iid: number;
  title: string;
  state: MergeRequestState;
  source_branch: string;
  target_branch: string;
  url: string;
  project_path: string;
  updated_at: string;
};

export type DevelopmentProject = {
  project_path: string;
  project_url: string;
};

export type Development = {
  connected: boolean;
  projects: DevelopmentProject[];
  commits: DevelopmentCommit[];
  branches: DevelopmentBranch[];
  merge_requests: DevelopmentMergeRequest[];
};

export function fetchDevelopment(todoId: string): Promise<Development> {
  return api.get<Development>(`/todos/${todoId}/development`);
}
