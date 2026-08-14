import { useQuery } from "@tanstack/react-query";

import { fetchTodo } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

/**
 * One work item's complete row — fetched only while the detail panel is open.
 *
 * `enabled` is the whole point. The board holds twelve columns per card
 * (M5-07); this is the thirteenth-and-up, for one card, and it should cost
 * nothing until someone asks. Closing the panel clears `todoId`, the query goes
 * idle, and `gcTime` drops the entry.
 *
 * A `null` result is a real answer, not a failure: `fetchTodo` scopes by board,
 * so a deep link to a deleted task or to one on another board resolves to null
 * and the panel renders its not-found state.
 */
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
