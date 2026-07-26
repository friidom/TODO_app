import type { IServiceTodo } from "../../../types/data";
import { deleteTodo } from "../../api/todoApi";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useDeleteTodo() {
  const queryClient = useQueryClient();

  //? Optimistic Update
 
    
  return useMutation({
    mutationFn: deleteTodo,

  
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ["todos"]})
    }
    
  });
}
  