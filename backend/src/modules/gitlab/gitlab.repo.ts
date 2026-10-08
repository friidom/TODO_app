import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

// signing_token_sealed is deliberately absent: every row read for an API
// response goes through this projection, so none of them can carry it.
const LINK_FIELDS = {
  id: true,
  instance_url: true,
  project_path: true,
  project_web_url: true,
  signing_token_set_at: true,
  last_delivery_at: true,
  last_failure_at: true,
  last_failure_reason: true,
  created_at: true,
} satisfies Prisma.board_gitlab_projectsSelect;

export type LinkRow = Prisma.board_gitlab_projectsGetPayload<{ select: typeof LINK_FIELDS }>;

export function findLinks(boardId: string): Promise<LinkRow[]> {
  return prisma.board_gitlab_projects.findMany({
    where: { board_id: boardId },
    select: LINK_FIELDS,
    orderBy: { created_at: "asc" },
  });
}

export function findLink(boardId: string, linkId: string): Promise<LinkRow | null> {
  return prisma.board_gitlab_projects.findFirst({
    where: { id: linkId, board_id: boardId },
    select: LINK_FIELDS,
  });
}

export function insertLink(
  boardId: string,
  link: { instance_url: string; project_path: string; created_by: string },
): Promise<LinkRow> {
  return prisma.board_gitlab_projects.create({
    data: { board_id: boardId, ...link },
    select: LINK_FIELDS,
  });
}

export async function setSigningToken(
  boardId: string,
  linkId: string,
  sealed: string,
  setAt: Date,
): Promise<number> {
  const { count } = await prisma.board_gitlab_projects.updateMany({
    where: { id: linkId, board_id: boardId },
    data: { signing_token_sealed: sealed, signing_token_set_at: setAt },
  });

  return count;
}

export async function deleteLink(boardId: string, linkId: string): Promise<number> {
  const { count } = await prisma.board_gitlab_projects.deleteMany({
    where: { id: linkId, board_id: boardId },
  });

  return count;
}

export interface DeliveryLink {
  id: string;
  board_id: string;
  instance_url: string;
  project_path: string;
  gitlab_project_id: bigint | null;
  signing_token_sealed: string | null;
}

// The one lookup not scoped by board: a webhook names only its link, and this
// is how its board is found. Nothing is trusted until the signature verifies.
export function findLinkForDelivery(linkId: string): Promise<DeliveryLink | null> {
  return prisma.board_gitlab_projects.findUnique({
    where: { id: linkId },
    select: {
      id: true,
      board_id: true,
      instance_url: true,
      project_path: true,
      gitlab_project_id: true,
      signing_token_sealed: true,
    },
  });
}

// The OR lets a concurrent first delivery from another project lose the pin
// instead of overwriting it.
export async function acceptDelivery(
  linkId: string,
  projectId: bigint,
  projectWebUrl: string,
  at: Date,
): Promise<number> {
  const { count } = await prisma.board_gitlab_projects.updateMany({
    where: { id: linkId, OR: [{ gitlab_project_id: null }, { gitlab_project_id: projectId }] },
    data: { gitlab_project_id: projectId, project_web_url: projectWebUrl, last_delivery_at: at },
  });

  return count;
}

export type DeliveryFailure = "headers" | "signature" | "timestamp" | "token" | "project" | "payload";

export async function recordFailure(linkId: string, reason: DeliveryFailure, at: Date): Promise<void> {
  await prisma.board_gitlab_projects.updateMany({
    where: { id: linkId },
    data: { last_failure_at: at, last_failure_reason: reason },
  });
}

// board_keys holds every key the board has had, so a reference written under
// a former key still resolves; a key another board holds, or a deleted board
// left behind, is simply not among this board's rows.
export async function boardKeysAmong(boardId: string, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();

  const rows = await prisma.board_keys.findMany({
    where: { board_id: boardId, key: { in: keys } },
    select: { key: true },
  });

  return new Set(rows.map((row) => row.key));
}

export async function todosByNumber(boardId: string, numbers: number[]): Promise<Map<number, string>> {
  if (numbers.length === 0) return new Map();

  const rows = await prisma.todos.findMany({
    where: { board_id: boardId, board_key: { in: numbers } },
    select: { id: true, board_key: true },
  });

  return new Map(rows.flatMap((row) => (row.board_key === null ? [] : [[row.board_key, row.id] as const])));
}

