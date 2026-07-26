import type { IServiceTodo } from "../../../types/data";
import { deleteTodo } from "../../api/todoApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useDeleteTodo() {
  const queryClient = useQueryClient();

  //? Optimistic Update
  
  return useMutation({
    mutationFn: deleteTodo,

    // onMutate: async (id) => {
    //   await queryClient.cancelQueries({
    //     queryKey: ["todos"],
    //   });

    //   const previousTodos = queryClient.getQueryData<IServiceTodo[]>(["todos"]);

    //   queryClient.setQueryData<IServiceTodo[]>(["todos"], (old = []) =>
    //     old.filter((todo) => todo.id !== id),
    //   );
    //   return { previousTodos };
    // },
    // onError: (_error, _id, context) => {
    //   queryClient.setQueryData(["todos"], context?.previousTodos);
      
    // },
    
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ["todos"]})
    }
  });
}
