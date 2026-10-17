import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo, type TodoPatch } from "./todoApi";
import {
  applyDetailPatched,
  applyTodoPatched,
  applyTodoUpdated,
} from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Todo, TodoDetail } from "../../types/data";
import { useBoardId } from "@/hooks/useBoardId";

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationKey: ["todo-write"],
    mutationFn: updateTodo,

    // id and board_id ride along in the patch; both equal the row's, so they change nothing
    onMutate: async (patch: TodoPatch) => {
      const { id } = patch;
      const listKey = queryKeys.todos(boardId);
      const detailKey = queryKeys.todo(id);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ]);

      const previousTodos = queryClient.getQueryData<Todo[]>(listKey);
      const previousDetail = queryClient.getQueryData<TodoDetail>(detailKey);

      if (previousTodos) {
        queryClient.setQueryData<Todo[]>(
          listKey,
          applyTodoPatched(previousTodos, id, patch as Partial<Todo>),
        );
      }

      queryClient.setQueryData<TodoDetail>(detailKey, (old) =>
        applyDetailPatched(old, id, patch as Partial<TodoDetail>),
      );

      return { previousTodos, previousDetail };
    },

    onSuccess: (updatedTodo) => {
      queryClient.setQueryData(queryKeys.todos(boardId), (old: Todo[] = []) =>
        applyTodoUpdated(old, updatedTodo),
      );

      // the activity trigger runs in the same statement, so the row already exists by the time this fires
      queryClient.invalidateQueries({
        queryKey: queryKeys.todoActivities(updatedTodo.id),
      });
    },

    // restore only — the toast comes from the global MutationCache handler
    onError: (_err, { id }, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(
          queryKeys.todos(boardId),
          context.previousTodos,
        );
      }

      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.todo(id), context.previousDetail);
      }
    },

    // refetched, not patched from the response — that is the narrowed board shape, so merging it would blank the description
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todo(id) });
    },
  });
}
