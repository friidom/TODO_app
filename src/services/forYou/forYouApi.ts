import { api, toQuery } from "../api/client";
import type { Todo } from "@/types/data";

// The board filter lives server-side and is applied before the limit — without
// that the page fills with rows the caller cannot see and is then emptied.

export const FEED_PAGE = 25;

export function fetchAssignedTodos(limit = FEED_PAGE): Promise<Todo[]> {
  return api.get<Todo[]>(`/me/feed${toQuery({ tab: "assigned", limit })}`);
}

export function fetchRecentTodos(limit = FEED_PAGE): Promise<Todo[]> {
  return api.get<Todo[]>(`/me/feed${toQuery({ tab: "recent", limit })}`);
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

export function fetchTodosByIds(ids: string[]): Promise<Todo[]> {
  if (ids.length === 0) return Promise.resolve([]);

  return api.get<Todo[]>(`/me/todos${toQuery({ ids: ids.join(",") })}`);
}
