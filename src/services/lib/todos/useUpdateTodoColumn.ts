import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTodoColumn } from "../../api/todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useUpdateTodoColumn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      column_id,
    }: {
      id: number;
      column_id: string;
    }) => updateTodoColumn(id, column_id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos(),
      });
    },
  });
}
