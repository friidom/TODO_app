import { env } from "../../config/env.js";
import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import { parseSecretBoxKey, sealSecret } from "../../lib/secretBox.js";
import { emitInvalidate } from "../../realtime/emit.js";
import type { Actor } from "../../types/actor.js";
import type { BoardContext } from "../members/members.service.js";
import {
  branchUrl,
  buildWebhookUrl,
  commitUrl,
  linkStatus,
  mergeRequestUrl,
  projectPathOf,
  projectUrl,
  type LinkStatus,
} from "./gitlab.links.js";
import * as gitlabRepo from "./gitlab.repo.js";
import type { LinkRow } from "./gitlab.repo.js";
import type { ConnectProjectInput } from "./gitlab.schema.js";

export interface GitLabLinkView {
  id: string;
  instance_url: string;
  project_path: string;
  project_url: string;
  webhook_url: string;
  status: LinkStatus;
  signing_token_set_at: Date | null;
  last_delivery_at: Date | null;
  last_failure_at: Date | null;
  last_failure_reason: string | null;
  created_at: Date;
}

function notFound(): AppError {
  return new AppError("not_found", "Not found.");
}

export function webhookUrl(linkId: string): string {
  return buildWebhookUrl(linkId, {
    apiPublicUrl: env.API_PUBLIC_URL,
    webhookPublicOrigin: env.WEBHOOK_PUBLIC_ORIGIN,
  });
}

// The link's own id is the authenticated context the token is sealed under,
// so a sealed token copied onto another row will not open there.
export function tokenContext(linkId: string): string {
  return `board_gitlab_projects:${linkId}`;
}

// Read per call rather than once at load, so the server needs no restart
// between setting the variable and the first token being saved.
export function integrationKey(): Buffer | null {
  const raw = env.INTEGRATION_SECRET_KEY;

  return raw === undefined ? null : parseSecretBoxKey(raw);
}

function toView(row: LinkRow): GitLabLinkView {
  return {
    id: row.id,
    instance_url: row.instance_url,
    project_path: projectPathOf(row),
    project_url: projectUrl(row),
    webhook_url: webhookUrl(row.id),
    status: linkStatus(row),
    signing_token_set_at: row.signing_token_set_at,
    last_delivery_at: row.last_delivery_at,
    last_failure_at: row.last_failure_at,
    last_failure_reason: row.last_failure_reason,
    created_at: row.created_at,
  };
}

export async function list(board: BoardContext): Promise<GitLabLinkView[]> {
  return (await gitlabRepo.findLinks(board.id)).map(toView);
}

export async function connect(
  actor: Actor,
  board: BoardContext,
  input: ConnectProjectInput,
): Promise<{ link: GitLabLinkView; webhook_url: string }> {
  try {
    const link = toView(await gitlabRepo.insertLink(board.id, { ...input, created_by: actor.id }));

    return { link, webhook_url: link.webhook_url };
  } catch (error) {
    if (uniqueConstraintOf(error) === "board_gitlab_projects_board_path_key") {
      throw new AppError("conflict", "That GitLab project is already connected to this board.");
    }

    throw error;
  }
}

export async function saveSigningToken(
  board: BoardContext,
  linkId: string,
  token: string,
): Promise<GitLabLinkView> {
  const key = integrationKey();

  if (key === null) {
    throw new AppError("internal", "GitLab integration is not configured on this server.");
  }

  const updated = await gitlabRepo.setSigningToken(
    board.id,
    linkId,
    sealSecret(token, key, tokenContext(linkId)),
    new Date(),
  );

  const row = updated === 0 ? null : await gitlabRepo.findLink(board.id, linkId);

  if (row === null) throw notFound();

  return toView(row);
}

export async function unlink(board: BoardContext, linkId: string): Promise<void> {
  if ((await gitlabRepo.deleteLink(board.id, linkId)) === 0) throw notFound();

  emitInvalidate(board.id, ["development"]);
}

export interface DevelopmentCommit {
  sha: string;
  title: string;
  message: string;
  author_name: string;
  committed_at: Date;
  url: string;
  project_path: string;
}

export interface DevelopmentBranch {
  name: string;
  head_sha: string;
  url: string;
  project_path: string;
  updated_at: Date;
}

export interface DevelopmentMergeRequest {
  iid: number;
  title: string;
  state: string;
  source_branch: string;
  target_branch: string;
  url: string;
  project_path: string;
  updated_at: Date;
}

export interface DevelopmentProject {
  project_path: string;
  project_url: string;
}

export interface Development {
  connected: boolean;
  projects: DevelopmentProject[];
  commits: DevelopmentCommit[];
  branches: DevelopmentBranch[];
  merge_requests: DevelopmentMergeRequest[];
}

export async function development(
  board: BoardContext,
  todoId: string,
  commitLimit: number | undefined,
): Promise<Development> {
  const { commits, branches, mergeRequests, links } = await gitlabRepo.findDevelopment(board.id, todoId, commitLimit);

  return {
    connected: links.length > 0,
    projects: links.map((project) => ({ project_path: projectPathOf(project), project_url: projectUrl(project) })),
    commits: commits.map(({ board_gitlab_projects: project, ...commit }) => ({
      ...commit,
      url: commitUrl(projectUrl(project), commit.sha),
      project_path: projectPathOf(project),
    })),
    branches: branches.map(({ board_gitlab_projects: project, pushed_at, ...branch }) => ({
      ...branch,
      url: branchUrl(projectUrl(project), branch.name),
      project_path: projectPathOf(project),
      updated_at: pushed_at,
    })),
    merge_requests: mergeRequests.map(({ board_gitlab_projects: project, gitlab_updated_at, ...mergeRequest }) => ({
      ...mergeRequest,
      url: mergeRequestUrl(projectUrl(project), mergeRequest.iid),
      project_path: projectPathOf(project),
      updated_at: gitlab_updated_at,
    })),
  };
}
