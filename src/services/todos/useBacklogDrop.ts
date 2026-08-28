import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { IColumn, Todo } from "@/types/data";
import { applyBacklogMoved, applyTodoUpdated } from "./cache";
import { sprintAssignmentPatch } from "./backlog";
import { updateTodo } from "./todoApi";

export interface BacklogDropVars {
  /** The board as it stands before the drop — every todo, unfiltered, the
   * same "whole board" shape `useTodoDrop`'s own `todos` is. */
  todos: Todo[];
  dragged: Todo;
  /** Destination section: a Sprint's id, or `null` for the ungrouped Backlog. */
  targetSectionId: string | null;
  activeSprintId: string | null;
  columns: IColumn[];
  /** The stored-list index `resolveDropIndex` already translated the gap
   * into — see `useBacklogDragEnd`. */
  dropIndex: number;
}

/**
 * The Backlog page's drop write path — `useTodoDrop.ts`'s counterpart for
 * this page's own data model.
 *
 * **Same mutation shape, same reason.** `useTodoDrop` pairs an optimistic
 * write with a snapshot so the card lands the instant the pointer releases
 * rather than waiting out a network round trip; before this, the Backlog's
 * drag went through generic `useUpdateTodo`, which has no `onMutate` at
 * all — nothing moved until the server answered, which is what read as lag
 * and a jump on drop. This gives the Backlog's own drag the identical
 * immediate-then-reconciled write.
 *
 * `sprintAssignmentPatch` is computed twice — once here in `onMutate`
 * (synchronous, so it lands in the same frame as the drop) and again in
 * `mutationFn` — rather than threaded through as shared state. Same choice
 * `useTodoDrop`'s own `resolveRank` makes, for the same reason: it is a pure
 * function of its arguments, so recomputing it costs nothing and keeps the
 * two paths from being coupled through a value neither strictly owns.
 *
 * **No rebalance-and-retry branch.** `useTodoDrop` rebalances a column and
 * retries once a rank gap is fully exhausted (~50 consecutive drops into one
 * gap) — a database RPC, deliberately out of scope for this pass. Exhaustion
 * here falls back to `backlogRankForAppend` (`sprintAssignmentPatch`'s own
 * `??`) instead. That is rare on its own terms, and rarer still now that
 * `backlogRank.ts` orders unranked rows by `created_at`: gaps between
 * untouched rows are milliseconds wide, which is thousands of midpoints, not
 * the single shared fallback value they used to collapse onto.
 */
export function useBacklogDrop() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: async ({
      todos,
      dragged,
      targetSectionId,
      activeSprintId,
      columns,
      dropIndex,
    }: BacklogDropVars) => {
      if (!boardId) throw new Error("useBacklogDrop ran without a board");

      const fields = sprintAssignmentPatch(
        dragged,
        targetSectionId,
        activeSprintId,
        columns,
        todos,
        dropIndex,
      );

      return updateTodo({ id: dragged.id, board_id: dragged.board_id, ...fields });
    },

    onMutate: async ({
      todos,
      dragged,
      targetSectionId,
      activeSprintId,
      columns,
      dropIndex,
    }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos(boardId) });

      const previousTodos = queryClient.getQueryData<Todo[]>(
        queryKeys.todos(boardId),
      );

      const fields = sprintAssignmentPatch(
        dragged,
        targetSectionId,
        activeSprintId,
        columns,
        todos,
        dropIndex,
      );

      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        applyBacklogMoved(todos, dragged.id, fields),
      );

      return { previousTodos };
    },

    onSuccess: (serverTodo) => {
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old = []) =>
        applyTodoUpdated(old, serverTodo),
      );

      // The detail panel and its History/All tab, if this item's is open —
      // the same reconciliation `useUpdateTodo` performs for every other
      // write this row can receive. A no-op when nothing has it open.
      queryClient.invalidateQueries({ queryKey: queryKeys.todo(serverTodo.id) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(serverTodo.id),
      });
    },

    // Restore only — the MutationCache handler in queryClient.ts already
    // toasts the failure.
    onError: (_err, _vars, context) => {
      if (!context) return;

      if (context.previousTodos) {
        queryClient.setQueryData(
          queryKeys.todos(boardId),
          context.previousTodos,
        );
        return;
      }

      queryClient.removeQueries({
        queryKey: queryKeys.todos(boardId),
        exact: true,
      });
    },
  });
}
