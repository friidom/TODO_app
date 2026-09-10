import { type Todo } from "../../types/data";
import { deleteTodo } from "./todoApi";
import { applyTodoDeleted } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBoardId } from "@/hooks/useBoardId";

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: deleteTodo,

    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.todos(boardId),
      });

      const previousTodos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      queryClient.setQueryData<Todo[]>(queryKeys.todos(boardId), (old = []) =>
        applyTodoDeleted(old, id),
      );

      return { previousTodos };
    },
    onError: (_err, _id, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(
          queryKeys.todos(boardId),
          context.previousTodos,
        );
      }
    },

    onSuccess: (id) => {
      // also drop the detail entry, or an open panel keeps rendering the deleted row as a ghost
      queryClient.removeQueries({ queryKey: queryKeys.todo(id), exact: true });
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos(boardId),
      });
    },
  });
}
