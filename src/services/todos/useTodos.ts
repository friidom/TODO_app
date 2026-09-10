import { useQuery } from "@tanstack/react-query";
import { fetchTodos } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

export function useTodos() {
  const boardId = useBoardId();

  return useQuery({
    queryKey: queryKeys.todos(boardId),
    // keyed on the board, not the user — RLS is the real boundary, a user_id filter here would hide teammates' cards
    queryFn: () => {
      if (!boardId) throw new Error("useTodos ran without a board");
      return fetchTodos(boardId);
    },
    enabled: Boolean(boardId),
  });
}
