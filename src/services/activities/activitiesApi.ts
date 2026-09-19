import { api, toQuery } from "../api/client";
import type { Activity } from "@/types/data";

// activities has no natural bound (no retention policy), so this caps the query, not just the render
export const ACTIVITY_PAGE = 50;

// read-only on purpose — activities is trigger-written and has no write endpoint at all
export function fetchActivities(boardId: string): Promise<Activity[]> {
  return api.get<Activity[]>(
    `/boards/${boardId}/activities${toQuery({ limit: ACTIVITY_PAGE })}`,
  );
}

// Unbounded on purpose: a default limit here would silently truncate a busy
// card's history.
export function fetchTodoActivities(
  _boardId: string,
  todoId: string,
): Promise<Activity[]> {
  return api.get<Activity[]>(`/todos/${todoId}/activities`);
}
