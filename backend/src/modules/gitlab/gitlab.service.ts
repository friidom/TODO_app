import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { AppError, uniqueConstraintOf } from "../../lib/errors.js";
import { parseSecretBoxKey, sealSecret } from "../../lib/secretBox.js";
import { emitInvalidate } from "../../realtime/emit.js";
import type { Actor } from "../../types/actor.js";
import type { BoardContext } from "../members/members.service.js";
import * as spacesRepo from "../spaces/spaces.repo.js";
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
import type { DeliveryLink, LinkOwner, LinkRow } from "./gitlab.repo.js";
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

export interface BoardLinkView extends GitLabLinkView {
  board: { id: string; title: string | null; key_prefix: string };
}

export interface SpaceGitLab {
  configured: boolean;
  link: GitLabLinkView | null;
  board_links: BoardLinkView[];
}

// What a board admin sees of the space's link: no webhook url, because the
// space's owner is the one who sets it up.
export type SpaceLinkSummary = Pick<GitLabLinkView, "project_path" | "project_url" | "status" | "last_delivery_at">;

export interface BoardGitLab {
  configured: boolean;
  space_link: SpaceLinkSummary | null;
  board_links: GitLabLinkView[];
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
// so a sealed token copied onto another row will not open there. The prefix
// is a fixed label, not the table's name: every token sealed so far carries it.
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

// Board routes are authorized by boardAccess and requireRole before they get
// here. A space has no membership, so its owner is checked here instead, and a
// space someone else owns is missing rather than forbidden, as in the spaces
// module.
async function authorize(actor: Actor, owner: LinkOwner): Promise<void> {
  if ("space_id" in owner && (await spacesRepo.findOne(actor.id, owner.space_id)) === null) throw notFound();
}

// Which links a board reads through: its space's link when the space has one,
// else whatever links the board itself held before 0035.
async function linksReadBy(boardId: string): Promise<LinkRow[]> {
  const spaceId = await gitlabRepo.spaceIdOf(boardId);
  const spaceLink = spaceId === null ? null : await gitlabRepo.findSpaceLink(spaceId);

  return spaceLink === null ? gitlabRepo.findBoardLinks(boardId) : [spaceLink];
}

// The same rule from the other side, for a delivery: the boards a link writes
// to. A board link falls silent once its board's space has a link of its own.
export async function boardsReachedBy(link: Pick<DeliveryLink, "space_id" | "board_id">): Promise<string[]> {
  if (link.space_id !== null) return gitlabRepo.boardIdsInSpace(link.space_id);

  if (link.board_id === null) return [];

  const spaceId = await gitlabRepo.spaceIdOf(link.board_id);
  const superseded = spaceId !== null && (await gitlabRepo.findSpaceLink(spaceId)) !== null;

  return superseded ? [] : [link.board_id];
}

// Every board whose tasks may now read differently. The settings tab is in no
// board's room; the clients that are open on a board are.
async function announce(owner: LinkOwner): Promise<void> {
  const boardIds = "space_id" in owner ? await gitlabRepo.boardIdsInSpace(owner.space_id) : [owner.board_id];

  for (const boardId of boardIds) emitInvalidate(boardId, ["development"]);
}

export async function spaceIntegration(actor: Actor, spaceId: string): Promise<SpaceGitLab> {
  await authorize(actor, { space_id: spaceId });

  const [link, boardLinks] = await Promise.all([
    gitlabRepo.findSpaceLink(spaceId),
    gitlabRepo.findBoardLinksInSpace(spaceId),
  ]);

  return {
    configured: integrationKey() !== null,
    link: link && toView(link),
    board_links: boardLinks.flatMap(({ boards, ...row }) => (boards === null ? [] : [{ ...toView(row), board: boards }])),
  };
}

function isConnected(link: LinkRow, input: ConnectProjectInput): boolean {
  const wanted = input.project_path.toLowerCase();

  return (
    link.instance_url === input.instance_url &&
    [link.project_path, projectPathOf(link)].some((path) => path.toLowerCase() === wanted)
  );
}

// Connecting replaces: the space's previous link and every board link in the
// space are disconnected in the same transaction, so the space never has two
// projects at once. Their history stays on the tasks.
export async function connectSpace(
  actor: Actor,
  spaceId: string,
  input: ConnectProjectInput,
): Promise<{ link: GitLabLinkView; webhook_url: string }> {
  await authorize(actor, { space_id: spaceId });

  const current = await gitlabRepo.findSpaceLink(spaceId);

  if (current !== null && isConnected(current, input)) {
    throw new AppError("conflict", "That GitLab project is already connected to this space.");
  }

  let row: LinkRow;

  try {
    row = await prisma.$transaction(async (tx) => {
      await gitlabRepo.disconnectEverythingInSpace(tx, spaceId, new Date());

      return gitlabRepo.insertLink(tx, spaceId, { ...input, created_by: actor.id });
    });
  } catch (error) {
    if (uniqueConstraintOf(error) === "board_gitlab_projects_one_active_per_space") {
      throw new AppError("conflict", "This space's GitLab connection just changed. Reload and try again.");
    }

    throw error;
  }

  await announce({ space_id: spaceId });

  const link = toView(row);

  return { link, webhook_url: link.webhook_url };
}

export async function saveSigningToken(
  actor: Actor,
  owner: LinkOwner,
  linkId: string,
  token: string,
): Promise<GitLabLinkView> {
  await authorize(actor, owner);

  const key = integrationKey();

  if (key === null) {
    throw new AppError("internal", "GitLab integration is not configured on this server.");
  }

  const updated = await gitlabRepo.setSigningToken(
    owner,
    linkId,
    sealSecret(token, key, tokenContext(linkId)),
    new Date(),
  );

  const row = updated === 0 ? null : await gitlabRepo.findLink(owner, linkId);

  if (row === null) throw notFound();

  return toView(row);
}

export async function disconnect(actor: Actor, owner: LinkOwner, linkId: string): Promise<void> {
  await authorize(actor, owner);

  if ((await gitlabRepo.disconnectLink(owner, linkId, new Date())) === 0) throw notFound();

  await announce(owner);
}

export async function boardIntegration(board: BoardContext): Promise<BoardGitLab> {
  const spaceId = await gitlabRepo.spaceIdOf(board.id);

  const [spaceLink, boardLinks] = await Promise.all([
    spaceId === null ? null : gitlabRepo.findSpaceLink(spaceId),
    gitlabRepo.findBoardLinks(board.id),
  ]);

  return {
    configured: integrationKey() !== null,
    space_link: spaceLink && {
      project_path: projectPathOf(spaceLink),
      project_url: projectUrl(spaceLink),
      status: linkStatus(spaceLink),
      last_delivery_at: spaceLink.last_delivery_at,
    },
    board_links: boardLinks.map(toView),
  };
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
  const [{ commits, branches, mergeRequests }, links] = await Promise.all([
    gitlabRepo.findDevelopment(board.id, todoId, commitLimit),
    linksReadBy(board.id),
  ]);

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
