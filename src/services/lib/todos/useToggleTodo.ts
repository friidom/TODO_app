import type { IServiceTodo } from "../../../types/data";
import { toggleTodo } from "../../api/todoApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useToggleTodo() {
  const queryClient = useQueryClient();

  //? Optimistic Update
  return useMutation({
    mutationFn: toggleTodo,

    onMutate: async (todo) => {
      await queryClient.cancelQueries({
        queryKey: ["todos"],
      });

      const previousTodos = queryClient.getQueryData<IServiceTodo[]>(["todos"]);

      queryClient.setQueryData<IServiceTodo[]>(["todos"], (old = []) =>
        old.map((t) =>
          t.id === todo.id
            ? {
                ...t,
                completed: !t.completed,
              }
            : t,
        ),
      );

      return { previousTodos };
    },

    onError: (_error, _todo, context) => {
      queryClient.setQueryData(["todos"], context?.previousTodos);
    },

    onSuccess: () => {
      // ничего
    },
  });
}
