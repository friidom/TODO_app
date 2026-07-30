import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addTodo } from "../../api/todoApi";
import type { ISupabaseTodo } from "../../../types/data";

export function useAddTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addTodo,

    //!? Optimistic update

    onMutate: async ({ title, status }) => {
      //before request
      //stop all queries
      await queryClient.cancelQueries({
        queryKey: ["todos"],
      });

      //previous Todos
      const previousTodos =
        queryClient.getQueryData<ISupabaseTodo[]>(["todos"]) ?? [];
      const columnTodos = previousTodos.filter(
        (todo) => todo.status === status,
      );
      const position = columnTodos.length;

      //temp todo 
      const optimisticTodo: ISupabaseTodo = {
        id: Date.now(),
        title,
        completed: false,
        user_id: "",
        created_at: new Date().toISOString(),
        position: position,
        status,
        previous_status: null,
      };

      //add a new temp todo
      queryClient.setQueryData<ISupabaseTodo[]>(
        ["todos"],
        [...previousTodos, optimisticTodo],
      );

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
          todo.id === context?.optimisticId ? serverTodo : todo,
        ),
      );
    },
  });
}

//success
