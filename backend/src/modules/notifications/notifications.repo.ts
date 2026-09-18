import type { Prisma } from "@prisma/client";

import { prisma } from "../../db/prisma.js";

const NOTIFICATION_FIELDS = {
  id: true,
  user_id: true,
  type: true,
  board_id: true,
  entity_type: true,
  entity_id: true,
  actor_id: true,
  payload: true,
  read_at: true,
  created_at: true,
} satisfies Prisma.notificationsSelect;

export type NotificationRow = Prisma.notificationsGetPayload<{
  select: typeof NOTIFICATION_FIELDS;
}>;

// userId first and required, the same shape boardId has elsewhere: it is part
// of every query rather than a check before one, so "mine" cannot be forgotten.
export function findForUser(userId: string, limit: number): Promise<NotificationRow[]> {
  return prisma.notifications.findMany({
    where: { user_id: userId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit,
    select: NOTIFICATION_FIELDS,
  });
}

export function countUnread(userId: string): Promise<number> {
  return prisma.notifications.count({ where: { user_id: userId, read_at: null } });
}

// read_at is the only column any endpoint writes. The legacy UPDATE policy
// carried WITH CHECK as well as USING so a row could not be updated into
// someone else's inbox; naming one column is what replaces it.
export async function markRead(userId: string, ids: string[]): Promise<number> {
  const { count } = await prisma.notifications.updateMany({
    where: { user_id: userId, read_at: null, id: { in: ids } },
    data: { read_at: new Date() },
  });

  return count;
}

export async function markAllRead(userId: string): Promise<number> {
  const { count } = await prisma.notifications.updateMany({
    where: { user_id: userId, read_at: null },
    data: { read_at: new Date() },
  });

  return count;
}
