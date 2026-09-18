import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

const SPRINT_FIELDS = {
  id: true,
  board_id: true,
  name: true,
  goal: true,
  start_date: true,
  end_date: true,
  state: true,
  rank: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.sprintsSelect;

export type SprintRow = Prisma.sprintsGetPayload<{ select: typeof SPRINT_FIELDS }>;

// findMany, never findUnique({ where: { board_id } }). sprints_one_active_per_board
// is a PARTIAL unique index and Prisma introspects it as a plain one, so the
// unique form type-checks and is wrong: a board has many sprints.
export function findByBoard(boardId: string): Promise<SprintRow[]> {
  return prisma.sprints.findMany({
    where: { board_id: boardId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: SPRINT_FIELDS,
  });
}

export function findOne(boardId: string, sprintId: string): Promise<SprintRow | null> {
  return prisma.sprints.findFirst({
    where: { id: sprintId, board_id: boardId },
    select: SPRINT_FIELDS,
  });
}

export function findActive(boardId: string): Promise<SprintRow | null> {
  return prisma.sprints.findFirst({
    where: { board_id: boardId, state: "active" },
    select: SPRINT_FIELDS,
  });
}

export function maxRank(boardId: string): Promise<number | null> {
  return prisma.sprints
    .aggregate({ where: { board_id: boardId }, _max: { rank: true } })
    .then((result) => result._max.rank);
}

export interface SprintInsert {
  boardId: string;
  name: string;
  goal: string | null;
  startDate: Date | null;
  endDate: Date | null;
  rank: number;
}

export function insert(
  tx: Prisma.TransactionClient,
  sprint: SprintInsert,
): Promise<SprintRow> {
  return tx.sprints.create({
    data: {
      board_id: sprint.boardId,
      name: sprint.name,
      goal: sprint.goal,
      start_date: sprint.startDate,
      end_date: sprint.endDate,
      rank: sprint.rank,
    },
    select: SPRINT_FIELDS,
  });
}

export interface SprintPatch {
  name?: string;
  goal?: string | null;
  start_date?: Date | null;
  end_date?: Date | null;
}

export async function update(
  tx: Prisma.TransactionClient,
  boardId: string,
  sprintId: string,
  patch: SprintPatch,
): Promise<number> {
  const { count } = await tx.sprints.updateMany({
    where: { id: sprintId, board_id: boardId },
    data: {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.goal !== undefined && { goal: patch.goal }),
      ...(patch.start_date !== undefined && { start_date: patch.start_date }),
      ...(patch.end_date !== undefined && { end_date: patch.end_date }),
    },
  });

  return count;
}

export async function setState(
  tx: Prisma.TransactionClient,
  boardId: string,
  sprintId: string,
  state: "active" | "completed",
): Promise<number> {
  const { count } = await tx.sprints.updateMany({
    where: { id: sprintId, board_id: boardId },
    data: { state },
  });

  return count;
}

export async function remove(
  tx: Prisma.TransactionClient,
  boardId: string,
  sprintId: string,
): Promise<number> {
  const { count } = await tx.sprints.deleteMany({ where: { id: sprintId, board_id: boardId } });

  return count;
}

// rank nulls last, then position — the ordering §10.6 names. byRank in the
// frontend reads a null rank as position * RANK_GAP instead, so the two can
// disagree on a legacy row with no rank; this one is authoritative.
export function firstTodoColumn(
  tx: Prisma.TransactionClient,
  boardId: string,
): Promise<{ id: string } | null> {
  return tx.columns.findFirst({
    where: { board_id: boardId, category: "todo" },
    orderBy: [
      { rank: { sort: "asc", nulls: "last" } },
      { position: { sort: "asc", nulls: "last" } },
    ],
    select: { id: true },
  });
}

// Only items with no column: starting a sprint must not move a card sideways.
export async function placeUncolumnedItems(
  tx: Prisma.TransactionClient,
  boardId: string,
  sprintId: string,
  columnId: string,
): Promise<number> {
  const { count } = await tx.todos.updateMany({
    where: { board_id: boardId, sprint_id: sprintId, column_id: null },
    data: { column_id: columnId },
  });

  return count;
}

// Everything not sitting in a done-category column. column_id is deliberately
// left alone for both outcomes: a card sent to the backlog keeps its column and
// stays on the board, which is isOnBoard's rule.
export async function rehomeUnfinished(
  tx: Prisma.TransactionClient,
  boardId: string,
  sprintId: string,
  destination: string | null,
): Promise<number> {
  const doneColumns = await tx.columns.findMany({
    where: { board_id: boardId, category: "done" },
    select: { id: true },
  });

  const doneIds = doneColumns.map((column) => column.id);

  const { count } = await tx.todos.updateMany({
    where: {
      board_id: boardId,
      sprint_id: sprintId,
      // The null branch is not redundant: SQL NOT IN yields NULL for a null
      // column_id, which excludes the row, while the original NOT EXISTS
      // included it. A backlog item in the sprint is unfinished work.
      OR: [{ column_id: null }, { column_id: { notIn: doneIds } }],
    },
    data: { sprint_id: destination },
  });

  return count;
}
