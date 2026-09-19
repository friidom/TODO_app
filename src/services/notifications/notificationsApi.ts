import { api, toQuery } from "../api/client";
import type { Notification } from "./notifications";

// Every endpoint here is scoped to the caller server-side — there is no user id
// to pass, and passing one would be a second definition of "mine".

export const NOTIFICATION_PAGE = 50;

export function fetchNotifications(): Promise<Notification[]> {
  return api.get<Notification[]>(
    `/notifications${toQuery({ limit: NOTIFICATION_PAGE })}`,
  );
}

// A count rather than a page, so the badge doesn't cap at NOTIFICATION_PAGE.
export async function fetchUnreadCount(): Promise<number> {
  const { count } = await api.get<{ count: number }>("/notifications/unread-count");

  return count;
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  await api.post<{ marked: number }>("/notifications/read", { ids });
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post<{ marked: number }>("/notifications/read-all");
}
