import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateTodo } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

/**
 * Move a card to another column from its menu.
 *
 * Goes through `updateTodo` rather than a `updateTodoColumn` of its own. That
 * one was a plain `.update()`, which matches nothing while a freshly created
 * card's INSERT is still in flight — so "Change status" on a new card silently
 * did nothing until a reload. The shared patch is an upsert and has no such
 * window.
 */
export function useUpdateTodoColumn() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: ({ id, column_id }: { id: string; column_id: string }) => {
      if (!boardId) throw new Error("useUpdateTodoColumn ran without a board");

      return updateTodo({ id, board_id: boardId, column_id });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) });
    },
  });
}
