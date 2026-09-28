import { useQueries } from "@tanstack/react-query";

import { useBoards } from "@/services/boards/useBoards";
import { boardIdsInScope, type ViewScope } from "@/services/views/scope";
import { workflowQuery } from "@/services/workflow/useWorkflow";
import type { IBoard, IStatus } from "@/types/data";

const EMPTY: IStatus[] = [];
const EMPTY_BOARDS: IBoard[] = [];

// The statuses half of useScopedTodos, and deliberately its mirror image: one
// ["workflow", boardId] entry per board in scope, the same cache entries the
// board page and every workflow publish already write.
//
// A cross-board view needs these because "done" is a property of the STATUS a
// card is in (category === "done"), not of the card — and there is no
// cross-board statuses endpoint to ask instead.
export function useScopedStatuses(scope: ViewScope) {
  const { data: boards = EMPTY_BOARDS } = useBoards();

  const boardIds = boardIdsInScope(scope, boards);

  return useQueries({
    queries: boardIds.map((boardId) => workflowQuery(boardId)),

    combine: (results) => ({
      statuses:
        results.length === 1
          ? (results[0].data?.statuses ?? EMPTY)
          : results.flatMap((result) => result.data?.statuses ?? EMPTY),

      isLoading: results.some((result) => result.isLoading),
    }),
  });
}
