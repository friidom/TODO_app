import { useQuery } from "@tanstack/react-query";

import { fetchTodoActivities } from "./activitiesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * One work item's own history, fetched only while its History or All tab is
 * open (M25).
 *
 * `enabled` on both ids for the same reason `useTodo`/`useComments` are: this
 * is the panel's history, not the board's, and it should cost nothing until
 * the task detail modal is actually open on this item.
 *
 * **Invalidated, unlike the board feed `useActivities` reads.** `useActivities`
 * documents a deliberate gap — nothing tells the client an activity row
 * appeared, because the log is trigger-written. This query closes that gap for
 * itself rather than waiting on realtime: `useUpdateTodo` and `useTodoDrop`
 * both invalidate `queryKeys.todoActivities(id)` in `onSuccess`, so a save made
 * from this exact item's own open modal refetches it. What is still missing is
 * a second person's concurrent edit showing up live — the same limitation the
 * board feed has, carried over rather than solved twice.
 */
export function useTodoActivities(
  todoId: string | undefined,
  boardId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.todoActivities(todoId),
    queryFn: () => fetchTodoActivities(boardId!, todoId!),
    enabled: Boolean(todoId) && Boolean(boardId),
  });
}
