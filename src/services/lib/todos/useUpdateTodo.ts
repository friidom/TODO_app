import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo } from "../../api/todoApi";
import type { ISupabaseTodo } from "../../../types/data";

export function useUpdateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTodo,

    onSuccess: (updatedTodo) => {
      queryClient.setQueryData(["todos"], (old: ISupabaseTodo[] = []) =>
        old.map((todo) => (todo.id === updatedTodo.id ? updatedTodo : todo)),
      );
    },
  });
}
