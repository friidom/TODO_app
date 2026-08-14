import { useMutation, useQueryClient } from "@tanstack/react-query";

import { reorderTodos } from "@/services/todos/todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo } from "@/types/data";
import { applyTodoMoved } from "./cache";
import { useBoardId } from "@/hooks/useBoardId";

export interface TodoDropVars {
  /** The board as it stands before the drop. */
  todos: Todo[];
  activeTodo: Todo;
  /** Destination column. A drop without one is not a drop, so the caller narrows it. */
  columnId: string;
  /** Gap index within the destination column. */
  index: number;
}

/**
 * The drop write path.
 *
 * This used to be a plain async function that wrote the cache and then awaited
 * the upsert. A rejection left the board showing an order the database never
 * accepted — silently, because `onDragEnd` awaited it with no catch — until
 * something else refetched. As a mutation the optimistic write is paired with
 * a snapshot, so a failure puts the card back where it came from.
 */
export function useTodoDrop() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: ({ todos, activeTodo, columnId, index }: TodoDropVars) => {
      if (!boardId) throw new Error("useTodoDrop ran without a board");
      return reorderTodos(
        applyTodoMoved(todos, activeTodo, columnId, index),
        boardId,
      );
    },

    onMutate: async ({ todos, activeTodo, columnId, index }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos(boardId) });

      const previousTodos = queryClient.getQueryData<Todo[]>(
        queryKeys.todos(boardId),
      );

      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        applyTodoMoved(todos, activeTodo, columnId, index),
      );

      return { previousTodos };
    },

    // Restore only. The message comes from the MutationCache handler in
    // queryClient.ts; a toast here as well would report one failure twice.
    onError: (_err, _vars, context) => {
      if (!context) return;

      if (context.previousTodos) {
        queryClient.setQueryData(
          queryKeys.todos(boardId),
          context.previousTodos,
        );
        return;
      }

      // Nothing to restore: setQueryData(key, undefined) is a no-op, so the
      // optimistic order would survive the failure. Drop the entry and let
      // useTodos fetch the truth.
      queryClient.removeQueries({
        queryKey: queryKeys.todos(boardId),
        exact: true,
      });
    },
  });
}
