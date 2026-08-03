import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo } from "../../api/todoApi";
import type { ISupabaseTodo } from "../../../types/data";

export function useAddTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addTodo,

    //!? Optimistic update

    onMutate: async ({ title, column_id }) => {
      //before request
      //stop all queries
      await queryClient.cancelQueries({
        queryKey: ["todos"],
      });

      //previous Todos
      const previousTodos =
        queryClient.getQueryData<ISupabaseTodo[]>(["todos"]) ?? [];

      const columnTodos = previousTodos.filter(
        (todo) => todo.column_id === column_id,
      );

      //position of the new todo
      const position =
        columnTodos.length > 0
          ? Math.max(...columnTodos.map((todo) => todo.position)) + 1
          : 0;

      //temp todo
      const optimisticTodo: ISupabaseTodo = {
        id: Date.now(),
        title,
        completed: false,
        user_id: "",
        created_at: new Date().toISOString(),
        position: position,
        column_id,
        isOptimistic: true,
      };

      //find last todo
      const lastIndex = previousTodos.reduce(
        (lastIndex, todo, index) =>
          todo.column_id === column_id ? index : lastIndex,
        -1,
      );

      //adding in the end of todos of that column
      const newTodos = [...previousTodos];

      newTodos.splice(lastIndex + 1, 0, optimisticTodo);

      queryClient.setQueryData<ISupabaseTodo[]>(["todos"], newTodos);

      //context
      return {
        previousTodos,
        optimisticId: optimisticTodo.id,
      };
    },

    //error
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(["todos"], context?.previousTodos);
    },

    //success
    onSuccess: (serverTodo, _variables, context) => {
      queryClient.setQueryData<ISupabaseTodo[]>(["todos"], (old = []) =>
        old.map((todo) =>
          todo.id === context?.optimisticId
            ? {
                ...serverTodo,
                isOptimistic: false,
              }
            : todo,
        ),
      );
    },
  });
}

//success
