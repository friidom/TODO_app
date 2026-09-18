import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import { toNumber } from "../../lib/numeric.js";
import { RANK_GAP } from "../../lib/rank.js";

const COLUMN_FIELDS = {
  id: true,
  board_id: true,
  title: true,
  position: true,
  rank: true,
  category: true,
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

export async function findByBoard(boardId: string): Promise<ColumnRow[]> {
  const rows = await prisma.columns.findMany({
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

export async function lastOf(
  boardId: string,
): Promise<{ rank: number | null; position: number | null } | null> {
  const row = await prisma.columns.findFirst({
    where: { board_id: boardId },
    orderBy: [
      { rank: { sort: "desc", nulls: "last" } },
      { position: { sort: "desc", nulls: "last" } },
    ],
    select: { rank: true, position: true },
  });

  return row === null ? null : { rank: row.rank, position: toNumber(row.position) };
}

export interface ColumnInsert {
  boardId: string;
  title: string;
  category: string;
  position: number;
  rank: number;
}

export async function insert(
  tx: Prisma.TransactionClient,
  column: ColumnInsert,
): Promise<ColumnRow> {
  const row = await tx.columns.create({
    data: {
      board_id: column.boardId,
      title: column.title,
      category: column.category,
      position: BigInt(column.position),
      rank: column.rank,
    },
    select: COLUMN_FIELDS,
  });

  return toRow(row);
}

export interface ColumnPatch {
  title?: string | null;
  category?: string;
  min_limit?: number | null;
  max_limit?: number | null;
  rank?: number;
}

export async function update(
  tx: Prisma.TransactionClient,
  boardId: string,
  columnId: string,
  patch: ColumnPatch,
): Promise<number> {
  const { count } = await tx.columns.updateMany({
    where: { id: columnId, board_id: boardId },
    data: {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.category !== undefined && { category: patch.category }),
      ...(patch.min_limit !== undefined && { min_limit: patch.min_limit }),
      ...(patch.max_limit !== undefined && { max_limit: patch.max_limit }),
      ...(patch.rank !== undefined && { rank: patch.rank }),
    },
  });

  return count;
}

export async function remove(
  tx: Prisma.TransactionClient,
  boardId: string,
  columnId: string,
): Promise<number> {
  const { count } = await tx.columns.deleteMany({ where: { id: columnId, board_id: boardId } });

  return count;
}

export function countOnBoard(boardId: string): Promise<number> {
  return prisma.columns.count({ where: { board_id: boardId } });
}

// Respaces to 1-based multiples of RANK_GAP in the order the current keys
// already put the rows in, so a rebalance never reorders anything. The four
// sort keys are the same deterministic refinement the SQL used: a tie is what
// a rebalance is called to fix, so it must not be left to chance.
export async function rebalance(
  tx: Prisma.TransactionClient,
  boardId: string,
): Promise<number> {
  return tx.$executeRaw`
    with ordered as (
      select id,
             row_number() over (
               order by rank nulls last, position nulls last, created_at, id
             ) * ${RANK_GAP}::double precision as new_rank
        from columns
       where board_id = ${boardId}::uuid
    )
    update columns c
       set rank = ordered.new_rank
      from ordered
     where ordered.id = c.id
       and c.rank is distinct from ordered.new_rank`;
}
