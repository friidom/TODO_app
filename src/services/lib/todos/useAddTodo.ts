
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo } from "../../api/todoApi";
import type { ISupabaseTodo } from "../../../types/data";

export function useAddTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addTodo,

    onMutate: async (title) => {
      await queryClient.cancelQueries({
        queryKey: ["todos"],
      });

      const previousTodos =
        queryClient.getQueryData<ISupabaseTodo[]>(["todos"]) ?? [];

      const optimisticTodo: ISupabaseTodo = {
        id: Date.now(),
        title,
        completed: false,
        user_id: "",
        created_at: new Date().toISOString(),
        position: previousTodos.length,
        status: "todo",
        previous_status: null
      };

      queryClient.setQueryData<ISupabaseTodo[]>(
        ["todos"],
        [...previousTodos, optimisticTodo]
      );

      return {
        previousTodos,
        optimisticId: optimisticTodo.id,
      };
    },

    onError: (_err, _title, context) => {
      queryClient.setQueryData(["todos"], context?.previousTodos);
    },

    onSuccess: (serverTodo, _title, context) => {
      queryClient.setQueryData<ISupabaseTodo[]>(["todos"], (old = []) =>
        old.map((todo) =>
          todo.id === context?.optimisticId ? serverTodo : todo
        )
      );
    },
  });
}