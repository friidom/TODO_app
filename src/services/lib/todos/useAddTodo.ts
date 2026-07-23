import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo } from "../../api/todoApi";
import type { IServiceTodo } from "../../../types/data";

export function useAddTodo() {
  const queryClient = useQueryClient();

  // return useMutation({
  //   mutationFn: addTodo,

  //   onSuccess: (newTodo) => {
  //     queryClient.setQueryData<IServiceTodo[]>(
  //       ["todos"],
  //       (old = []) => [newTodo , ...old]
  //     );
  //   },
  // });

  //? Optimistic Update
  return useMutation({
    mutationFn: addTodo,

    onMutate: async (title) => {
      //stop
      await queryClient.cancelQueries({
        queryKey: ["todos"],
      });

      //save old todos
      const previousTodos = queryClient.getQueryData<IServiceTodo[]>(["todos"]);

      //temp todo
      const optimisticTodo: IServiceTodo = {
        id: Date.now(),
        userId: 1,
        title,
        completed: false,
      };

      //add to chache
      queryClient.setQueryData<IServiceTodo[]>(["todos"], (old = []) => [
        optimisticTodo,
        ...old,
      ]);
      return {
        previousTodos,
        optimisticId: optimisticTodo.id,
      };
    },
    onError: (_error, _title, context) => {
      //error handeling 
      queryClient.setQueryData(["todos"], context?.previousTodos);
    },
    onSuccess: (serverTodo, _title, context) => {
      //change tmp with real data 
      queryClient.setQueryData<IServiceTodo[]>(["todos"], (old = []) =>
        old.map((todo) =>
          todo.id === context?.optimisticId
            ? {
                ...serverTodo,
                id: context.optimisticId,
              }
            : todo,
        ),
      );
    },
  });
}
