import { type ISupabaseTodo } from "../../types/data";
import { deleteTodo } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useDeleteTodo() {
  const queryClient = useQueryClient();

  //? Optimistic Update

  return useMutation({
    mutationFn: deleteTodo,

    //before request
    onMutate: async (id) => {
      //stop all quaries
      await queryClient.cancelQueries({
        queryKey: queryKeys.todos(),
      });

      const previousTodos =
        queryClient.getQueryData<ISupabaseTodo[]>(queryKeys.todos()) ?? [];

      //filtered todos
      queryClient.setQueryData<ISupabaseTodo[]>(queryKeys.todos(), (old = []) =>
        old.filter((todo) => todo.id !== id),
      );

      return { previousTodos };
    },
    onError: (_err, _id, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(queryKeys.todos(), context.previousTodos);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos(),
      });
    },
  });
}
