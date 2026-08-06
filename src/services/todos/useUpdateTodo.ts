import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodo } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { ISupabaseTodo } from "../../types/data";
import { useBoardId } from "@/hooks/useBoardId";

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: updateTodo,

    onSuccess: (updatedTodo) => {
      queryClient.setQueryData(
        queryKeys.todos(boardId),
        (old: ISupabaseTodo[] = []) =>
          old.map((todo) => (todo.id === updatedTodo.id ? updatedTodo : todo)),
      );
    },
  });
}
