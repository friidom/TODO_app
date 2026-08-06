import { useQuery } from "@tanstack/react-query";
import { fetchTodos } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

export function useTodos() {
  const boardId = useBoardId();

  return useQuery({
    queryKey: queryKeys.todos(boardId),
    // Keyed on the board rather than the user. useAuth is gone from here: the
    // route is already behind ProtectedRoute, RLS is the real boundary, and a
    // user_id filter would hide a teammate's cards once M3 shares boards.
    queryFn: () => {
      if (!boardId) throw new Error("useTodos ran without a board");
      return fetchTodos(boardId);
    },
    enabled: Boolean(boardId),
  });
}
