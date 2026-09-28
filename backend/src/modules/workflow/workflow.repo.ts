import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

const STATUS_FIELDS = {
  id: true,
  board_id: true,
  column_id: true,
  name: true,
  category: true,
  rank: true,
  is_hidden: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.statusesSelect;

export type StatusRow = Prisma.statusesGetPayload<{ select: typeof STATUS_FIELDS }>;

export function findByBoard(
  boardId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<StatusRow[]> {
  return db.statuses.findMany({
    where: { board_id: boardId },
    orderBy: [{ rank: "asc" }, { created_at: "asc" }, { id: "asc" }],
    select: STATUS_FIELDS,
  });
}

export async function versionOf(
  boardId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<number | null> {
  const board = await db.boards.findUnique({
    where: { id: boardId },
    select: { workflow_version: true },
  });

  return board?.workflow_version ?? null;
}

// The compare and the bump are one UPDATE, and its row lock is held until the
// publish commits. A second publish naming the same version waits on that lock,
// then re-reads the row, no longer matches, and changes nothing.
export async function claimVersion(
  tx: Prisma.TransactionClient,
  boardId: string,
  expected: number,
): Promise<boolean> {
  const { count } = await tx.boards.updateMany({
    where: { id: boardId, workflow_version: expected },
    data: { workflow_version: { increment: 1 } },
  });

  return count === 1;
}

// Uniqueness is checked at COMMIT for the rest of this transaction, so a
// publish may swap two names or reuse a deleted status's name in any order.
export async function deferNameUniqueness(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`set constraints statuses_board_id_name_key deferred`;
}

export async function cardCounts(
  tx: Prisma.TransactionClient,
  boardId: string,
): Promise<Map<string, number>> {
  const rows = await tx.todos.groupBy({
    by: ["status_id"],
    where: { board_id: boardId, status_id: { not: null } },
    _count: { _all: true },
  });

  return new Map(
    rows.flatMap((row) => (row.status_id === null ? [] : [[row.status_id, row._count._all]])),
  );
}

export interface StatusStructure {
  id: string;
  column_id: string;
  name: string;
  category: string;
  rank: number;
  is_hidden: boolean;
}

export async function insertMany(
  tx: Prisma.TransactionClient,
  boardId: string,
  statuses: StatusStructure[],
): Promise<void> {
  if (statuses.length === 0) return;

  await tx.statuses.createMany({
    data: statuses.map((status) => ({ ...status, board_id: boardId })),
  });
}

export async function updateStructure(
  tx: Prisma.TransactionClient,
  boardId: string,
  change: Pick<StatusStructure, "id"> & Partial<Omit<StatusStructure, "id">>,
): Promise<number> {
  const { count } = await tx.statuses.updateMany({
    where: { id: change.id, board_id: boardId },
    data: {
      ...(change.column_id !== undefined && { column_id: change.column_id }),
      ...(change.name !== undefined && { name: change.name }),
      ...(change.category !== undefined && { category: change.category }),
      ...(change.rank !== undefined && { rank: change.rank }),
      ...(change.is_hidden !== undefined && { is_hidden: change.is_hidden }),
    },
  });

  return count;
}

export async function removeMany(
  tx: Prisma.TransactionClient,
  boardId: string,
  statusIds: string[],
): Promise<number> {
  if (statusIds.length === 0) return 0;

  const { count } = await tx.statuses.deleteMany({
    where: { board_id: boardId, id: { in: statusIds } },
  });

  return count;
}

export interface StatusPlacement {
  id: string;
  column_id: string;
  category: string;
  is_hidden: boolean;
}

// The narrow read every status write needs: where a status sits, what it
// means, and whether it may receive work.
export async function placementsOf(
  boardId: string,
  statusIds: string[],
): Promise<Map<string, StatusPlacement>> {
  const rows = await prisma.statuses.findMany({
    where: { board_id: boardId, id: { in: statusIds } },
    select: { id: true, column_id: true, category: true, is_hidden: true },
  });

  return new Map(rows.map((row) => [row.id, row]));
}

// Hidden statuses cannot receive work, so a stage present only through hidden
// statuses is not one a card can be asked to pass through.
export async function visibleCategoriesOnBoard(boardId: string): Promise<string[]> {
  const rows = await prisma.statuses.findMany({
    where: { board_id: boardId, is_hidden: false },
    select: { category: true },
    distinct: ["category"],
  });

  return rows.map((row) => row.category);
}
