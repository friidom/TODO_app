import { useQueries } from "@tanstack/react-query";

import { useBoards } from "@/services/boards/useBoards";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { getColumns } from "@/services/columns/columnsApi";
import { boardIdsInScope, type ViewScope } from "@/services/views/scope";
import type { IBoard, IColumn } from "@/types/data";

const EMPTY: IColumn[] = [];
const EMPTY_BOARDS: IBoard[] = [];

// The columns half of useScopedTodos, and deliberately its mirror image: one
// ["columns", boardId] entry per board in scope, the same cache entries the
// board page and every column mutation already write.
//
// A cross-board view needs these because "done" is a property of the COLUMN
// (category === "done"), not of the card — and there is no /columns collection
// endpoint to ask instead.
export function useScopedColumns(scope: ViewScope) {
  const { data: boards = EMPTY_BOARDS } = useBoards();

  const boardIds = boardIdsInScope(scope, boards);

  return useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.columns(boardId),
      queryFn: () => getColumns(boardId),
    })),

    combine: (results) => ({
      columns:
        results.length === 1
          ? (results[0].data ?? EMPTY)
          : results.flatMap((result) => result.data ?? EMPTY),

      isLoading: results.some((result) => result.isLoading),
    }),
  });
}
