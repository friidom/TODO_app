import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearCompleted } from "./todoApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useClearCompleted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearCompleted,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos(),
      });
    },
  });
}
