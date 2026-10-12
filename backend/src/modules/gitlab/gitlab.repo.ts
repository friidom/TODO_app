import { Prisma } from "@prisma/client";

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

// A space's link, or a board's link from before 0035. Every lookup and write
// through the settings routes carries one, so a link id from another space or
// board is missing rather than found.
export type LinkOwner = { space_id: string } | { board_id: string };

const ACTIVE = { disconnected_at: null } as const;

// findFirst, never findUnique: space_id is unique only among active links.
export function findSpaceLink(spaceId: string): Promise<LinkRow | null> {
  return prisma.board_gitlab_projects.findFirst({
    where: { space_id: spaceId, ...ACTIVE },
    select: LINK_FIELDS,
  });
}

export function findBoardLinks(boardId: string): Promise<LinkRow[]> {
  return prisma.board_gitlab_projects.findMany({
    where: { board_id: boardId, ...ACTIVE },
    select: LINK_FIELDS,
    orderBy: { created_at: "asc" },
  });
}

export function findBoardLinksInSpace(spaceId: string) {
  return prisma.board_gitlab_projects.findMany({
    where: { boards: { space_id: spaceId }, ...ACTIVE },
    select: { ...LINK_FIELDS, boards: { select: { id: true, title: true, key_prefix: true } } },
    orderBy: { created_at: "asc" },
  });
}

export function findLink(owner: LinkOwner, linkId: string): Promise<LinkRow | null> {
  return prisma.board_gitlab_projects.findFirst({
    where: { id: linkId, ...owner, ...ACTIVE },
    select: LINK_FIELDS,
  });
}

export function insertLink(
  tx: Prisma.TransactionClient,
  spaceId: string,
  link: { instance_url: string; project_path: string; created_by: string },
): Promise<LinkRow> {
  return tx.board_gitlab_projects.create({
    data: { space_id: spaceId, ...link },
    select: LINK_FIELDS,
  });
}

export async function setSigningToken(
  owner: LinkOwner,
  linkId: string,
  sealed: string,
  setAt: Date,
): Promise<number> {
  const { count } = await prisma.board_gitlab_projects.updateMany({
    where: { id: linkId, ...owner, ...ACTIVE },
    data: { signing_token_sealed: sealed, signing_token_set_at: setAt },
  });

  return count;
}

const DISCONNECTED = (at: Date) => ({
  disconnected_at: at,
  signing_token_sealed: null,
  signing_token_set_at: null,
});

export async function disconnectLink(owner: LinkOwner, linkId: string, at: Date): Promise<number> {
  const { count } = await prisma.board_gitlab_projects.updateMany({
    where: { id: linkId, ...owner, ...ACTIVE },
    data: DISCONNECTED(at),
  });

  return count;
}

// The space's own link and every board link on a board filed in it.
export async function disconnectEverythingInSpace(
  tx: Prisma.TransactionClient,
  spaceId: string,
  at: Date,
): Promise<number> {
  const { count } = await tx.board_gitlab_projects.updateMany({
    where: { OR: [{ space_id: spaceId }, { boards: { space_id: spaceId } }], ...ACTIVE },
    data: DISCONNECTED(at),
  });

  return count;
}

export async function spaceIdOf(boardId: string): Promise<string | null> {
  const board = await prisma.boards.findUnique({ where: { id: boardId }, select: { space_id: true } });

  return board?.space_id ?? null;
}

export async function boardIdsInSpace(spaceId: string): Promise<string[]> {
  const boards = await prisma.boards.findMany({ where: { space_id: spaceId }, select: { id: true } });

  return boards.map((board) => board.id);
}

export interface DeliveryLink {
  id: string;
  space_id: string | null;
  board_id: string | null;
  instance_url: string;
  project_path: string;
  gitlab_project_id: bigint | null;
  signing_token_sealed: string | null;
}

