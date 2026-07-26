import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reorderTodos } from "../../api/todoApi";
import type { ISupabaseTodo } from "../../../types/data";

export function useSaveTodoOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (todos: ISupabaseTodo[]) => reorderTodos(todos),

    onError: () => {
      queryClient.invalidateQueries({
        queryKey: ["todos"],
      });
    },
  });
}