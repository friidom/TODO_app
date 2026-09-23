import { useMutation, useQueryClient } from "@tanstack/react-query";

import { DEFAULT_WORK_TYPE } from "@/constants/workTypes";
import { useBoardId } from "@/hooks/useBoardId";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo } from "@/types/data";
import { applySubtaskInserted, applyTodoUpdated } from "./cache";
import { addTodo } from "./todoApi";

export interface AddSubtaskVars {
  title: string;
  parentId: string;
  columnId: string;
}

// Separate from useAddTodo on purpose — a subtask has no board position, so none of that mutation's rank/reorder machinery applies.
export function useAddSubtask() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  const mutation = useMutation({
    mutationFn: ({
      id,
      title,
      parentId,
      columnId,
    }: AddSubtaskVars & { id: string }) => {
      if (!boardId) throw new Error("useAddSubtask ran without a board");

      return addTodo({
        id,
        title,
        column_id: columnId,
        board_id: boardId,
        parent_id: parentId,
        type: DEFAULT_WORK_TYPE,
      });
    },

    onMutate: async ({ id, title, parentId, columnId }) => {
      if (!boardId) throw new Error("useAddSubtask ran without a board");

      await queryClient.cancelQueries({ queryKey: queryKeys.todos(boardId) });

      const previousTodos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      const optimistic: Todo = {
        id,
        title,
        board_id: boardId,
        column_id: columnId,
        parent_id: parentId,
        board_key: null,
        type: DEFAULT_WORK_TYPE,
        priority: null,
        assignee_id: null,
        estimate: null,
        start_date: null,
        due_date: null,
        position: null,
        rank: null,
        created_at: new Date().toISOString(),
        updated_at: null,
        sprint_id: null,
        backlog_rank: null,
        creator_id: null,
        completed_at: null,
      };

      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        applySubtaskInserted(previousTodos, optimistic),
      );

      return { previousTodos };
    },

    onError: (_err, _vars, context) => {
      if (!context) return;

      queryClient.setQueryData(queryKeys.todos(boardId), context.previousTodos);
    },

    onSuccess: (serverTodo) => {
      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old = []) =>
        applyTodoUpdated(old, serverTodo),
      );

      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(serverTodo.parent_id ?? undefined),
      });
    },
  });

  const mutate = (variables: AddSubtaskVars) =>
    mutation.mutate({ ...variables, id: crypto.randomUUID() });

  return { ...mutation, mutate };
}