// The one lookup not scoped by owner: a webhook names only its link, and this
// is how its space or board is found. Nothing is trusted until the signature
// verifies.
export function findLinkForDelivery(linkId: string): Promise<DeliveryLink | null> {
  return prisma.board_gitlab_projects.findFirst({
    where: { id: linkId, ...ACTIVE },
    select: {
      id: true,
      space_id: true,
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

// board_keys holds every key a board has had, so a reference written under a
// former key still resolves to the board that held it — and to nothing if
// that board is not among the ones asked about.
export async function boardsByKey(boardIds: string[], keys: string[]): Promise<Map<string, string>> {
  if (boardIds.length === 0 || keys.length === 0) return new Map();

  const rows = await prisma.board_keys.findMany({
    where: { key: { in: keys }, board_id: { in: boardIds } },
    select: { key: true, board_id: true },
  });

  return new Map(rows.flatMap((row) => (row.board_id === null ? [] : [[row.key, row.board_id] as const])));
}

export function todosByNumber(numbersByBoard: Map<string, number[]>) {
  if (numbersByBoard.size === 0) return Promise.resolve([]);

  return prisma.todos.findMany({
    where: {
      OR: [...numbersByBoard].map(([boardId, numbers]) => ({ board_id: boardId, board_key: { in: numbers } })),
    },
    select: { id: true, board_id: true, board_key: true },
  });
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

export async function insertCommits(tx: Prisma.TransactionClient, rows: CommitRecord[]): Promise<string[]> {
  if (rows.length === 0) return [];

  const created = await tx.todo_gitlab_commits.createManyAndReturn({
    data: rows,
    skipDuplicates: true,
    select: { board_id: true },
  });

  return created.map((row) => row.board_id);
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
): Promise<string[]> {
  const updated = await tx.todo_gitlab_branches.updateManyAndReturn({
    where: { link_id: linkId, name, pushed_at: { lte: at } },
    data: { deleted_at: at, pushed_at: at },
    select: { board_id: true },
  });

  return updated.map((row) => row.board_id);
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
): Promise<string[]> {
  const updated = await tx.todo_gitlab_merge_requests.updateManyAndReturn({
    where: { link_id: linkId, iid, gitlab_updated_at: { lte: fields.gitlab_updated_at } },
    data: fields,
    select: { board_id: true },
  });

  return updated.map((row) => row.board_id);
}

export interface MergeRequestRecord extends MergeRequestFields {
  board_id: string;
  todo_id: string;
  link_id: string;
  iid: number;
  matched_ref: string;
}

export async function insertMergeRequests(
  tx: Prisma.TransactionClient,
  rows: MergeRequestRecord[],
): Promise<string[]> {
  if (rows.length === 0) return [];

  const created = await tx.todo_gitlab_merge_requests.createManyAndReturn({
    data: rows,
    skipDuplicates: true,
    select: { board_id: true },
  });

  return created.map((row) => row.board_id);
}

const HISTORY_TABLES = [
  ["todo_gitlab_commits", "sha"],
  ["todo_gitlab_branches", "name"],
  ["todo_gitlab_merge_requests", "iid"],
] as const;

// Rows that disconnected links recorded for the same GitLab project, on boards
// now in this link's space, move to this link: the next delivery then updates
// a merge request or deletes a branch in place instead of adding a second row
// beside a stale one. A row this link already holds is left where it is.
export async function adoptHistory(
  link: { id: string; space_id: string; instance_url: string },
  projectId: bigint,
): Promise<void> {
  await prisma.$transaction(
    HISTORY_TABLES.map(([table, key]) => {
      const rows = Prisma.raw(table);
      const column = Prisma.raw(key);

      return prisma.$executeRaw`
        update ${rows} r
           set link_id = ${link.id}::uuid
          from board_gitlab_projects old, boards b
         where r.link_id = old.id
           and old.id <> ${link.id}::uuid
           and old.disconnected_at is not null
           and old.instance_url = ${link.instance_url}
           and old.gitlab_project_id = ${projectId}
           and b.id = r.board_id
           and b.space_id = ${link.space_id}::uuid
           and not exists (
                 select 1 from ${rows} kept
                  where kept.todo_id = r.todo_id
                    and kept.link_id = ${link.id}::uuid
                    and kept.${column} = r.${column}
               )
      `;
    }),
  );
}

const PROJECT_FIELDS = {
  select: { instance_url: true, project_path: true, project_web_url: true },
} as const;

// Every row on the task, whichever link recorded it and whether or not that
// link is still connected: disconnecting keeps history.
export async function findDevelopment(boardId: string, todoId: string, commitLimit: number | undefined) {
  const scope = { board_id: boardId, todo_id: todoId };

  const [commits, branches, mergeRequests] = await Promise.all([
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
  ]);

  return { commits, branches, mergeRequests };
}
