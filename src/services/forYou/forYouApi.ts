import { api, toQuery } from "../api/client";
import type { Activity } from "@/types/data";
import type { FeedTodo } from "./feed";

// The board filter lives server-side and is applied before the limit — without
// that the page fills with rows the caller cannot see and is then emptied.

export const FEED_PAGE = 25;

export const ACTIVITY_FEED_PAGE = 30;

export interface ActivityPerson {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface MyActivity {
  items: Activity[];
  people: Record<string, ActivityPerson>;
  live_todo_ids: string[];
}

export function fetchAssignedTodos(limit = FEED_PAGE): Promise<FeedTodo[]> {
  return api.get<FeedTodo[]>(`/me/feed${toQuery({ tab: "assigned", limit })}`);
}

export function fetchRecentTodos(limit = FEED_PAGE): Promise<FeedTodo[]> {
  return api.get<FeedTodo[]>(`/me/feed${toQuery({ tab: "recent", limit })}`);
}

// Ids and dates, so a card is dated by when you touched it rather than by its
// own updated_at. The limit counts activity rows, not cards.
export async function fetchWorkedOn(
  limit = FEED_PAGE * 4,
): Promise<Map<string, string>> {
  const entries = await api.get<{ id: string; at: string }[]>(
    `/me/worked-on${toQuery({ limit })}`,
  );

  return new Map(entries.map((entry) => [entry.id, entry.at]));
}

export function fetchTodosByIds(ids: string[]): Promise<FeedTodo[]> {
  if (ids.length === 0) return Promise.resolve([]);

  return api.get<FeedTodo[]>(`/me/todos${toQuery({ ids: ids.join(",") })}`);
}

export function fetchMyActivity(
  limit = ACTIVITY_FEED_PAGE,
): Promise<MyActivity> {
  return api.get<MyActivity>(`/me/activity${toQuery({ limit })}`);
}
