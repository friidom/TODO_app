import { type Todo } from "../../types/data";
import { deleteTodo } from "./todoApi";
import { applyTodoDeleted } from "./cache";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBoardId } from "@/hooks/useBoardId";

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  //? Optimistic Update

  return useMutation({
    mutationFn: deleteTodo,

    //before request
    onMutate: async (id) => {
      //stop all quaries
      await queryClient.cancelQueries({
        queryKey: queryKeys.todos(boardId),
      });

      const previousTodos =
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ??
        [];

      //filtered todos
      queryClient.setQueryData<Todo[]>(
        queryKeys.todos(boardId),
        (old = []) => applyTodoDeleted(old, id),
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

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos(boardId),
      });
    },
  });
}
