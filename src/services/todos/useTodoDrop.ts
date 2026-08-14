import { useMutation, useQueryClient } from "@tanstack/react-query";

import { moveTodo, rebalanceColumnRanks } from "@/services/todos/todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo } from "@/types/data";
import { rankForDrop } from "@/utils/rank";
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
 * The drop write path — **one row per drag** as of M6-04.
 *
 * It used to compute a whole new order for two columns and upsert every card in
 * both. That is the shape that loses data the moment two people share a board:
 * each client renumbers from its own snapshot, sends the lot, and last write
 * wins — so the second drag silently reverts cards the second person never
 * touched. A rank is a value the card carries, so a move writes one field on
 * one row and only a genuine same-card conflict can occur.
 *
 * The mutation shape is unchanged from M1-09: an optimistic write paired with a
 * snapshot, so a rejection puts the card back rather than leaving the board
 * showing an order the database never accepted.
 */
export function useTodoDrop() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  /**
   * The rank for this drop, rebalancing first if the gap has no room left.
   *
   * Exhaustion is roughly fifty consecutive drops into the *same* gap, at which
   * point no double exists strictly between the two neighbours. `rankForDrop`
   * reports that as null **before** anything is written, so the recovery is a
   * round trip rather than two cards sharing a rank — which would be exactly
   * the undefined order M6-A exists to remove.
   *
   * The retry is single: after a rebalance the column's ranks are whole
   * multiples of the gap again, so a second null would mean the rebalance did
   * not happen, and looping on it would spin.
   */
  const resolveRank = async ({
    todos,
    activeTodo,
    columnId,
    index,
  }: TodoDropVars) => {
    // The card cannot be its own neighbour: leaving it in would make a
    // same-column move compute the midpoint of the gap it already occupies.
    const destination = todos.filter(
      (todo) => todo.column_id === columnId && todo.id !== activeTodo.id,
    );

    const rank = rankForDrop(destination, index);

    if (rank !== null) return rank;

    await rebalanceColumnRanks(columnId);

    // Refetched rather than recomputed from the stale array: the server has
    // just rewritten every rank in this column, and the old numbers would
    // produce a rank between two values that no longer exist.
    const fresh =
      (await queryClient.fetchQuery<Todo[]>({
        queryKey: queryKeys.todos(boardId),
      })) ?? [];

    const respaced = fresh.filter(
      (todo) => todo.column_id === columnId && todo.id !== activeTodo.id,
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

      // Computed again here rather than shared with `mutationFn`: this one has
      // to be synchronous to land in the same frame as the drop, and the
      // exhaustion path is async. A null means "no room" — the card stays put
      // for the moment it takes the rebalance to run, then `onSuccess` writes
      // it where it landed. Rare enough to be invisible, and the alternative is
      // an optimistic position the server may not honour.
      const rank = rankForDrop(
        (todos ?? []).filter(
          (todo) => todo.column_id === columnId && todo.id !== activeTodo.id,
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

    // The rebalance path skipped the optimistic write, and the exhaustion path
    // refetched — either way the card's real rank is only known now.
    onSuccess: (rank, { activeTodo, columnId }) => {
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old) =>
        old ? applyTodoMoved(old, activeTodo, columnId, rank) : old,
      );
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
