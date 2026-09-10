import { useMutation, useQueryClient } from "@tanstack/react-query";

import { moveTodo, rebalanceColumnRanks } from "@/services/todos/todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo } from "@/types/data";
import { rankForDrop } from "@/utils/rank";
import { applyTodoMoved } from "./cache";
import { isGenuineSubtask } from "./subtasks";
import { useBoardId } from "@/hooks/useBoardId";

export interface TodoDropVars {
  todos: Todo[];
  activeTodo: Todo;
  columnId: string;
  index: number;
}

export function useTodoDrop() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  const resolveRank = async ({
    todos,
    activeTodo,
    columnId,
    index,
  }: TodoDropVars) => {
    // exclude itself (can't be its own neighbour) and genuine subtasks (carry a column but aren't a board neighbour)
    const destination = todos.filter(
      (todo) =>
        todo.column_id === columnId &&
        todo.id !== activeTodo.id &&
        !isGenuineSubtask(todos, todo),
    );

    const rank = rankForDrop(destination, index);

    if (rank !== null) return rank;

    await rebalanceColumnRanks(columnId);

    // refetch, not recompute — the server just rewrote every rank in this column
    const fresh =
      (await queryClient.fetchQuery<Todo[]>({
        queryKey: queryKeys.todos(boardId),
      })) ?? [];

    const respaced = fresh.filter(
      (todo) =>
        todo.column_id === columnId &&
        todo.id !== activeTodo.id &&
        !isGenuineSubtask(fresh, todo),
    );

    const retried = rankForDrop(respaced, index);

    if (retried === null) {
      throw new Error("Could not find room for the card after rebalancing");
    }

    return retried;
  };

  return useMutation({
    mutationFn: async (vars: TodoDropVars) => {
      if (!boardId) throw new Error("useTodoDrop ran without a board");

      const rank = await resolveRank(vars);

      await moveTodo({
        id: vars.activeTodo.id,
        boardId,
        columnId: vars.columnId,
        rank,
      });

      return rank;
    },

    onMutate: async ({ todos, activeTodo, columnId, index }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos(boardId) });

      const previousTodos = queryClient.getQueryData<Todo[]>(
        queryKeys.todos(boardId),
      );

      // recomputed sync (not shared with mutationFn, which can go async on rebalance) — null means no room,
      // card stays put until onSuccess lands it, rare enough to be invisible
      const all = todos ?? [];
      const rank = rankForDrop(
        all.filter(
          (todo) =>
            todo.column_id === columnId &&
            todo.id !== activeTodo.id &&
            !isGenuineSubtask(all, todo),
        ),
        index,
      );

      if (rank !== null) {
        queryClient.setQueryData<Todo[]>(
          queryKeys.todos(boardId),
          applyTodoMoved(todos, activeTodo, columnId, rank),
        );
      }

      return { previousTodos };
    },

    onSuccess: (rank, { activeTodo, columnId }) => {
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old) =>
        old ? applyTodoMoved(old, activeTodo, columnId, rank) : old,
      );

      // no-op unless this item's history tab is open and observing the query
      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(activeTodo.id),
      });
    },

    // restore only — the toast comes from the global MutationCache handler
    onError: (_err, _vars, context) => {
      if (!context) return;

      if (context.previousTodos) {
        queryClient.setQueryData(
          queryKeys.todos(boardId),
          context.previousTodos,
        );
        return;
      }

      // nothing to restore to — drop the entry instead of leaving the optimistic order in place
      queryClient.removeQueries({
        queryKey: queryKeys.todos(boardId),
        exact: true,
      });
    },
  });
}
