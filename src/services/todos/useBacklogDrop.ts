import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { IColumn, Todo } from "@/types/data";
import { applyBacklogMoved, applyTodoUpdated } from "./cache";
import { sprintAssignmentPatch } from "./backlog";
import { updateTodo } from "./todoApi";

export interface BacklogDropVars {
  todos: Todo[];
  dragged: Todo;
  targetSectionId: string | null;
  activeSprintId: string | null;
  columns: IColumn[];
  dropIndex: number;
}

// optimistic, same as useTodoDrop — without onMutate the card doesn't move until the server answers, which reads as lag
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

      queryClient.invalidateQueries({ queryKey: queryKeys.todo(serverTodo.id) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(serverTodo.id),
      });
    },

    // restore only — the global MutationCache handler already toasts the failure
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
