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

export function fetchGitLabLinks(boardId: string): Promise<GitLabLink[]> {
  return api.get<GitLabLink[]>(`/boards/${boardId}/integrations/gitlab`);
}

export function connectGitLabProject({
  boardId,
  projectUrl,
}: {
  boardId: string;
  projectUrl: string;
}): Promise<{ link: GitLabLink; webhook_url: string }> {
  return api.post(`/boards/${boardId}/integrations/gitlab`, {
    project_url: projectUrl,
  });
}

// Write-only: the token goes up once and nothing the API answers carries it
// back, so the link it returns is all there is to show.
export function saveGitLabSigningToken({
  boardId,
  linkId,
  token,
}: {
  boardId: string;
  linkId: string;
  token: string;
}): Promise<GitLabLink> {
  return api.put<GitLabLink>(
    `/boards/${boardId}/integrations/gitlab/${linkId}/signing-token`,
    { token },
  );
}

export async function unlinkGitLabProject({
  boardId,
  linkId,
}: {
  boardId: string;
  linkId: string;
}): Promise<void> {
  await api.del<void>(`/boards/${boardId}/integrations/gitlab/${linkId}`);
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
