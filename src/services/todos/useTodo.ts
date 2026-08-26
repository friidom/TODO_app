import { useQuery } from "@tanstack/react-query";

import { fetchTodo } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useTodo(
  todoId: string | undefined,
  boardId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.todo(todoId),
    queryFn: () => fetchTodo(todoId!, boardId!),
    enabled: Boolean(todoId) && Boolean(boardId),
  });
}