export interface CommitRecord {
  board_id: string;
  todo_id: string;
  link_id: string;
  sha: string;
  title: string;
  message: string;
  author_name: string;
  committed_at: Date;
  matched_ref: string;
}

export async function insertCommits(tx: Prisma.TransactionClient, rows: CommitRecord[]): Promise<number> {
  if (rows.length === 0) return 0;

  const { count } = await tx.todo_gitlab_commits.createMany({ data: rows, skipDuplicates: true });

  return count;
}

export interface BranchRecord {
  board_id: string;
  todo_id: string;
  link_id: string;
  name: string;
  matched_ref: string;
  head_sha: string;
  pushed_at: Date;
}

// The WHERE on the update is the ordering guard: a delivery GitLab sent
// earlier than the one already applied changes nothing, including reviving a
// branch deleted since.
export function upsertBranch(tx: Prisma.TransactionClient, row: BranchRecord): Promise<number> {
  return tx.$executeRaw`
    insert into todo_gitlab_branches (board_id, todo_id, link_id, name, matched_ref, head_sha, pushed_at)
    values (${row.board_id}::uuid, ${row.todo_id}::uuid, ${row.link_id}::uuid, ${row.name},
            ${row.matched_ref}, ${row.head_sha}, ${row.pushed_at})
    on conflict (todo_id, link_id, name) do update
      set head_sha = excluded.head_sha, pushed_at = excluded.pushed_at, deleted_at = null
      where todo_gitlab_branches.pushed_at <= excluded.pushed_at
  `;
}

export async function markBranchDeleted(
  tx: Prisma.TransactionClient,
  linkId: string,
  name: string,
  at: Date,
): Promise<number> {
  const { count } = await tx.todo_gitlab_branches.updateMany({
    where: { link_id: linkId, name, pushed_at: { lte: at } },
    data: { deleted_at: at, pushed_at: at },
  });

  return count;
}

export interface MergeRequestFields {
  title: string;
  state: string;
  source_branch: string;
  target_branch: string;
  gitlab_updated_at: Date;
}

export async function updateMergeRequest(
  tx: Prisma.TransactionClient,
  linkId: string,
  iid: number,
  fields: MergeRequestFields,
): Promise<number> {
  const { count } = await tx.todo_gitlab_merge_requests.updateMany({
    where: { link_id: linkId, iid, gitlab_updated_at: { lte: fields.gitlab_updated_at } },
    data: fields,
  });

  return count;
}

export interface MergeRequestRecord extends MergeRequestFields {
  board_id: string;
  todo_id: string;
  link_id: string;
  iid: number;
  matched_ref: string;
}

export async function insertMergeRequests(tx: Prisma.TransactionClient, rows: MergeRequestRecord[]): Promise<number> {
  if (rows.length === 0) return 0;

  const { count } = await tx.todo_gitlab_merge_requests.createMany({ data: rows, skipDuplicates: true });

  return count;
}

const PROJECT_FIELDS = {
  select: { instance_url: true, project_path: true, project_web_url: true },
} as const;

export async function findDevelopment(boardId: string, todoId: string, commitLimit: number | undefined) {
  const scope = { board_id: boardId, todo_id: todoId };

  const [commits, branches, mergeRequests, links] = await Promise.all([
    prisma.todo_gitlab_commits.findMany({
      where: scope,
      orderBy: [{ committed_at: "desc" }, { sha: "asc" }],
      ...(commitLimit !== undefined && { take: commitLimit }),
      select: {
        sha: true,
        title: true,
        message: true,
        author_name: true,
        committed_at: true,
        board_gitlab_projects: PROJECT_FIELDS,
      },
    }),
    prisma.todo_gitlab_branches.findMany({
      where: { ...scope, deleted_at: null },
      orderBy: [{ pushed_at: "desc" }, { name: "asc" }],
      select: { name: true, head_sha: true, pushed_at: true, board_gitlab_projects: PROJECT_FIELDS },
    }),
    prisma.todo_gitlab_merge_requests.findMany({
      where: scope,
      orderBy: [{ gitlab_updated_at: "desc" }, { iid: "desc" }],
      select: {
        iid: true,
        title: true,
        state: true,
        source_branch: true,
        target_branch: true,
        gitlab_updated_at: true,
        board_gitlab_projects: PROJECT_FIELDS,
      },
    }),
    prisma.board_gitlab_projects.findMany({
      where: { board_id: boardId },
      orderBy: { created_at: "asc" },
      ...PROJECT_FIELDS,
    }),
  ]);

  return { commits, branches, mergeRequests, links };
}
