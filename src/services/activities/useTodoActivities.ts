import { useQuery } from "@tanstack/react-query";

import { fetchTodoActivities } from "./activitiesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

// Invalidated by useUpdateTodo/useTodoDrop on success — unlike the trigger-written board feed useActivities reads, which nothing pings.
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
