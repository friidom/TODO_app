import { useMutation, useQueryClient } from "@tanstack/react-query";

import { reorderTodos } from "@/services/todos/todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { ISupabaseTodo } from "@/types/data";
import { applyTodoDrop } from "./applyTodoDrop";

export interface TodoDropVars {
  /** The board as it stands before the drop. */
  todos: ISupabaseTodo[];
  activeTodo: ISupabaseTodo;
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

  return useMutation({
    mutationFn: ({ todos, activeTodo, columnId, index }: TodoDropVars) =>
      reorderTodos(applyTodoDrop(todos, activeTodo, columnId, index)),

    onMutate: async ({ todos, activeTodo, columnId, index }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos() });

      const previousTodos = queryClient.getQueryData<ISupabaseTodo[]>(
        queryKeys.todos(),
      );

      queryClient.setQueryData<ISupabaseTodo[]>(
        queryKeys.todos(),
        applyTodoDrop(todos, activeTodo, columnId, index),
      );

      return { previousTodos };
    },

    // Restore only. The message comes from the MutationCache handler in
    // queryClient.ts; a toast here as well would report one failure twice.
    onError: (_err, _vars, context) => {
      if (!context) return;

      if (context.previousTodos) {
        queryClient.setQueryData(queryKeys.todos(), context.previousTodos);
        return;
      }

      // Nothing to restore: setQueryData(key, undefined) is a no-op, so the
      // optimistic order would survive the failure. Drop the entry and let
      // useTodos fetch the truth.
      queryClient.removeQueries({ queryKey: queryKeys.todos(), exact: true });
    },
  });
}
