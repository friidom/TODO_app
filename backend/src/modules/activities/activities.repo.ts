import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

const ACTIVITY_FIELDS = {
  id: true,
  board_id: true,
  actor_id: true,
  entity_type: true,
  entity_id: true,
  action: true,
  payload: true,
  created_at: true,
} satisfies Prisma.activitiesSelect;

export type ActivityRow = Prisma.activitiesGetPayload<{ select: typeof ACTIVITY_FIELDS }>;

// Newest first, and capped: activities has no retention policy, so the limit
// bounds the query rather than just the render.
export function findByBoard(boardId: string, limit: number): Promise<ActivityRow[]> {
  return prisma.activities.findMany({
    where: { board_id: boardId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit,
    select: ACTIVITY_FIELDS,
  });
}

// entity_type is part of the filter, not decoration: without it a member event
// whose entity_id happened to equal this todo's id would appear in the card's
// history.
export function findByTodo(
  boardId: string,
  todoId: string,
  limit?: number,
): Promise<ActivityRow[]> {
  return prisma.activities.findMany({
    where: { board_id: boardId, entity_type: "todo", entity_id: todoId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    ...(limit !== undefined && { take: limit }),
    select: ACTIVITY_FIELDS,
  });
}

export function findTodoIdsWorkedOn(
  actorId: string,
  boardIds: string[],
  limit: number,
): Promise<{ entity_id: string | null; created_at: Date }[]> {
  return prisma.activities.findMany({
    where: {
      actor_id: actorId,
      entity_type: "todo",
      board_id: { in: boardIds },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit,
    select: { entity_id: true, created_at: true },
  });
}
