import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodoColumn } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useBoardId } from "@/hooks/useBoardId";

export function useUpdateTodoColumn() {
  const queryClient = useQueryClient();
  const boardId = useBoardId();

  return useMutation({
    mutationFn: ({ id, column_id }: { id: number; column_id: string }) =>
      updateTodoColumn(id, column_id),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos(boardId) });
    },
  });
}
