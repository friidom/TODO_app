import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import { toNumber } from "../../lib/numeric.js";

const COLUMN_FIELDS = {
  id: true,
  board_id: true,
  title: true,
  position: true,
  rank: true,
  min_limit: true,
  max_limit: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.columnsSelect;

type ColumnRecord = Prisma.columnsGetPayload<{ select: typeof COLUMN_FIELDS }>;

export interface ColumnRow extends Omit<ColumnRecord, "position"> {
  position: number | null;
}

// position is int8, which Prisma returns as a bigint and JSON.stringify throws on.
function toRow(record: ColumnRecord): ColumnRow {
  return { ...record, position: toNumber(record.position) };
}

const ORDER = [
  { rank: { sort: "asc", nulls: "last" } },
  { position: { sort: "asc", nulls: "last" } },
  { id: "asc" },
] satisfies Prisma.columnsOrderByWithRelationInput[];

export async function findByBoard(
  boardId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<ColumnRow[]> {
  const rows = await db.columns.findMany({
    where: { board_id: boardId },
    orderBy: ORDER,
    select: COLUMN_FIELDS,
  });

  return rows.map(toRow);
}

export async function findOne(boardId: string, columnId: string): Promise<ColumnRow | null> {
  const row = await prisma.columns.findFirst({
    where: { id: columnId, board_id: boardId },
    select: COLUMN_FIELDS,
  });

  return row === null ? null : toRow(row);
}

// Limits only. A column's title, order and existence belong to the workflow
// and change through a publish, never through a general patch.
export interface ColumnLimitsPatch {
  min_limit?: number | null;
  max_limit?: number | null;
}

export async function updateLimits(
  tx: Prisma.TransactionClient,
  boardId: string,
  columnId: string,
  patch: ColumnLimitsPatch,
): Promise<number> {
  const { count } = await tx.columns.updateMany({
    where: { id: columnId, board_id: boardId },
    data: {
      ...(patch.min_limit !== undefined && { min_limit: patch.min_limit }),
      ...(patch.max_limit !== undefined && { max_limit: patch.max_limit }),
    },
  });

  return count;
}

export interface ColumnStructure {
  id: string;
  title: string;
  rank: number;
  position: number;
}

export async function insertMany(
  tx: Prisma.TransactionClient,
  boardId: string,
  columns: ColumnStructure[],
): Promise<void> {
  if (columns.length === 0) return;

  await tx.columns.createMany({
    data: columns.map((column) => ({
      id: column.id,
      board_id: boardId,
      title: column.title,
      rank: column.rank,
      position: BigInt(column.position),
    })),
  });
}

export async function updateStructure(
  tx: Prisma.TransactionClient,
  boardId: string,
  change: Pick<ColumnStructure, "id"> & Partial<Omit<ColumnStructure, "id">>,
): Promise<number> {
  const { count } = await tx.columns.updateMany({
    where: { id: change.id, board_id: boardId },
    data: {
      ...(change.title !== undefined && { title: change.title }),
      ...(change.rank !== undefined && { rank: change.rank }),
      ...(change.position !== undefined && { position: BigInt(change.position) }),
    },
  });

  return count;
}

export async function removeMany(
  tx: Prisma.TransactionClient,
  boardId: string,
  columnIds: string[],
): Promise<number> {
  if (columnIds.length === 0) return 0;

  const { count } = await tx.columns.deleteMany({
    where: { board_id: boardId, id: { in: columnIds } },
  });

  return count;
}
