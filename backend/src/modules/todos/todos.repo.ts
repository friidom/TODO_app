import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";
import { toNumber } from "../../lib/numeric.js";
import { RANK_GAP } from "../../lib/rank.js";

// TODO_FIELDS in src/types/data.ts, in its order. The board's narrow slice:
// description and creator_id are deliberately absent and only GET /todos/:id
// returns them.
const LIST_FIELDS = {
  id: true,
  board_id: true,
  column_id: true,
  position: true,
  rank: true,
  board_key: true,
  title: true,
  type: true,
  priority: true,
  start_date: true,
  due_date: true,
  assignee_id: true,
  estimate: true,
  parent_id: true,
  sprint_id: true,
  backlog_rank: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.todosSelect;

const DETAIL_FIELDS = {
  ...LIST_FIELDS,
  description: true,
  creator_id: true,
} satisfies Prisma.todosSelect;

type ListRecord = Prisma.todosGetPayload<{ select: typeof LIST_FIELDS }>;
type DetailRecord = Prisma.todosGetPayload<{ select: typeof DETAIL_FIELDS }>;

export type TodoRow = Omit<ListRecord, "position" | "estimate"> & {
  position: number | null;
  estimate: number | null;
};

export type TodoDetailRow = Omit<DetailRecord, "position" | "estimate"> & {
  position: number | null;
  estimate: number | null;
};

// position is int8 (bigint, which JSON.stringify throws on) and estimate is
// numeric (Decimal, which serialises as a string).
function toRow<T extends { position: bigint | null; estimate: Prisma.Decimal | null }>(
  record: T,
): Omit<T, "position" | "estimate"> & { position: number | null; estimate: number | null } {
  return { ...record, position: toNumber(record.position), estimate: toNumber(record.estimate) };
}

const ORDER = [
  { rank: { sort: "asc", nulls: "last" } },
  { position: { sort: "asc", nulls: "last" } },
  { created_at: "asc" },
  { id: "asc" },
] satisfies Prisma.todosOrderByWithRelationInput[];

export async function findByBoard(boardId: string): Promise<TodoRow[]> {
  const rows = await prisma.todos.findMany({
    where: { board_id: boardId },
    orderBy: ORDER,
    select: LIST_FIELDS,
  });

  return rows.map(toRow);
}

export async function findOne(boardId: string, todoId: string): Promise<TodoDetailRow | null> {
  const row = await prisma.todos.findFirst({
    where: { id: todoId, board_id: boardId },
    select: DETAIL_FIELDS,
  });

  return row === null ? null : toRow(row);
}

export async function lastInColumn(
  boardId: string,
  columnId: string,
): Promise<{ rank: number | null; position: number | null } | null> {
  const row = await prisma.todos.findFirst({
    where: { board_id: boardId, column_id: columnId },
    orderBy: [
      { rank: { sort: "desc", nulls: "last" } },
      { position: { sort: "desc", nulls: "last" } },
    ],
    select: { rank: true, position: true },
  });

  return row === null ? null : { rank: row.rank, position: toNumber(row.position) };
}

export interface TodoWrite {
  title?: string | null;
  column_id?: string | null;
  position?: number | null;
  rank?: number | null;
  backlog_rank?: number | null;
  type?: string;
  priority?: string | null;
  start_date?: Date | null;
  due_date?: Date | null;
  estimate?: number | null;
  assignee_id?: string | null;
  parent_id?: string | null;
  sprint_id?: string | null;
  description?: string | null;
}

// Named, never spread: creator_id, board_id, board_key and id are not writable
// from a body, and a spread would make every future column writable too.
function toData(write: TodoWrite): Prisma.todosUncheckedUpdateInput {
  return {
    ...(write.title !== undefined && { title: write.title }),
    ...(write.column_id !== undefined && { column_id: write.column_id }),
    ...(write.position !== undefined && {
      position: write.position === null ? null : BigInt(write.position),
    }),
    ...(write.rank !== undefined && { rank: write.rank }),
    ...(write.backlog_rank !== undefined && { backlog_rank: write.backlog_rank }),
    ...(write.type !== undefined && { type: write.type }),
    ...(write.priority !== undefined && { priority: write.priority }),
    ...(write.start_date !== undefined && { start_date: write.start_date }),
    ...(write.due_date !== undefined && { due_date: write.due_date }),
    ...(write.estimate !== undefined && { estimate: write.estimate }),
    ...(write.assignee_id !== undefined && { assignee_id: write.assignee_id }),
    ...(write.parent_id !== undefined && { parent_id: write.parent_id }),
    ...(write.sprint_id !== undefined && { sprint_id: write.sprint_id }),
    ...(write.description !== undefined && { description: write.description }),
  };
}

// Keyed on the COMPOUND unique (id, board_id), not on id alone. An id that
// belongs to another board misses the where, the insert hits the primary key,
// and the caller gets a 409 — rather than overwriting a row on a board they
// cannot see.
export async function upsert(
  tx: Prisma.TransactionClient,
  boardId: string,
  todoId: string,
  creatorId: string,
  write: TodoWrite,
): Promise<TodoDetailRow> {
  const data = toData(write);

  const row = await tx.todos.upsert({
    where: { id_board_id: { id: todoId, board_id: boardId } },
    create: {
      ...(data as Prisma.todosUncheckedCreateInput),
      id: todoId,
      board_id: boardId,
      creator_id: creatorId,
    },
    update: data,
    select: DETAIL_FIELDS,
  });

  return toRow(row);
}

export async function update(
  tx: Prisma.TransactionClient,
  boardId: string,
  todoId: string,
  write: TodoWrite,
): Promise<number> {
  const { count } = await tx.todos.updateMany({
    where: { id: todoId, board_id: boardId },
    data: toData(write),
  });

  return count;
}

export async function remove(
  tx: Prisma.TransactionClient,
  boardId: string,
  todoId: string,
): Promise<number> {
  const { count } = await tx.todos.deleteMany({ where: { id: todoId, board_id: boardId } });

  return count;
}

export function exists(boardId: string, todoId: string): Promise<boolean> {
  return prisma.todos
    .count({ where: { id: todoId, board_id: boardId }, take: 1 })
    .then((count) => count > 0);
}

// Appends the source column's cards after the destination's last card, in
// their existing order, writing BOTH keys — rank is the one that actually
// orders them on every client surface.
export async function rehomeColumn(
  tx: Prisma.TransactionClient,
  boardId: string,
  fromColumnId: string,
  toColumnId: string,
): Promise<number> {
  const last = await tx.todos.findFirst({
    where: { board_id: boardId, column_id: toColumnId },
    orderBy: [
      { rank: { sort: "desc", nulls: "last" } },
      { position: { sort: "desc", nulls: "last" } },
    ],
    select: { rank: true, position: true },
  });

  const startRank = (last?.rank ?? (toNumber(last?.position ?? null) ?? -1) * RANK_GAP) + RANK_GAP;
  const startPosition = (toNumber(last?.position ?? null) ?? -1) + 1;

  return tx.$executeRaw`
    with ordered as (
      select id,
             row_number() over (order by rank nulls last, position nulls last, created_at, id) - 1
               as rn
        from todos
       where board_id = ${boardId}::uuid
         and column_id = ${fromColumnId}::uuid
    )
    update todos t
       set column_id = ${toColumnId}::uuid,
           position  = ${startPosition}::bigint + ordered.rn,
           rank      = ${startRank}::double precision + ordered.rn * ${RANK_GAP}::double precision
      from ordered
     where ordered.id = t.id`;
}

export async function rebalanceColumn(
  tx: Prisma.TransactionClient,
  boardId: string,
  columnId: string,
): Promise<number> {
  return tx.$executeRaw`
    with ordered as (
      select id,
             row_number() over (
               order by rank nulls last, position nulls last, created_at, id
             ) * ${RANK_GAP}::double precision as new_rank
        from todos
       where board_id = ${boardId}::uuid
         and column_id = ${columnId}::uuid
    )
    update todos t
       set rank = ordered.new_rank
      from ordered
     where ordered.id = t.id
       and t.rank is distinct from ordered.new_rank`;
}
