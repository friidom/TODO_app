import i18n from "@/components/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { moveTodo, rebalanceColumnRanks } from "@/services/todos/todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import {
  EMPTY_WORKFLOW,
  columnIdOf,
  type StatusIndex,
} from "@/services/workflow/statuses";
import type { Todo } from "@/types/data";
import { rankForDrop } from "@/utils/rank";
import { applyTodoMoved } from "./cache";
import { isGenuineSubtask } from "./subtasks";
import { useBoardId } from "@/hooks/useBoardId";

export interface TodoDropVars {
  todos: Todo[];
  activeTodo: Todo;
  // The column the card lands in, and the status it takes there. The rank is
  // a place among the COLUMN's cards, whichever of its statuses they are in.
  columnId: string;
  statusId: string;
  index: number;
  // Keeps the card exactly where it is — a status change inside its own column.
  rank?: number;
}

// A column's cards other than the one moving, and never a genuine subtask (it
// carries a status but is not a board neighbour).
function neighboursIn(
  todos: Todo[],
  columnId: string,
  activeTodo: Todo,
  statusById: StatusIndex,
): Todo[] {
  return todos.filter(
    (todo) =>
      columnIdOf(todo, statusById) === columnId &&
      todo.id !== activeTodo.id &&
      !isGenuineSubtask(todos, todo),
  );
}

export function useTodoDrop() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();

  const resolveRank = async ({
    todos,
    activeTodo,
    columnId,
    index,
    rank,
  }: TodoDropVars) => {
    if (rank !== undefined) return rank;

    const direct = rankForDrop(
      neighboursIn(todos, columnId, activeTodo, workflow.statusById),
      index,
    );

    if (direct !== null) return direct;

    // A drag cannot start without a board in the route, so this is a type
    // narrowing rather than a reachable state.
    if (!boardId) throw new Error("Cannot rebalance without a board");

    await rebalanceColumnRanks(boardId, columnId);

    // refetch, not recompute — the server just rewrote every rank in this column
    const fresh =
      (await queryClient.fetchQuery<Todo[]>({
        queryKey: queryKeys.todos(boardId),
      })) ?? [];

    const retried = rankForDrop(
      neighboursIn(fresh, columnId, activeTodo, workflow.statusById),
      index,
    );

    if (retried === null) {
      throw new Error(i18n.t("apiErrors.noRoom"));
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
        statusId: vars.statusId,
        rank,
      });

      return rank;
    },

    onMutate: async ({
      todos,
      activeTodo,
      columnId,
      statusId,
      index,
      rank: kept,
    }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos(boardId) });

      const previousTodos = queryClient.getQueryData<Todo[]>(
        queryKeys.todos(boardId),
      );

      // recomputed sync (not shared with mutationFn, which can go async on rebalance) — null means no room,
      // card stays put until onSuccess lands it, rare enough to be invisible
      const all = todos ?? [];
      const rank =
        kept ??
        rankForDrop(
          neighboursIn(all, columnId, activeTodo, workflow.statusById),
          index,
        );

      if (rank !== null) {
        queryClient.setQueryData<Todo[]>(
          queryKeys.todos(boardId),
          applyTodoMoved(todos, activeTodo, statusId, rank),
        );
      }

      return { previousTodos };
    },

    onSuccess: (rank, { activeTodo, statusId }) => {
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old) =>
        old ? applyTodoMoved(old, activeTodo, statusId, rank) : old,
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
