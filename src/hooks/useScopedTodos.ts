import { useQueries } from "@tanstack/react-query";

import { useBoards } from "@/services/boards/useBoards";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { fetchTodos } from "@/services/todos/todoApi";
import { boardIdsInScope, type ViewScope } from "@/services/views/scope";
import type { IBoard, Todo } from "@/types/data";

const EMPTY: Todo[] = [];
const EMPTY_BOARDS: IBoard[] = [];

// one useQueries entry per board, the same cache entries useTodos() reads — so optimistic patches show up here for free
export function useScopedTodos(scope: ViewScope) {
  const { data: boards = EMPTY_BOARDS } = useBoards();

  const boardIds = boardIdsInScope(scope, boards);

  return useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.todos(boardId),
      queryFn: () => fetchTodos(boardId),
    })),

    combine: (results) => ({
      // returns the single result's own array when there's one board, so downstream memos see a stable reference
      todos:
        results.length === 1
          ? (results[0].data ?? EMPTY)
          : results.flatMap((result) => result.data ?? EMPTY),

      isLoading: results.some((result) => result.isLoading),
      error: results.find((result) => result.error)?.error ?? null,
    }),
  });
}
