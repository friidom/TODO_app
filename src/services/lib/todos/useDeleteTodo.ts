import {type ISupabaseTodo, type IServiceTodo } from "../../../types/data";
import { deleteTodo } from "../../api/todoApi";
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
        queryKey: ["todos"],
      });

      const previousTodos =
        queryClient.getQueryData<ISupabaseTodo[]>(["todos"]) ?? [];

      //filtered todos
      queryClient.setQueryData<ISupabaseTodo[]>(["todos"], (old = []) =>
        old.filter((todo) => todo.id !== id),
      );

      return { previousTodos };
    },
    onError: (_err, _id, context) => {
      context?.previousTodos &&
        queryClient.setQueryData(["todos"], context.previousTodos);
    },

    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["todos"],
      });
    },
  });
}
