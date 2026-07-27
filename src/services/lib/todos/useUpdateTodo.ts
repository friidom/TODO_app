import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo } from "../../api/todoApi";
import type { ITodo } from "../../../types/data";

export function useUpdateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTodo,

    onSuccess: (updatedTodo) => {
      queryClient.setQueryData(["todos"], (old: ITodo[] = []) =>
        old.map((todo) => (todo.id === updatedTodo.id ? updatedTodo : todo)),
      );
    },
  });
}
