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
        queryClient.getQueryData<Todo[]>(queryKeys.todos(boardId)) ?? [];

      //filtered todos
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
      // Drop the detail entry too (M5-06). Without this a task deleted from
      // the board behind an open panel leaves the panel rendering a ghost —
      // the row is gone from the board cache but its own entry still holds it,
      // and nothing refetches. Removing the entry makes the panel resolve to
      // null and show its not-found state.
      queryClient.removeQueries({ queryKey: queryKeys.todo(id), exact: true });
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos(boardId),
      });
    },
  });
}
